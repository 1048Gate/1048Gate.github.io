# Phase 8 — Incremental data cleanup

Additive named-field cleanup. No database migration.

## Touched

- `data/members.json` season rows are named objects with stable `id` values (`mgr-01`, `mgr-01-2025`) and a `provenance` block.
- `js/shared.js` stamps those ids when compact rows are still supplied.
- `gateShared.normalizeDraftSeason` accepts compact or named draft-index rows.

## Left compact on purpose

- `data/seasons.json` archive standings
- `data/manager-profiles.json` rivalry / weapons / signature rows
- `data/drafts/index.json` and per-season draft pick arrays

## Writers

`scripts/export_manager_profiles.py` reads either member-season shape. Re-exports of `members.json` should keep the named object form.
