# 1048 Gate Szn 10

Official website for the 1048 Gate fantasy football keeper league.

## Project structure

- `index.html` — page structure and league content
- `css/` — colors, layout, mobile design, member cards, history, playoffs, and staff tools
- `js/app.js` — navigation, interactive sections, member data, and career calculations
- `js/` — explicitly ordered feature scripts; no runtime script-injection chain
- `data/` — browser-ready league history exported from the SQLite archive
- `images/1048-gate-logo.webp` — optimized league logo

## Updating member data

Member history is loaded from `data/members.json`. Regenerate the browser data from the SQLite archive with:

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

The build writes `dist/` and gives every CSS and JavaScript file a content-based filename. Browsers therefore receive fresh assets automatically whenever their contents change.

## GitHub Pages

The `Deploy GitHub Pages` workflow validates the source, builds the content-hashed site, and deploys `dist/` after changes reach `main`. In repository **Settings → Pages**, set **Source** to **GitHub Actions**.
