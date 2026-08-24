# 1048 Gate Szn 10

Official website for the 1048 Gate fantasy football keeper league.

The public interface uses a restrained league-office design: compact navigation, a data-driven season dashboard, clean commissioner updates, and consistent charcoal, teal, and gold surfaces across the archive.

## Project structure

- `index.html` — page structure and league content
- `css/` — colors, layout, mobile design, member cards, history, playoffs, and staff tools
- `js/shared.js` — shared escaping, formatting, member normalization, and initials presentation
- `js/app.js` — navigation plus the single member renderer and Supabase-to-JSON fallback
- `js/transactions.js` — lazy-loaded search, filtering, pagination, and rendering for the live transaction archive
- `js/` — explicitly ordered feature scripts; no runtime script-injection chain
- `data/` — browser-ready league history exported from the SQLite archive
- `data/site.json` — current season number, year, phase, and competition labels
- `images/1048-gate-logo.webp` — optimized league logo

## Updating member data

Member history uses Supabase as its primary source and falls back to `data/members.json` whenever live data is unavailable. Regenerate that browser fallback from the SQLite archive with:

```bash
python3 scripts/export_web_data.py
```

Career record, winning percentage, championships, average finish, best finish, and career points calculate automatically.

## Transaction archive

The Transactions view reads `league_transactions` and `league_transaction_items` from Supabase only after a visitor opens that section. This keeps the landing page light while making the useful activity from 2019–2025 searchable by season, category, player, and team. Results are grouped by date in a compact activity ledger instead of separate full-size cards.

The list intentionally focuses on completed adds and drops, successful waiver claims, and accepted trades. Failed claims, trade proposals, veto and review events, lineup activity, future-lineup records, ESPN raw JSON, and internal identifiers are omitted from the browser UI.

To regenerate every website dataset in one pass, run `python3 scripts/export_all.py /path/to/1048_gate.db`. See `scripts/README.md` for individual exporters.

## Updating the current season

Edit `data/site.json` when the league moves from preseason to the regular season or rolls into a new year. The header chip, browser title, season branding, and footer update from that one file.

## Supabase setup

For a new database, run these files in the Supabase SQL Editor in order:

1. `supabase/schema.sql`
2. `supabase/auth_roles.sql`
3. `supabase/staff_upgrades.sql`
4. `supabase/league_content.sql`
5. `supabase/league_content_manager_upgrade.sql`
6. `supabase/playoffs.sql`
7. `supabase/champion_stories.sql`
8. `supabase/trade_board.sql`
9. `supabase/starter_content.sql`

`starter_content.sql` installs the two launch announcements, four example message-board threads, and three example polls as real Supabase records. They appear in the normal Staff Tools lists with a **STARTER** badge and can be deleted by the commissioner or site admin. They do not return after deletion.

## Run locally

Open `index.html` in your browser. For easier editing and automatic browser refresh, use the VS Code Live Server extension.

Before publishing, validate and build the site:

```bash
npm run check
npm run build
```

When replacing the league crest, create a lightweight WebP with ImageMagick:

```bash
npm run optimize:image -- source-logo.png images/1048-gate-logo.webp 512
```

`npm run check` rejects misleading extensions, whitespace in image filenames, oversized dimensions, and unnecessarily large image files.

The build writes `dist/` and gives every CSS and JavaScript file a content-based filename. Browsers therefore receive fresh assets automatically whenever their contents change.

## GitHub Pages

The `Deploy GitHub Pages` workflow validates the source, builds the content-hashed site, and deploys `dist/` after changes reach `main`. In repository **Settings → Pages**, set **Source** to **GitHub Actions**.
