# Phase 3 — This Week redesign

Authority: `docs/visual-redesign-brief.md`, Phase 3 only. Based on merged Phase 2 (`8303e51`).

## Implementation

- Added `js/week-board.js` to build six matchup cards and a compact standings snapshot from the existing `current-season.json` payload.
- `js/site-ui.js` still fetches and publishes the board; it now renders through the card helpers when they are present.
- Cards emphasize manager identity, team name (no forced uppercase truncation), score, live/final/upcoming status, and score margin. Projected remaining NFL games are not in the current payload, so they are omitted rather than invented.
- Standings snapshot adds rank and a playoff-line marker after sixth place. Record and points-for remain; historical extras stay out.
- `css/visual-system.css` adds the card grid, score-led type, wrapping team names, and a stacked mobile layout.
- Static homepage fallback markup matches the card structure so first paint is not a row of score blocks.

## Scope

No auth/Supabase, ESPN ingestion, newspaper generation, odds math, navigation cleanup, freshness system, or data-model migration. Light remains the default theme. No production deploy in this PR.

## Validation

- `scripts/test-week-board.mjs` covers live, final, upcoming, margins, leading/trailing sides, six fallback cards, and the standings snapshot.
- Existing homepage hierarchy, site, data, newspaper, playoff, and futures checks remain in `npm test`.
