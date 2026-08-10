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
