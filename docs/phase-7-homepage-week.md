# Phase 7 — Current-week homepage payload

Additive derived snapshot at `data/homepage-week.json`.

The homepage can now read one trusted current-week file instead of assembling site, ESPN week, newspaper, odds, and pulse inputs independently.

Contents:

- season / week / phase / status
- last_updated and freshness metadata
- matchups and standings
- featured weekly story summary
- championship odds
- League Pulse cards

`current-season.json`, `site.json`, newspaper editions, and `matchups.json` remain the source files. The payload is rebuilt from them.

`js/site-ui.js` prefers the payload and falls back to `current-season.json`. League Pulse prefers payload cards and still enriches the latest transaction from the existing archive RPC.
