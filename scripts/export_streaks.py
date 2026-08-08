#!/usr/bin/env python3
"""Export league streak records from the local SQLite archive."""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

ALIASES = {
    'german joshua haro': 'German Haro',
    'tommy speer': 'Thomas Speer',
}


def clean(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def key(value):
    return clean(value).lower()


def person_name(row):
    full = clean(f"{row['first_name'] or ''} {row['last_name'] or ''}")
    name = full or clean(row['display_name'])
    return ALIASES.get(key(name), name)


def main():
    root = Path(__file__).resolve().parents[1]
    db = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else root / '1048_gate.db'
    if not db.exists():
        raise SystemExit(f'Database not found: {db}')

    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row

    owners = {
        (row['year'], row['owner_id']): row
        for row in con.execute('select year,owner_id,display_name,first_name,last_name from owners')
    }
    team_owner = {
        (row['year'], row['team_id']): row['owner_id']
        for row in con.execute('select year,team_id,owner_id from teams')
    }

    outcomes = defaultdict(list)
    for row in con.execute('select * from games where coalesce(is_bye,0)=0 order by year,week,home_team_id'):
        year = int(row['year'])
        home_owner = team_owner[(year, row['home_team_id'])]
        away_owner = team_owner[(year, row['away_team_id'])]
        home_name = person_name(owners[(year, home_owner)])
        away_name = person_name(owners[(year, away_owner)])
        home_score = float(row['home_score'])
        away_score = float(row['away_score'])
        playoff = int(row['is_playoff'] or 0)

        outcomes[(year, home_name)].append((int(row['week']), 'L' if home_score < away_score else 'W' if home_score > away_score else 'T', playoff, clean(row['home_team_name'])))
        outcomes[(year, away_name)].append((int(row['week']), 'L' if away_score < home_score else 'W' if away_score > home_score else 'T', playoff, clean(row['away_team_name'])))

    best = None
    for (year, manager), rows in outcomes.items():
        rows = sorted(rows)
        current = 0
        start_week = None
        for week, result, playoff, team_name in rows:
            if result == 'L':
                if current == 0:
                    start_week = week
                current += 1
                includes_postseason = any(r[2] for r in rows if start_week <= r[0] <= week)
                candidate = (current, manager, team_name, year, start_week, week, bool(includes_postseason))
                if best is None or candidate[0] > best[0]:
                    best = candidate
            else:
                current = 0
                start_week = None

    losses, manager, team, season, start_week, end_week, includes_postseason = best
    payload = {
        'schemaVersion': 1,
        'seasonRange': {'from': 2017, 'to': 2025},
        'longestLosingStreak': {
            'losses': losses,
            'manager': manager,
            'team': team,
            'season': season,
            'startWeek': start_week,
            'endWeek': end_week,
            'includesPostseason': includes_postseason,
        },
    }

    out = root / 'data' / 'streaks.json'
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"Wrote {out}: {losses} straight losses — {manager}, {season} Weeks {start_week}-{end_week}")


if __name__ == '__main__':
    main()
