#!/usr/bin/env python3
"""Fetch ESPN player-card transaction history for controlled trade-archive recovery.

This script is intentionally audit-only: it reads ESPN data, normalizes and
deduplicates transaction records, and writes a local JSON artifact. It never
writes to Supabase and never writes credentials or raw ESPN responses.
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
DEFAULT_SEASON = 2025
BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"
MAX_ATTEMPTS = 3
TIMEOUT_SECONDS = 30


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _player_payload(entry: dict[str, Any]) -> dict[str, Any]:
    value = entry.get("player")
    return value if isinstance(value, dict) else {}


def _player_id(entry: dict[str, Any]) -> int | None:
    player = _player_payload(entry)
    return _int_or_none(entry.get("id") or entry.get("playerId") or player.get("id") or player.get("playerId"))


def _player_name(entry: dict[str, Any]) -> str | None:
    player = _player_payload(entry)
    value = entry.get("fullName") or entry.get("name") or player.get("fullName") or player.get("name")
    return str(value).strip() if value else None


def _transactions(entry: dict[str, Any]) -> list[dict[str, Any]]:
    player = _player_payload(entry)
    value = entry.get("transactions")
    if not isinstance(value, list):
        value = player.get("transactions")
    return [item for item in (value or []) if isinstance(item, dict)]


def _item_key(item: dict[str, Any]) -> tuple[Any, ...]:
    return (
        item.get("type"),
        _int_or_none(item.get("playerId")),
        _int_or_none(item.get("fromTeamId")),
        _int_or_none(item.get("toTeamId")),
        _int_or_none(item.get("fromLineupSlotId")),
        _int_or_none(item.get("toLineupSlotId")),
        _int_or_none(item.get("overallPickNumber")),
    )


def normalize_playercard(payload: dict[str, Any], season: int, league_id: int) -> dict[str, Any]:
    entries = payload.get("players")
    if not isinstance(entries, list):
        raise ValueError("ESPN player-card response did not contain a players list")

    names: dict[int, str] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        pid = _player_id(entry)
        name = _player_name(entry)
        if pid is not None and name:
            names[pid] = name

    events: dict[str, dict[str, Any]] = {}
    observations = 0
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        primary_id = _player_id(entry)
        if primary_id is None:
            continue
        for transaction in _transactions(entry):
            items = [item for item in transaction.get("items", []) if isinstance(item, dict)]
            # A player card can include a paired/context move. Only accept the
            # transaction as an observation when the card's own player appears.
            if not any(_int_or_none(item.get("playerId")) == primary_id for item in items):
                continue
            transaction_id = str(transaction.get("id") or "").strip()
            if not transaction_id:
                continue
            observations += 1
            event = events.setdefault(transaction_id, {
                "espn_transaction_id": transaction_id,
                "transaction_type": transaction.get("type"),
                "status": transaction.get("status"),
                "team_id": _int_or_none(transaction.get("teamId")),
                "scoring_period": _int_or_none(transaction.get("scoringPeriodId")),
                "transaction_date_ms": _int_or_none(transaction.get("processDate") or transaction.get("proposedDate")),
                "related_transaction_id": transaction.get("relatedTransactionId"),
                "items": {},
                "observed_on_player_ids": set(),
            })
            event["observed_on_player_ids"].add(primary_id)
            for source_key, output_key in (
                ("type", "transaction_type"),
                ("status", "status"),
                ("teamId", "team_id"),
                ("scoringPeriodId", "scoring_period"),
                ("relatedTransactionId", "related_transaction_id"),
            ):
                value = transaction.get(source_key)
                if event.get(output_key) is None and value is not None:
                    event[output_key] = _int_or_none(value) if output_key in {"team_id", "scoring_period"} else value
            if event.get("transaction_date_ms") is None:
                event["transaction_date_ms"] = _int_or_none(transaction.get("processDate") or transaction.get("proposedDate"))
            for item in items:
                pid = _int_or_none(item.get("playerId"))
                key = _item_key(item)
                event["items"][key] = {
                    "item_type": item.get("type"),
                    "player_id": pid,
                    "player_name": names.get(pid) if pid is not None else None,
                    "from_team_id": _int_or_none(item.get("fromTeamId")),
                    "to_team_id": _int_or_none(item.get("toTeamId")),
                    "from_lineup_slot_id": _int_or_none(item.get("fromLineupSlotId")),
                    "to_lineup_slot_id": _int_or_none(item.get("toLineupSlotId")),
                    "overall_pick_number": _int_or_none(item.get("overallPickNumber")),
                }

    normalized_events = []
    for event in events.values():
        event["items"] = sorted(
            event["items"].values(),
            key=lambda item: (
                item.get("player_id") is None,
                item.get("player_id") or 0,
                str(item.get("item_type") or ""),
                item.get("from_team_id") or 0,
                item.get("to_team_id") or 0,
            ),
        )
        event["observed_on_player_ids"] = sorted(event["observed_on_player_ids"])
        event["has_team_to_team_move"] = any(
            (item.get("from_team_id") or 0) > 0 and (item.get("to_team_id") or 0) > 0
            for item in event["items"]
        )
        normalized_events.append(event)

    normalized_events.sort(
        key=lambda event: (-(event.get("transaction_date_ms") or 0), event["espn_transaction_id"])
    )
    return {
        "schema_version": 1,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "league_id": league_id,
        "season": season,
        "source": "ESPN kona_playercard",
        "player_count": len(names),
        "transaction_observation_count": observations,
        "transaction_count": len(normalized_events),
        "team_to_team_transaction_count": sum(1 for event in normalized_events if event["has_team_to_team_move"]),
        "transactions": normalized_events,
    }


def _request(url: str, fantasy_filter: dict[str, Any]) -> dict[str, Any]:
    cookies = {}
    if os.getenv("ESPN_S2"):
        cookies["espn_s2"] = os.environ["ESPN_S2"]
    if os.getenv("ESPN_SWID"):
        cookies["SWID"] = os.environ["ESPN_SWID"]
    if not cookies.get("espn_s2") or not cookies.get("SWID"):
        raise RuntimeError("ESPN_S2 and ESPN_SWID must be set for this private league.")

    headers = {
        "Accept": "application/json",
        "User-Agent": "1048Gate-trade-recovery/1.0",
        "X-Fantasy-Filter": json.dumps(fantasy_filter, separators=(",", ":")),
    }
    request = urllib.request.Request(url, headers=headers)
    request.add_header("Cookie", "; ".join(f"{key}={value}" for key, value in cookies.items()))
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                if response.status != 200:
                    raise RuntimeError(f"ESPN HTTP {response.status}")
                payload = json.load(response)
                if not isinstance(payload, dict):
                    raise RuntimeError("ESPN returned a non-object player-card response")
                return payload
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
            last_error = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(min(2 ** (attempt - 1), 8))
    raise RuntimeError(f"ESPN player-card request failed after {MAX_ATTEMPTS} attempts: {last_error}")


def fetch_playercard(season: int, league_id: int, limit: int) -> dict[str, Any]:
    url = f"{BASE}/seasons/{season}/segments/0/leagues/{league_id}?{urllib.parse.urlencode({'view': 'kona_playercard'})}"
    fantasy_filter = {
        "players": {
            "limit": limit,
            "sortDraftRanks": {"sortPriority": 100, "sortAsc": True, "value": "STANDARD"},
        }
    }
    return _request(url, fantasy_filter)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=int(os.getenv("ESPN_SEASON", DEFAULT_SEASON)))
    parser.add_argument("--league-id", type=int, default=int(os.getenv("ESPN_LEAGUE_ID", DEFAULT_LEAGUE_ID)))
    parser.add_argument("--limit", type=int, default=10000, help="Maximum player-card entries requested from ESPN")
    parser.add_argument("--input", type=Path, help="Normalize a saved player-card JSON fixture instead of calling ESPN")
    parser.add_argument("--output", type=Path, required=True, help="Write normalized audit JSON to this path")
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 10000:
        parser.error("--limit must be between 1 and 10000")
    try:
        if args.input:
            payload = json.loads(args.input.read_text(encoding="utf-8"))
        else:
            payload = fetch_playercard(args.season, args.league_id, args.limit)
        result = normalize_playercard(payload, args.season, args.league_id)
    except (OSError, json.JSONDecodeError, ValueError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {args.output}: {result['player_count']} players, "
        f"{result['transaction_count']} unique transactions, "
        f"{result['team_to_team_transaction_count']} team-to-team candidates"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
