# Phase 8 — Incremental data cleanup

Additive named-field cleanup. No database migration.

## Touched

- `data/members.json` season rows are named objects with stable `id` values (`mgr-01`, `mgr-01-2025`).
- `data/drafts/index.json` season rows are named objects (`draft-2026`).
- Both files carry a `provenance` object that marks them as canonical source files.

## Left compact on purpose

- `data/seasons.json` archive standings
- `data/manager-profiles.json` rivalry / weapons / signature rows
- Per-season draft pick arrays

Those stay compact. `gateShared.normalizeSeason` and `gateShared.normalizeDraftSeason` still accept the old arrays.

## Writers

`scripts/export_web_data.py` now emits named member-season records. `scripts/export_manager_profiles.py` reads either shape.
