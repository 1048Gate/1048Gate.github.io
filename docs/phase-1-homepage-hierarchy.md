# Phase 1 — Homepage hierarchy

Authority: `docs/visual-redesign-brief.md`, Phase 1 only.
Base reviewed: `fa7b1b714d617e3740e358695e44838d15ebd5b8` on main.
Delivery: existing PR #52, `feat/homepage-hierarchy-step-1`. Not merged or deployed.

## Exact changes from main

- `index.html`: move the introductory orientation panel into the archive band; rename the homepage band headings to “This Week” and “Around the League”; order the story before odds and League Pulse; give existing weekly/keeper modules stable IDs; add a homepage draft-archive shortcut and a state-dependent primary jump button; load the hierarchy script. Main navigation and secondary pages are unchanged.
- `css/style.css`: append homepage-scoped rules to shorten the masthead and season card, suppress its duplicated metadata grid, retain responsive desktop/phone arrangements, and space the promoted modules. Existing palette, fonts, matchup styling, and theme files are unchanged.
- `js/home-layout.js`: use existing site/board/edition data to order original DOM nodes. Live/upcoming: scoreboard and standings first, then story, odds, pulse, and reference material. Final: promote the recap only if it is valid, verified final, and matches the board's season/week; otherwise retain scores first. Offseason: keeper/draft shortcuts first, with the prior board lower down. Update primary jump and status copy. Repeated renders preserve an already-correct node order.
- `js/site-ui.js`: expose the already-loaded board and announce completion to the hierarchy script. No new requests, ingestion, or score calculations.
- `js/newspaper.js`: expose the already-validated homepage edition and announce completion. No changes to edition selection, fetching, generation, or rendering.
- `scripts/test-home-layout.mjs`: regression cases for live, mixed final/scheduled, upcoming, final, matching recap, invalid/stale recap, missing configuration/board, and offseason states.
- `package.json`: include the hierarchy regression in the normal check/test command; no dependency or lockfile changes.
- `docs/visual-redesign-brief.md`: preserve the supplied authoritative brief.
- This report records scope, validation, and remaining limitations.

## Validation

- `npm test` passed: site/asset checks; homepage state regressions; data validation; playoffs; newspaper; futures; 49 Python unit tests; production build.
- Actual HTML/DOM integration exercised using a temporary LinkeDOM harness outside the repository: live → final → stale recap → matching recap → offseason → live. Verified content order, original score-node and event-listener preservation, idempotent repeated render, unique IDs, draft shortcut routing, and presence of odds/banner/commissioner/keeper/theme modules.
- `git diff --check` passed.
- No production writes or live ESPN endpoint probes were performed.
- Visual browser QA remains incomplete. Local agent-browser failed to start and Chromium download timed out; the cloud browser connected but rejected the local preview URL with `ERR_BLOCKED_BY_CLIENT`. DOM checks do not prove phone wrapping, contrast, or screenshot quality. Review desktop and phone layouts in both available themes before merging.

## Preservation and remaining phases

No changes to data files, Supabase schema or policies, authentication, ESPN ingestion, newspaper generation, championship-odds calculations, historical records, hosting, or deployment workflows. No matchup redesign, navigation redesign, visual component-family overhaul, freshness system, or data-model migration.

The current repository's theme implementation supports light/dark, with light as default. It has no system-theme option to preserve; Phase 1 leaves the theme implementation unchanged rather than adding an unrequested theme feature.

Stop after Phase 1. Phases 2–8 have not been implemented.

## Pre-merge visual QA follow-up

Browser access was retried after the Phase 1 review. The cloud browser is connected, but the local preview returned `ERR_BLOCKED_BY_CLIENT`. The documented shared-file preview path was also rejected because browser policy permits only HTTP/HTTPS. No workaround was attempted after that explicit rejection. Automated/DOM results above remain valid; they are not visual approval.

All of the following remain **visually unverified**, at desktop and mobile widths in light and dark:

- Masthead proportions and wrapping; above-the-fold hierarchy.
- Live/current-week, finalized-week/verified-recap, and offseason ordering.
- Long fantasy team names.
- Spacing between This Week, Around the League, and Archive.
- Championship Odds prominence and the relocated introductory panel.
- Horizontal overflow and contrast/readability.
- Sticky header offsets and anchor jumps.

No visual defects can be ruled out from this blocked attempt. No product code changed in this follow-up. The authoritative repository brief now explicitly records light/dark support, light as default, and no system-theme work in Phase 1. PR #52 remains unmerged; Phase 2 has not started.
