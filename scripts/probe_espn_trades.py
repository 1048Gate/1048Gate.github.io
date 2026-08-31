#!/usr/bin/env python3
"""Recover display-safe historical trade detail from ESPN.

The private-league cookies are read only from the environment. Raw ESPN
responses, member identifiers, and cookies are never written to disk.
"""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"
DEFAULT_LEAGUE_ID = 1237285
TRADE_TYPES = {
    "TRADE_PROPOSAL",
    "TRADE_ACCEPT",
    "TRADE_UPHOLD",
    "TRADE_VETO",
    "TRADE_DECLINE",
}
TIMEOUT_SECONDS = 30
MAX_ATTEMPTS = 3


def request_json(url: str, filter_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    cookies = {
        "espn_s2": os.environ.get("ESPN_S2", ""),
        "SWID": os.environ.get("ESPN_SWID", "") or os.environ.get("SWID", ""),
    }
    if not all(cookies.values()):
        raise RuntimeError("ESPN_S2 and ESPN_SWID are required for this private league")
    headers = {
        "Accept": "application/json",
        "User-Agent": "1048Gate-trade-recovery/1.0",
        "Cookie": "; ".join(f"{key}={value}" for key, value in cookies.items()),
    }
    if filter_payload is not None:
        headers["x-fantasy-filter"] = json.dumps(filter_payload, separators=(",", ":"))
    request = urllib.request.Request(url, headers=headers)
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
                time.sleep(min(2 ** (attempt - 1), 4))
    raise RuntimeError(f"ESPN request failed after {MAX_ATTEMPTS} attempts: {last_error}")


def transaction_candidates(value: Any):
    """Yield transaction-shaped dictionaries without retaining raw payloads."""
    if isinstance(value, dict):
        kind = str(value.get("type") or value.get("transactionType") or "").upper()
        transaction_shape = any(
            key in value
            for key in (
                "relatedTransactionId",
                "proposedDate",
                "processDate",
                "executionType",
                "items",
                "teamActions",
            )
        )
        if kind in TRADE_TYPES and transaction_shape:
            yield value
        for nested in value.values():
            yield from transaction_candidates(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from transaction_candidates(nested)


def normalize_item(item: dict[str, Any], team_names: dict[int, str]) -> dict[str, Any] | None:
    action = str(item.get("type") or item.get("action") or "").upper()
    if action not in {"TRADE", "ADD", "DROP"}:
        return None
    player_id = item.get("playerId")
    player_name = item.get("playerName")
    player_pool = item.get("playerPoolEntry") or {}
    player = player_pool.get("player") or {}
    player_id = player_id if player_id is not None else player.get("id")
    player_name = player_name or player.get("fullName") or player.get("name")
    from_team = item.get("fromTeamId")
    to_team = item.get("toTeamId")
    return {
        "action": action,
        "player_id": player_id,
        "player_name": player_name,
        "from_team_id": from_team,
        "from_team_name": team_names.get(int(from_team)) if from_team is not None else None,
        "to_team_id": to_team,
        "to_team_name": team_names.get(int(to_team)) if to_team is not None else None,
    }


def normalize_transaction(
    row: dict[str, Any], season: int, team_names: dict[int, str]
) -> dict[str, Any] | None:
    transaction_id = str(row.get("id") or row.get("transactionId") or "").strip()
    kind = str(row.get("type") or row.get("transactionType") or "").upper()
    if not transaction_id or kind not in TRADE_TYPES:
        return None
    items = []
    for raw_item in row.get("items") or []:
        if not isinstance(raw_item, dict):
            continue
        item = normalize_item(raw_item, team_names)
        if item:
            items.append(item)
    team_id = row.get("teamId")
    related_id = row.get("relatedTransactionId")
    return {
        "season_year": season,
        "transaction_id": transaction_id,
        "related_transaction_id": str(related_id).strip() if related_id else None,
        "transaction_type": kind,
        "status": row.get("status"),
        "execution_type": row.get("executionType"),
        "scoring_period": row.get("scoringPeriodId") or row.get("scoringPeriod"),
        "team_id": team_id,
        "team_name": team_names.get(int(team_id)) if team_id is not None else None,
        "proposed_date_ms": row.get("proposedDate"),
        "process_date_ms": row.get("processDate"),
        "items": items,
    }


def transaction_filter(include_types: bool = True) -> dict[str, Any]:
    criteria: dict[str, Any] = {
        "filterIncludeDetail": {"value": True},
        "limit": 1000,
        "offset": 0,
        "sortExecDate": {"sortPriority": 1, "sortAsc": True},
    }
    if include_types:
        criteria["filterType"] = {"value": sorted(TRADE_TYPES)}
    return {"transactions": criteria}


def league_url(season: int, league_id: int, views: list[str], period: int | None = None) -> str:
    query: list[tuple[str, str]] = [("view", view) for view in views]
    if period is not None:
        query.append(("scoringPeriodId", str(period)))
    return (
        f"{BASE}/seasons/{season}/segments/0/leagues/{league_id}?"
        f"{urllib.parse.urlencode(query)}"
    )


def recover_season(season: int, league_id: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    requests = 0
    errors: list[str] = []
    recovered: dict[str, dict[str, Any]] = {}

    # Team names make the sanitized artifact useful without exposing owner IDs.
    team_payload = request_json(league_url(season, league_id, ["mTeam"]))
    requests += 1
    team_names = {
        int(team["id"]): str(team.get("name") or team.get("location") or f"Team {team['id']}")
        for team in team_payload.get("teams", [])
        if isinstance(team, dict) and team.get("id") is not None
    }

    strategies = [
        ("all-periods-filtered", None, transaction_filter(True)),
        ("all-periods-untyped", None, transaction_filter(False)),
    ]
    strategies.extend(
        (f"period-{period}", period, transaction_filter(True)) for period in range(1, 19)
    )

    strategy_counts: dict[str, int] = {}
    for label, period, filters in strategies:
        try:
            payload = request_json(
                league_url(season, league_id, ["mTransactions2"], period), filters
            )
            requests += 1
            before = len(recovered)
            for raw in transaction_candidates(payload):
                normalized = normalize_transaction(raw, season, team_names)
                if not normalized:
                    continue
                existing = recovered.get(normalized["transaction_id"])
                if existing is None or len(normalized["items"]) > len(existing["items"]):
                    recovered[normalized["transaction_id"]] = normalized
            strategy_counts[label] = len(recovered) - before
        except Exception as exc:  # Continue through alternate historical query shapes.
            errors.append(f"{label}: {type(exc).__name__}: {exc}")

    rows = sorted(
        recovered.values(),
        key=lambda row: (
            int(row.get("process_date_ms") or row.get("proposed_date_ms") or 0),
            row["transaction_id"],
        ),
    )
    summary = {
        "season_year": season,
        "request_count": requests,
        "team_count": len(team_names),
        "transaction_count": len(rows),
        "type_counts": dict(sorted(Counter(row["transaction_type"] for row in rows).items())),
        "trade_item_count": sum(
            item["action"] == "TRADE" for row in rows for item in row["items"]
        ),
        "proposal_count_with_trade_items": sum(
            row["transaction_type"] == "TRADE_PROPOSAL"
            and any(item["action"] == "TRADE" for item in row["items"])
            for row in rows
        ),
        "strategy_new_transaction_counts": strategy_counts,
        "errors": errors,
    }
    return rows, summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league-id", type=int, default=int(os.getenv("ESPN_LEAGUE_ID") or DEFAULT_LEAGUE_ID))
    parser.add_argument("--start", type=int, default=2019)
    parser.add_argument("--end", type=int, default=2025)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    if not os.getenv("ESPN_S2") or not (os.getenv("ESPN_SWID") or os.getenv("SWID")):
        raise SystemExit("Protected ESPN credentials are not configured")

    all_rows: list[dict[str, Any]] = []
    seasons: list[dict[str, Any]] = []
    for season in range(args.start, args.end + 1):
        rows, summary = recover_season(season, args.league_id)
        all_rows.extend(rows)
        seasons.append(summary)
        print(
            f"{season}: {summary['transaction_count']} trade events; "
            f"{summary['trade_item_count']} player movements; {len(summary['errors'])} query errors"
        )

    generated_at = datetime.now(timezone.utc).isoformat()
    result = {
        "schema_version": 1,
        "generated_at": generated_at,
        "league_id": args.league_id,
        "seasons": [args.start, args.end],
        "source": "Authenticated ESPN mTransactions2; display-safe normalized fields only",
        "transactions": all_rows,
    }
    summary = {
        "schema_version": 1,
        "generated_at": generated_at,
        "league_id": args.league_id,
        "seasons": seasons,
        "total_transaction_count": len(all_rows),
        "total_trade_item_count": sum(s["trade_item_count"] for s in seasons),
        "credential_values_written": False,
        "raw_responses_written": False,
    }
    (args.output / "transactions.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (args.output / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
