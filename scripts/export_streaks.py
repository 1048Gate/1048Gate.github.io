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
    'chardo bryce': 'Chardo Bryce',
    'german joshua haro': 'German Haro',
    'ronnie coiro': 'Ronnie Coiro',
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

    def collect_streaks(result_code, regular_only=False):
        streaks=[]
        for (year,manager),source_rows in outcomes.items():
            rows=sorted(row for row in source_rows if not (regular_only and row[2]))
            run=[]
            for row in rows+[(-1,'X',0,'')]:
                if row[1] == result_code:
                    run.append(row)
                elif run:
                    streaks.append({
                        'games':len(run),'manager':manager,'team':run[-1][3],
                        'season':year,'startWeek':run[0][0],'endWeek':run[-1][0],
                        'includesPostseason':bool(any(item[2] for item in run)),
                    })
                    run=[]
        return sorted(streaks,key=lambda row:(-row['games'],row['season'],row['startWeek'],row['manager'].lower()))

    wins=collect_streaks('W')[:3]
    losses=collect_streaks('L',regular_only=True)[:3]
    payload = {
        'schemaVersion': 2,
        'seasonRange': {'from': 2017, 'to': 2025},
        'longestWinningStreak': {**wins[0], 'wins': wins[0]['games']},
        'longestLosingStreak': {**losses[0], 'losses': losses[0]['games']},
        'leaderboards': {'winningStreaks':wins,'losingStreaks':losses},
        'archiveLeaderboards': {'winningStreaks':wins,'losingStreaks':losses},
    }

    out = root / 'data' / 'streaks.json'
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"Wrote {out}: {wins[0]['games']} straight wins; {losses[0]['games']} straight regular-season losses")


if __name__ == '__main__':
    main()
