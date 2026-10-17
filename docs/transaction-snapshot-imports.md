# Transaction snapshot imports

Player-history responses must identify the requested year. A selection clears the previous season immediately, and only the latest request can render. Missing, failed, or mismatched files show an unavailable state for that year; selecting it again retries.

The homepage transaction card waits for a validated integer `site.json` season. It requests only that season, shows the season label, and rejects mismatched or obsolete responses. The full archive retains its intentional **All seasons** filter; its selected season, summary, and response generation are checked independently. Existing database ordering remains newest/oldest by timestamp with a stable activity-key tie breaker.

## Trusted import operation

The importer requires migration `20261017130000_transaction_snapshot_reconciliation.sql`. Review and apply that migration through the normal database release process before running the updated importer. This change does not apply migrations or write production data automatically.

Every import uses the service-role-only `import_transaction_snapshot` RPC. It validates season/source identity, item coverage, and duplicates before upserting parents and children in a single database transaction. An exception rolls back the entire operation. Matching parent and child UUIDs are preserved. Imports for a season serialize under a transaction lock; the import watermark rejects older artifacts, including after an empty snapshot.

Default imports are partial and never delete omitted records:

```sh
python3 scripts/import_transactions_to_supabase.py --input snapshot.json
```

`fetch_transactions.py` always writes `snapshot_complete: false`: an ESPN response containing an array, even an empty array, does not prove full-season coverage. Never certify an artifact based only on a successful HTTP response or normalized counts. A trusted operator must verify that the artifact covers the entire requested season, including all transactions and every item's contiguous index, before setting `snapshot_complete: true` and explicitly requesting reconciliation:

```sh
python3 scripts/import_transactions_to_supabase.py --input verified-complete.json --authoritative-complete
```

Reconciliation removes omitted ESPN-imported records in that season and surplus item indices for included transactions. Imported provenance is the normalizer's `raw_data.id` matching `espn_transaction_id`. Other seasons, unrelated/manual rows, draft records, and the separately maintained recovered-trade archive are preserved. Exact duplicates deduplicate; conflicting duplicates and incomplete items reject the entire import before any network write.

A certified completely empty season additionally requires `--allow-empty-snapshot`. Failed, partial, uncertified, or older snapshots cannot clear a season. Existing schedules keep using partial imports; no ESPN requests or scheduled runs are added.

## Verification

`npm test` includes frontend request-race tests, Python importer validation tests, and the actual reconciliation migration executed in isolated PostgreSQL via the pinned test-only PGlite dependency. Database tests cover corrected imports, stable UUIDs, duplicates, partial/empty imports, transaction rollback, older timestamps, cross-season protection, and anonymous/authenticated denial. No production credentials or services are used by these tests.
