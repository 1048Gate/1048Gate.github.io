# Phase 2 — Visual system

Authority: `docs/visual-redesign-brief.md`, Phase 2 only. Based on merged Phase 1 (`2bba65c`).

## Implementation

- New `css/visual-system.css`, loaded after existing theme CSS, owns the reusable presentation layer. It uses existing light/dark colors; light remains the default.
- Masthead subtitle has explicit word spacing when the existing line break collapses.
- Four type roles: display (28–36px), section (24–30px), module (20px), and utility (12px). Shared public page headings and homepage metadata use these roles. Editorial body copy is 16px; odds summaries and snapshot labels are 14px.
- Editorial panels: amber leading rule, headline hierarchy, readable copy width, quieter backgrounds. Applied to weekly feature, commissioner content, newspaper container, and existing historical-story adapter. The newspaper retains its existing paper/ink palette in both themes to preserve contrast.
- Data panels: neutral borders, quieter surfaces, tabular numerals, consistent header treatment. Applied to scoreboard outer panel, odds, snapshot, banners, transaction workbench, and existing history/record adapters. Matchup-card internals and standings columns are unchanged.
- Navigation panels: transparent backgrounds, light borders and no shadow; applied to keeper/draft shortcuts, introduction, and existing archive-card adapters.
- Spacing scale: 8/16/24/32/48px. Homepage section gaps, headers, editorial copy, snapshot, and archive links use the scale.
- Reusable 12-column desktop grid and matching homepage band/dashboard layout. When commissioner content is hidden, the existing snapshot spans the available width with three columns, then two/one on smaller screens. DOM content order from Phase 1 is preserved.

## Reuse

Use `data-panel="editorial|data|navigation"` or `.gate-panel--editorial|data|navigation` on containers. Use `.gate-display`, `.gate-section-title`, `.gate-module-title`, `.gate-utility`, and `.gate-grid` for new compatible components. Existing renderer selectors are adapted in CSS without changing data/rendering scripts. Preserve exact legacy class attributes consumed by existing validation/generation paths.

## Scope

Only visual stylesheet, panel-role attributes/stylesheet link, this report, and screenshot QA coverage change. No auth/Supabase, ingestion, newspaper generation, odds calculations, historical data, theme behavior, routing, or deployment changes. No Phase 3 matchup redesign or Phase 4 navigation cleanup. No system-theme option.

## Validation

Existing npm test suite and production build; existing CI 12-case homepage screenshots at 1440/390 in both themes across live/recap/offseason; added representative secondary-page viewport screenshots for League, History, Newspaper, Transactions, and Rules in both widths/themes. Supabase remains stubbed and final/offseason data are QA fixtures. No production publishing occurs.

Visual results are recorded in the PR after reviewing the CI artifacts. A green screenshot capture alone does not establish visual approval. Secondary pages retain detailed legacy component styles beyond these shared outer roles; later phases remain separate.
