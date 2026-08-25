# Security & Performance Release Runbook

**Release branch:** `release/security-performance`

**Scope:** Public transaction archive, legacy-board retirement, informal Vote Booth privacy, tracked migrations, and regression coverage.
**Author:** Manus AI

> This release preserves data. The production `board_posts` and `board_comments` records are copied into the non-exposed `private` schema before their public browser access is removed; the original tables are not dropped or deleted.

## Release objective

The public site must no longer download raw ESPN transaction imports or individual voter identifiers. It instead calls narrow, paginated database functions that return only display fields. The legacy message board is retired after a verified export and a private database copy, while the separate authenticated Trade Board remains active. Vote Booth remains explicitly **informal**, presenting aggregate option counts and only the current device’s own response.

The migration layout follows Supabase’s versioned-migration model and keeps database changes reviewable in source control.[1] The release uses row-level security, revoked table privileges, and tightly scoped RPC grants to separate browser-readable data from raw imports and private archival content.[2]

## Data-preservation record

The pre-change production export is stored at [`archive/legacy-board-production-export-2026-08-25.json`](../../archive/legacy-board-production-export-2026-08-25.json). The recorded export contains **6 posts** and **7 comments**. Source dependency verification found no public-screen dependency on these legacy tables; the only active source references were Staff Tools moderation controls, which are removed in this release. The current Trade Board uses the separate `trade_board_posts` and `trade_board_comments` tables and remains in service.

| Preservation layer | Location | Purpose |
|---|---|---|
| Repository export | `archive/legacy-board-production-export-2026-08-25.json` | Immutable, reviewable pre-release JSON export. |
| Production database archive | `private.legacy_board_posts`, `private.legacy_board_comments` | Restricted SQL-level copy made by migration 013 before retirement. |
| Original production tables | `public.board_posts`, `public.board_comments` | Retained but made inaccessible to anonymous and authenticated browser roles. |

## Ordered migration plan

All historical scripts have been preserved and converted into numbered files under [`supabase/migrations`](../../supabase/migrations). The historical migration order establishes a reproducible staging baseline; the production deployment records the release migrations that were not previously tracked.

| Order | Migration | Purpose | Production action |
|---:|---|---|---|
| 001 | `20260825000000_001_community_base.sql` | Original community tables, initial poll constraints, and RLS baseline. | Historical baseline; retained for clean-environment rebuilds. |
| 002 | `20260825001000_002_auth_roles.sql` | Profiles, staff roles, announcements, and role helper. | Historical baseline. |
| 003–007 | `20260825002000` through `20260825006000` | Staff, league-content, playoffs, and champion-story evolution. | Historical baseline. |
| 008 | `20260825007000_008_trade_board.sql` | Active authenticated Trade Board. | Historical baseline. |
| 009 | `20260825008000_009_starter_content.sql` | Starter content and poll pair integrity. | Historical baseline. |
| 010 | `20260825009000_010_security_hardening.sql` | Existing function, policy, and foreign-key hardening. | Historical baseline. |
| 011 | `20260825010000_011_transaction_archive_base.sql` | Tracked raw-import schema; browser roles receive no direct table grants. | Historical baseline for rebuilds. |
| 012 | `20260825011000_012_transaction_archive_repair.sql` | ESPN related-transaction normalization. | Historical baseline. |
| 013 | `20260825012000_013_security_performance_release.sql` | Legacy-board private archive, raw-table lock-down, canonical archive RPCs, informal-poll aggregate RPCs, and private role helper. | **Apply to production.** |
| 014 | `20260825013000_014_deduplicate_poll_option_constraint.sql` | Removes a duplicate poll option constraint and rebuilds the retained pair-integrity foreign key. | **Apply to production immediately after 013.** |

## Affected website and database surfaces

| Surface | Changed files or tables | Result |
|---|---|---|
| Transaction Archive | `js/transactions.js`; `public.get_transaction_archive`; `public.get_transaction_archive_seasons` | Server pagination, filter/search/sort, total count, and only display-safe fields. |
| Trade Talk | `js/trade-talk.js`; `public.get_transaction_archive` | Season-specific canonical accepted trades with `verified`, `proposal_derived`, or `missing` source-detail status. |
| Raw imports | `league_transactions`; `league_transaction_items`; `league_transaction_archive_items` | Browser grants are revoked; raw JSON cannot be returned through public API calls. |
| Legacy Board | `board_posts`; `board_comments`; `private.legacy_board_*`; `js/admin.js` | Content copied and retired without deletion; no active public or Staff Tools dependency remains. |
| Vote Booth | `js/community.js`; `poll_votes`; `get_informal_polls`; `cast_informal_poll_vote` | Informal labeling, aggregate-only results, and no browser exposure of voter IDs. |
| Staff Tools | `js/admin.js` | Poll management uses aggregate RPC results; legacy-board panel removed. |
| Quality gates | `scripts/check-site.mjs`; `scripts/test-supabase-release.mjs`; `supabase/tests/security_performance_assertions.sql` | Static, SQL, and public-API regression coverage. |

## Staging validation evidence

The release was built in an isolated Supabase staging project with no production transaction imports. All fourteen numbered migrations were applied in sequence. Controlled fixtures then verified pagination, canonical trade reconstruction, direct and proposal-derived detail status, the missing-detail state, RLS/grant boundaries, legacy-board preservation, informal vote deduplication, and aggregate-only poll output.

| Check | Result | Notes |
|---|---|---|
| `npm run check` | Passed | Validates source structure, secure RPC use, migration presence, removal of direct raw reads, and no legacy-board Staff Tools queries. |
| `npm run build` | Passed | Produced 34 content-hashed CSS/JS assets. |
| Staging SQL assertions | Passed twice | Exercises the controlled fixtures and repeatability of the test suite. |
| Staging anonymous API regression | Passed twice | Anonymous calls were denied for raw transactions, archived view, poll votes, legacy board tables, and public role helper; limited RPCs succeeded. |
| Staging security advisor | Reviewed | The remaining notices are intentional: RLS-without-policy on deliberately inaccessible retired/raw tables and public security-definer functions that constitute the minimal public RPC surface. Each function uses a fixed `search_path`, strict parameter bounds, and field-limited result construction. |
| Staging performance advisor | Reviewed | The duplicate poll-option index warning was resolved by migration 014. Remaining notices are usage-based information from the fresh staging database, not query-plan failures. |

## Production deployment procedure

A brief transition window is unavoidable with a static GitHub Pages site because the public client and database policy changes cannot be atomically switched together. Security takes precedence: apply the database migrations first, then publish the client immediately. The old transaction, Trade Talk, and Vote Booth screens may display their existing retry state until the GitHub Pages workflow publishes the new hashed client assets.

1. Confirm that the local release branch is clean except for the reviewed release files, then create the release commit.
2. Apply migration 013 to production, verify the private legacy-board copy and public API grants, then apply migration 014.
3. Run the API-level public-role regression test against production using the production publishable key.
4. Push `release/security-performance`, open the pull request, merge only after the repository checks pass, and monitor the Pages deployment workflow at [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml).
5. Verify the live production site on desktop and mobile. Confirm the transaction and Trade Talk screens load through the new RPCs, Vote Booth is labeled informal and displays counts only, Trade Board remains usable, Staff Tools remains available after authenticated sign-in, and no console/API errors occur.
6. Re-run security and performance advisor checks after production traffic has reached the new paths.

## Rollback plan

This release does not delete transaction or legacy-board rows. A rollback therefore does not require data restoration. If live verification detects a blocking defect, first revert the website commit and let GitHub Pages redeploy the previous artifact. Database access should remain locked down unless the issue is an emergency availability problem.

| Scenario | Safe response |
|---|---|
| Client rendering defect | Revert the release commit and redeploy Pages. Keep database policy changes in place; the prior client will not regain raw access. |
| Public archive RPC defect | Add a corrective forward migration that updates only the affected RPC body. Do not restore raw table grants. |
| Informal-poll RPC defect | Add a corrective forward migration to the aggregate RPCs. Existing `poll_votes` rows remain intact. |
| Legacy-board archival verification fails before lock-down | Stop deployment; do not revoke policies. Compare counts and IDs with the committed JSON export. |
| Emergency legacy-board restoration required | Restore public table policies and realtime only through a separately reviewed forward migration. The source records remain in both the original public tables and private archive. |
| Constraint cleanup issue | Recreate the original pair foreign key or named uniqueness constraint in a corrective forward migration; no poll or vote rows are deleted by migration 014. |

The project should use forward-only corrective migrations rather than editing applied production migration files. This preserves an auditable history and avoids schema drift.[1]

## References

[1]: https://supabase.com/docs/guides/deployment/database-migrations "Supabase: Database migrations"
[2]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase: Row Level Security"
