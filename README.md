# 1048 Gate Szn 10

Official website for the 1048 Gate fantasy football keeper league.

## Project structure

- `index.html` — page structure and league content
- `css/style.css` — colors, layout, mobile design, member cards, and profile modal
- `js/app.js` — navigation, interactive sections, member data, and career calculations
- `images/1048-gate-logo.webp` — optimized league logo

## Updating member data

Open `js/app.js` and search for `EDIT MEMBER DATA HERE`.

Add a season in this format:

```javascript
[2025, 5, "Team Name", "8-6", 1686.08, 1565.66]
```

The order is:

1. Year
2. Final finish
3. Team name
4. Record
5. Points for
6. Points against

Use `null` when older point totals are unavailable:

```javascript
[2017, 2, "Free Zeke", "8-5", null, null]
```

Career record, winning percentage, championships, average finish, best finish, and career points calculate automatically.

## Run locally

Open `index.html` in your browser. For easier editing and automatic browser refresh, use the VS Code Live Server extension.

## GitHub Pages

This structure is ready for GitHub Pages. In the repository settings, choose **Pages**, select **Deploy from a branch**, then use the `main` branch and `/root` folder.
