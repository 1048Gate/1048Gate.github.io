# League data export

The website reads generated historical member data from `data/members.json`.

To regenerate it from the SQLite archive, place `1048_gate.db` in the repository root and run:

```bash
python3 scripts/export_web_data.py
```

The exporter currently builds the Members-page dataset for seasons 2017-2025. It preserves known ESPN owner-ID changes and the established 2017-2018 final finishes.
