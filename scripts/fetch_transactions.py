#!/usr/bin/env python3
"""Fetch ESPN league transactions and normalize to the Supabase archive shape.

Reads ESPN_S2 / ESPN_SWID / ESPN_LEAGUE_ID from the environment.
Writes a JSON artifact with `transactions` and `items` arrays suitable for
upsert into public.league_transactions / public.league_transaction_items.
Never writes credentials or the raw ESPN response unless --keep-raw-items.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_LEAGUE_ID = 1237285
DEFAULT_SEASON = 2026
BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"
MAX_ATTEMPTS = 3
TIMEOUT_SECONDS = 30

# ESPN sometimes returns numeric type codes; map the common ones.
TYPE_CODES = {
    0: "TRADE_ACCEPT",  # seen in some seasons as completed trade bucket; overridden by status below
    1: "FREEAGENT",
    2: "WAIVER",
    4: "TRADE",
    5: "ROSTER",
}


def _int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def espn_get(url: str) -> dict[str, Any]:
    cookies = {}
    if os.getenv("ESPN_S2"):
        cookies["espn_s2"] = os.environ["ESPN_S2"]
    if os.getenv("ESPN_SWID"):
        cookies["SWID"] = os.environ["ESPN_SWID"]
    headers = {"Accept": "application/json", "User-Agent": "1048Gate-transactions/1.0"}
    request = urllib.request.Request(url, headers=headers)
    if cookies:
        request.add_header("Cookie", "; ".join(f"{k}={v}" for k, v in cookies.items()))
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                if response.status != 200:
                    raise RuntimeError(f"ESPN HTTP {response.status}")
                payload = json.load(response)
                if not isinstance(payload, dict):
                    raise RuntimeError("ESPN returned a non-object response")
                return payload
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
            last_error = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(min(2 ** (attempt - 1), 8))
    raise RuntimeError(f"ESPN request failed after {MAX_ATTEMPTS} attempts: {last_error}")


def team_names(payload: dict[str, Any]) -> dict[int, str]:
    names: dict[int, str] = {}
    for team in payload.get("teams") or []:
        if not isinstance(team, dict) or team.get("id") is None:
            continue
        tid = int(team["id"])
        name = (team.get("name") or team.get("location") or f"Team {tid}").strip()
        names[tid] = name
    return names


def player_names(payload: dict[str, Any]) -> dict[int, str]:
    names: dict[int, str] = {}
    # mTransactions2 sometimes embeds players; kona_playerinfo may be absent.
    for entry in payload.get("players") or []:
        if not isinstance(entry, dict):
            continue
        player = entry.get("player") if isinstance(entry.get("player"), dict) else entry
        pid = _int(player.get("id") or entry.get("id"))
        name = player.get("fullName") or player.get("name")
        if pid is not None and name:
            names[pid] = str(name).strip()
    return names


def normalize_type(raw: Any, status: str | None) -> str:
    if isinstance(raw, str) and raw.strip():
        return raw.strip().upper()
    code = _int(raw)
    if code in TYPE_CODES:
        return TYPE_CODES[code]
    if status and "ACCEPT" in status.upper():
        return "TRADE_ACCEPT"
    return str(raw or "UNKNOWN")


def normalize_item_type(raw: Any) -> str | None:
    if isinstance(raw, str) and raw.strip():
        return raw.strip().upper()
    code = _int(raw)
    # ESPN item type codes commonly: 1=ADD, 2=DROP, 3=TRADE
    return {1: "ADD", 2: "DROP", 3: "TRADE"}.get(code) if code is not None else None


def related_transaction_id(tx: dict[str, Any]) -> str | None:
    for key in ("relatedTransactionId", "relatedTransactionIds"):
        value = tx.get(key)
        if isinstance(value, list) and value:
            return str(value[0])
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def normalize_transactions(payload: dict[str, Any], season: int, league_id: int) -> dict[str, Any]:
    teams = team_names(payload)
    players = player_names(payload)
    transactions: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []

    for tx in payload.get("transactions") or []:
        if not isinstance(tx, dict):
            continue
        tx_id = str(tx.get("id") or "").strip()
        if not tx_id:
            continue
        status = tx.get("status")
        if isinstance(status, dict):
            status = status.get("type") or status.get("name")
        status_text = str(status).strip().upper() if status is not None else None
        tx_type = normalize_type(tx.get("type"), status_text)
        # Prefer TRADE_ACCEPT when ESPN marks a completed trade acceptance.
        if tx_type in {"TRADE", "PENDING_TRADE"} and status_text in {"EXECUTED", "ACCEPTED", None}:
            if related_transaction_id(tx) or tx.get("executionType") == "TRADE_ACCEPT":
                tx_type = "TRADE_ACCEPT"
        team_id = _int(tx.get("teamId"))
        date_ms = _int(tx.get("processDate") or tx.get("proposedDate") or tx.get("executionDate"))
        related = related_transaction_id(tx)
        raw_slim = {
            "id": tx_id,
            "type": tx.get("type"),
            "status": status_text,
            "teamId": team_id,
            "scoringPeriodId": tx.get("scoringPeriodId"),
            "bidAmount": tx.get("bidAmount"),
            "processDate": date_ms,
        }
        if related:
            raw_slim["relatedTransactionId"] = related

        tx_items = [item for item in (tx.get("items") or []) if isinstance(item, dict)]
        transactions.append({
            "season_year": season,
            "espn_transaction_id": tx_id,
            "scoring_period": _int(tx.get("scoringPeriodId")),
            "transaction_type": tx_type,
            "status": status_text,
            "team_id": team_id,
            "team_name": teams.get(team_id) if team_id is not None else None,
            "member_id": None,
            "bid_amount": tx.get("bidAmount"),
            "transaction_date_ms": date_ms,
            "transaction_date": datetime.fromtimestamp(date_ms / 1000, tz=timezone.utc).isoformat() if date_ms else None,
            "item_count": len(tx_items),
            "raw_data": raw_slim,
        })

        for index, item in enumerate(tx_items):
            pid = _int(item.get("playerId"))
            from_id = _int(item.get("fromTeamId"))
            to_id = _int(item.get("toTeamId"))
            items.append({
                "season_year": season,
                "espn_transaction_id": tx_id,
                "item_index": index,
                "item_type": normalize_item_type(item.get("type")),
                "player_id": pid,
                "player_name": players.get(pid) if pid is not None else None,
                "from_team_id": from_id,
                "from_team_name": teams.get(from_id) if from_id not in (None, 0) else ("" if from_id == 0 else None),
                "to_team_id": to_id,
                "to_team_name": teams.get(to_id) if to_id not in (None, 0) else ("" if to_id == 0 else None),
                "raw_data": {
                    "type": item.get("type"),
                    "playerId": pid,
                    "fromTeamId": from_id,
                    "toTeamId": to_id,
                },
            })

    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "league_id": league_id,
        "season": season,
        "source": "ESPN mTransactions2",
        "transaction_count": len(transactions),
        "item_count": len(items),
        "transactions": transactions,
        "items": items,
    }


def fetch_payload(season: int, league_id: int) -> dict[str, Any]:
    query = urllib.parse.urlencode([
        ("view", "mTransactions2"),
        ("view", "mTeam"),
    ])
    url = f"{BASE}/seasons/{season}/segments/0/leagues/{league_id}?{query}"
    return espn_get(url)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=int(os.getenv("ESPN_SEASON", DEFAULT_SEASON)))
    parser.add_argument("--league-id", type=int, default=int(os.getenv("ESPN_LEAGUE_ID", DEFAULT_LEAGUE_ID)))
    parser.add_argument("--output", type=Path, help="Write normalized JSON here")
    args = parser.parse_args()
    if not os.getenv("ESPN_S2") or not os.getenv("ESPN_SWID"):
        print("ESPN_S2 and ESPN_SWID must be set for this private league.", file=sys.stderr)
        return 2
    try:
        payload = fetch_payload(args.season, args.league_id)
        result = normalize_transactions(payload, args.season, args.league_id)
    except (RuntimeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
        print(f"Wrote {args.output}: {result['transaction_count']} transactions, {result['item_count']} items")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
