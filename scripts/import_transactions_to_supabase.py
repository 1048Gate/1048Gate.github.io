#!/usr/bin/env python3
"""Atomically import normalized ESPN transactions into Supabase archive tables.

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


# Sources produced by the import workflow: fetch_transactions.py (mTransactions2),
# fetch_trade_history.py (kona_playercard).
# Must match v_allowed_sources / v_authoritative_source in the latest
# supabase/migrations/*import_transaction_snapshot* definition (asserted by tests).
ALLOWED_SOURCES = frozenset({'ESPN mTransactions2', 'ESPN kona_playercard'})
# Only this feed may reconcile (delete); other sources merge without nulling data.
AUTHORITATIVE_SOURCE = 'ESPN mTransactions2'


def prepare_import(data: dict[str, Any], *, authoritative: bool = False, allow_empty: bool = False) -> dict[str, Any]:
    """Fail closed before any write; completeness is an explicit operator assertion."""
    from datetime import datetime
    if not isinstance(data, dict) or type(data.get('season')) is not int or data['season'] < 2019:
        raise ValueError('Invalid transaction season')
    if data.get('league_id') != 1237285 or data.get('source') not in ALLOWED_SOURCES:
        raise ValueError('Unexpected transaction source or league')
    stamp = datetime.fromisoformat(str(data.get('fetched_at', '')).replace('Z', '+00:00'))
    if stamp.tzinfo is None:
        raise ValueError('Import timestamp must include a timezone')
    transactions, items = data.get('transactions'), data.get('items')
    if not isinstance(transactions, list) or not isinstance(items, list):
        raise ValueError('Input must contain transactions/items arrays')
    if data.get('transaction_count') != len(transactions) or data.get('item_count') != len(items):
        raise ValueError('Import counts do not match the snapshot')
    parents, children = {}, {}
    for row in transactions:
        if not isinstance(row, dict):
            raise ValueError('Invalid transaction row')
        key = row.get('espn_transaction_id')
        if row.get('season_year') != data['season'] or not isinstance(key, str) or not key.strip():
            raise ValueError('Invalid transaction identity')
        if not isinstance(row.get('raw_data'), dict) or row['raw_data'].get('id') != key:
            raise ValueError('Missing imported transaction provenance')
        if type(row.get('item_count')) is not int or row['item_count'] < 0:
            raise ValueError('Invalid transaction item count')
        if key in parents and parents[key] != row:
            raise ValueError('Conflicting duplicate transaction')
        parents[key] = row
    for row in items:
        if not isinstance(row, dict):
            raise ValueError('Invalid transaction item')
        key = (row.get('espn_transaction_id'), row.get('item_index'))
        if row.get('season_year') != data['season'] or key[0] not in parents or type(key[1]) is not int or key[1] < 0:
            raise ValueError('Invalid transaction item identity')
        if key in children and children[key] != row:
            raise ValueError('Conflicting duplicate transaction item')
        children[key] = row
    for key, row in parents.items():
        if sorted(index for parent, index in children if parent == key) != list(range(row['item_count'])):
            raise ValueError('Incomplete transaction items')
    if authoritative and data.get('source') != AUTHORITATIVE_SOURCE:
        raise ValueError(f'Authoritative reconciliation requires a {AUTHORITATIVE_SOURCE} snapshot')
    if authoritative and data.get('snapshot_complete') is not True:
        raise ValueError('Authoritative reconciliation requires a certified complete snapshot')
    kept = {key: row for key, row in parents.items() if str(row.get('transaction_type', '')).upper() != 'DRAFT'}
    if authoritative and not kept and not allow_empty:
        raise ValueError('Empty authoritative snapshots require --allow-empty-snapshot')
    kept_items = [row for (parent, _), row in children.items() if parent in kept]
    return {**data, 'transactions': list(kept.values()), 'items': kept_items,
            'transaction_count': len(kept), 'item_count': len(kept_items), 'snapshot_complete': authoritative}


def import_snapshot(data: dict[str, Any], *, authoritative: bool = False, allow_empty: bool = False) -> Any:
    prepared = prepare_import(data, authoritative=authoritative, allow_empty=allow_empty)
    return supabase_request('POST', 'rpc/import_transaction_snapshot', {'p_snapshot': prepared})


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
    parser.add_argument('--authoritative-complete', action='store_true', help='Reconcile a certified complete season snapshot atomically')
    parser.add_argument('--allow-empty-snapshot', action='store_true', help='Explicitly authorize a certified empty season snapshot')
    args = parser.parse_args()

    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.", file=sys.stderr)
        return 2

    data = json.loads(args.input.read_text(encoding="utf-8"))
    try:
        result = import_snapshot(data, authoritative=args.authoritative_complete, allow_empty=args.allow_empty_snapshot)
    except (ValueError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(f"Imported transaction snapshot: {result}")

    season = int(data.get("season") or 0)
    if args.bump_site_range and season:
        if bump_transaction_range(season):
            print(f"Updated {SITE_PATH} transactionRange through {season}")
        else:
            print(f"transactionRange already covers {season}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
