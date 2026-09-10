#!/usr/bin/env python3
"""Convert fetch_trade_history.py JSON into import_transactions_to_supabase.py input."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def adapt(data: dict, team_names: dict[int, str] | None = None) -> dict:
    team_names = team_names or {}
    season = int(data["season"])
    transactions = []
    items = []
    for tx in data.get("transactions") or []:
        tx_id = str(tx.get("espn_transaction_id") or "").strip()
        if not tx_id:
            continue
        team_id = tx.get("team_id")
        date_ms = tx.get("transaction_date_ms")
        related = tx.get("related_transaction_id")
        raw = {
            "id": tx_id,
            "type": tx.get("transaction_type"),
            "status": tx.get("status"),
            "teamId": team_id,
            "scoringPeriodId": tx.get("scoring_period"),
            "processDate": date_ms,
        }
        if related:
            raw["relatedTransactionId"] = related
        tx_items = tx.get("items") or []
        transactions.append({
            "season_year": season,
            "espn_transaction_id": tx_id,
            "scoring_period": tx.get("scoring_period"),
            "transaction_type": tx.get("transaction_type"),
            "status": tx.get("status"),
            "team_id": team_id,
            "team_name": team_names.get(int(team_id)) if team_id is not None else None,
            "member_id": None,
            "bid_amount": None,
            "transaction_date_ms": date_ms,
            "transaction_date": datetime.fromtimestamp(date_ms / 1000, tz=timezone.utc).isoformat() if date_ms else None,
            "item_count": len(tx_items),
            "raw_data": raw,
        })
        for index, item in enumerate(tx_items):
            from_id = item.get("from_team_id")
            to_id = item.get("to_team_id")
            items.append({
                "season_year": season,
                "espn_transaction_id": tx_id,
                "item_index": index,
                "item_type": item.get("item_type"),
                "player_id": item.get("player_id"),
                "player_name": item.get("player_name"),
                "from_team_id": from_id,
                "from_team_name": team_names.get(int(from_id)) if from_id not in (None, 0) else ("" if from_id == 0 else None),
                "to_team_id": to_id,
                "to_team_name": team_names.get(int(to_id)) if to_id not in (None, 0) else ("" if to_id == 0 else None),
                "raw_data": {
                    "type": item.get("item_type"),
                    "playerId": item.get("player_id"),
                    "fromTeamId": from_id,
                    "toTeamId": to_id,
                },
            })
    return {
        "fetched_at": data.get("fetched_at"),
        "league_id": data.get("league_id"),
        "season": season,
        "source": data.get("source") or "ESPN trade-history adapter",
        "transaction_count": len(transactions),
        "item_count": len(items),
        "transactions": transactions,
        "items": items,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--roster", type=Path, help="Optional current-season.json for teamId to name")
    args = parser.parse_args()
    team_names: dict[int, str] = {}
    if args.roster and args.roster.exists():
        board = json.loads(args.roster.read_text(encoding="utf-8"))
        for row in board.get("standings") or []:
            if row.get("teamId") is not None:
                team_names[int(row["teamId"])] = row.get("team") or ""
    data = json.loads(args.input.read_text(encoding="utf-8"))
    result = adapt(data, team_names)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}: {result['transaction_count']} transactions, {result['item_count']} items")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
