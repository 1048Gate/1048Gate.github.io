#!/usr/bin/env python3
"""Upsert normalized ESPN transactions into Supabase archive tables.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Uses the service role so
RLS-blocked browser roles are never used for writes. Upserts on
(season_year, espn_transaction_id) and (season_year, espn_transaction_id, item_index).

Optionally bumps data/site.json transactionRange end year to include this season.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SITE_PATH = ROOT / "data" / "site.json"
BATCH = 200


def supabase_request(method: str, path: str, payload: Any | None = None, prefer: str | None = None) -> Any:
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    url = f"{base}/rest/v1/{path}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase {method} {path} failed HTTP {exc.code}: {detail}") from exc


def chunked(rows: list[dict[str, Any]], size: int = BATCH):
    for index in range(0, len(rows), size):
        yield rows[index:index + size]


def upsert_transactions(rows: list[dict[str, Any]]) -> int:
    count = 0
    for batch in chunked(rows):
        supabase_request(
            "POST",
            "league_transactions?on_conflict=season_year,espn_transaction_id",
            batch,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        count += len(batch)
    return count


def upsert_items(rows: list[dict[str, Any]]) -> int:
    count = 0
    for batch in chunked(rows):
        supabase_request(
            "POST",
            "league_transaction_items?on_conflict=season_year,espn_transaction_id,item_index",
            batch,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        count += len(batch)
    return count


def bump_transaction_range(season: int) -> bool:
    if not SITE_PATH.exists():
        return False
    site = json.loads(SITE_PATH.read_text(encoding="utf-8"))
    current = site.get("transactionRange")
    if not (isinstance(current, list) and len(current) == 2):
        site["transactionRange"] = [2019, season]
        SITE_PATH.write_text(json.dumps(site, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return True
    start, end = int(current[0]), int(current[1])
    if season <= end:
        return False
    site["transactionRange"] = [start, season]
    SITE_PATH.write_text(json.dumps(site, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Normalized JSON from fetch_transactions.py")
    parser.add_argument("--bump-site-range", action="store_true", default=True)
    parser.add_argument("--no-bump-site-range", action="store_false", dest="bump_site_range")
    args = parser.parse_args()

    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.", file=sys.stderr)
        return 2

    data = json.loads(args.input.read_text(encoding="utf-8"))
    transactions = data.get("transactions") or []
    items = data.get("items") or []
    if not isinstance(transactions, list) or not isinstance(items, list):
        print("Input JSON missing transactions/items arrays.", file=sys.stderr)
        return 1

    # Insert parents before children.
    tx_count = upsert_transactions(transactions)
    item_count = upsert_items(items)
    print(f"Upserted {tx_count} transactions and {item_count} items")

    season = int(data.get("season") or 0)
    if args.bump_site_range and season:
        if bump_transaction_range(season):
            print(f"Updated {SITE_PATH} transactionRange through {season}")
        else:
            print(f"transactionRange already covers {season}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
