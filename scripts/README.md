# League data export

The website reads generated historical data from the compact JSON files under `data/`. The SQLite archive does not need to be stored in GitHub or served by GitHub Pages.

To regenerate every browser dataset in dependency-safe order, run:

```bash
python3 scripts/export_all.py /path/to/1048_gate.db
```

This runs the member, season, matchup, playoff, draft, player, streak, and manager-profile exporters. If one fails, the command stops immediately and reports which exporter needs attention.

To regenerate only the Members-page fallback, keep `1048_gate.db` wherever you normally store it and pass its path to the member exporter:

```bash
python3 scripts/export_web_data.py /path/to/1048_gate.db
```

If you temporarily place `1048_gate.db` in the repository root, you can also run:

```bash
python3 scripts/export_web_data.py
```

The repository `.gitignore` excludes `/1048_gate.db` so the large local database is not committed accidentally.

The exporter currently builds the Members-page dataset for seasons 2017-2025. It preserves known ESPN owner-ID changes and the established 2017-2018 final finishes.

## Current-season standings and scoreboard

The current-season fetcher uses the ESPN league endpoint and reads private-league cookies only from environment variables. It never writes raw ESPN responses or credentials. The configured league ID is `1237285`; override it with `ESPN_LEAGUE_ID` when needed.

To fetch normalized standings locally:

```bash
ESPN_LEAGUE_ID=1237285 ESPN_S2="$ESPN_S2" ESPN_SWID="$ESPN_SWID" \
  python3 scripts/fetch_current.py standings --season 2026 \
  --output standings-2026.json
```

To fetch one matchup period’s scoreboard:

```bash
ESPN_LEAGUE_ID=1237285 ESPN_S2="$ESPN_S2" ESPN_SWID="$ESPN_SWID" \
  python3 scripts/fetch_current.py scoreboard --season 2026 --week 1 \
  --output scoreboard-2026-week1.json
```

The scoreboard command filters ESPN’s full schedule by `matchupPeriodId` and returns only that week’s six league matchups. It retries transient transport failures up to three times with bounded backoff and exits nonzero on authentication, HTTP, timeout, or malformed-response errors.

The `Data health and current-season fetch` GitHub Actions workflow runs the public live playoff probe daily at 08:15 UTC. A manual workflow dispatch additionally fetches standings and a selected matchup period, then uploads the normalized JSON files as a 14-day artifact. Configure the repository secrets `ESPN_LEAGUE_ID`, `ESPN_S2`, and `ESPN_SWID`; do not commit these values or print them in logs.
