#!/usr/bin/env python3
"""Regenerate every browser JSON export from the 1048 Gate SQLite archive."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


EXPORTERS = (
    "export_web_data.py",
    "export_seasons.py",
    "export_matchups.py",
    "export_playoffs.py",
    "export_drafts.py",
    "export_players.py",
    "export_streaks.py",
    "export_manager_profiles.py",
)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="Run every 1048 Gate web-data exporter in dependency-safe order."
    )
    parser.add_argument(
        "database",
        nargs="?",
        default=root / "1048_gate.db",
        type=Path,
        help="Path to 1048_gate.db (defaults to the repository root)",
    )
    args = parser.parse_args()
    database = args.database.expanduser().resolve()

    if not database.is_file():
        parser.error(f"database not found: {database}")

    for index, exporter in enumerate(EXPORTERS, start=1):
        print(f"[{index}/{len(EXPORTERS)}] {exporter}", flush=True)
        subprocess.run(
            [sys.executable, str(root / "scripts" / exporter), str(database)],
            cwd=root,
            check=True,
        )

    print(f"Regenerated all website data from {database}")


if __name__ == "__main__":
    main()
