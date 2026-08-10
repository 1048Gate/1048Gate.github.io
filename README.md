# 1048 Gate Szn 10

Official website for the 1048 Gate fantasy football keeper league.

## Project structure

- `index.html` — page structure and league content
- `css/` — colors, layout, mobile design, member cards, history, playoffs, and staff tools
- `js/shared.js` — shared escaping, formatting, member normalization, and logo presentation
- `js/app.js` — navigation plus the single member renderer and Supabase-to-JSON fallback
- `js/` — explicitly ordered feature scripts; no runtime script-injection chain
- `data/` — browser-ready league history exported from the SQLite archive
- `images/1048-gate-logo.webp` — optimized league logo
- `images/team-logos/` — 256px WebP member logos

## Updating member data

Member history uses Supabase as its primary source and falls back to `data/members.json` whenever live data is unavailable. Regenerate that browser fallback from the SQLite archive with:

```bash
python3 scripts/export_web_data.py
```

Career record, winning percentage, championships, average finish, best finish, and career points calculate automatically.

## Run locally

Open `index.html` in your browser. For easier editing and automatic browser refresh, use the VS Code Live Server extension.

Before publishing, validate and build the site:

```bash
npm run check
npm run build
```

When replacing a logo, create a lightweight WebP with ImageMagick:

```bash
npm run optimize:image -- source-logo.png images/team-logos/12-trevor-hash.webp 256
```

Use `512` instead of `256` for the main league crest. `npm run check` rejects misleading extensions, whitespace in image filenames, oversized dimensions, and unnecessarily large image files.

The build writes `dist/` and gives every CSS and JavaScript file a content-based filename. Browsers therefore receive fresh assets automatically whenever their contents change.

## GitHub Pages

The `Deploy GitHub Pages` workflow validates the source, builds the content-hashed site, and deploys `dist/` after changes reach `main`. In repository **Settings → Pages**, set **Source** to **GitHub Actions**.
