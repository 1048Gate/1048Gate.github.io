#!/usr/bin/env python3
"""Export compact Player History leaderboards from the local 1048 Gate SQLite archive.

The SQLite database remains the full source of truth. The web export intentionally keeps
only the top career and season scoring rows so the static GitHub Pages site stays fast on
mobile while record cards are calculated from every available player-week row.
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

CAREER_LIMIT = 150
SEASON_LIMIT = 180
NAME_ALIASES = {
    'german joshua haro': 'German Haro',
    'german haro': 'German Haro',
    'tommy speer': 'Thomas Speer',
    'thomas speer': 'Thomas Speer',
    'kyle fowler': 'Kyle Fowler',
    'ronnie coiro': 'Ronnie Coiro',
    'george travis': 'George Travis',
    'jared hall': 'Jared Hall',
    'bryan hunt': 'Bryan Hunt',
    'brian heino': 'Brian Heino',
    'vincent cannarozzi': 'Vincent Cannarozzi',
    'james brochu': 'James Brochu',
    'jd daley': 'JD Daley',
    'collin krum': 'Collin Krum',
    'trevor hash': 'Trevor Hash',
}


def clean(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def canonical_name(value):
    name = clean(value)
    return NAME_ALIASES.get(name.lower(), name)


def owner_name(row):
    full = clean(f"{row['first_name'] or ''} {row['last_name'] or ''}")
    return canonical_name(full or row['display_name'])


def round2(value):
    return round(float(value or 0), 2)


def main():
    root = Path(__file__).resolve().parents[1]
    db = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else root / '1048_gate.db'
    if not db.exists():
        raise SystemExit(f'Database not found: {db}')

    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    owners = {
        (r['year'], r['owner_id']): owner_name(r)
        for r in con.execute('select year,owner_id,display_name,first_name,last_name from owners')
    }
    team_owners = {
        (r['year'], r['team_id']): owners.get((r['year'], r['owner_id']), 'Unknown')
        for r in con.execute('select year,team_id,owner_id from teams')
    }

    rows = list(con.execute('''
        select year,week,fantasy_team_id,fantasy_team_name,player_id,player_name,position,
               points,is_starter
        from player_weeks
        order by year,week,player_id
    '''))
    if not rows:
        raise SystemExit('No player_week rows found.')

    duplicate_count = con.execute('''
        select count(*) from (
          select year,week,player_id,count(*) c
          from player_weeks
          group by year,week,player_id
          having c > 1
        )
    ''').fetchone()[0]
    if duplicate_count:
        raise SystemExit(f'Refusing to export: {duplicate_count} duplicate year/week/player groups found.')

    years = sorted({int(r['year']) for r in rows})
    by_season = defaultdict(list)
    by_career = defaultdict(list)
    for row in rows:
        by_season[(int(row['year']), int(row['player_id']))].append(row)
        by_career[int(row['player_id'])].append(row)

    all_season_rows = []
    for (year, player_id), weeks in by_season.items():
        first = weeks[0]
        points = round2(sum(float(w['points'] or 0) for w in weeks))
        starts = sum(int(w['is_starter'] or 0) for w in weeks)
        best = max(weeks, key=lambda w: float(w['points'] or 0))
        team_counts = Counter((int(w['fantasy_team_id']), clean(w['fantasy_team_name'])) for w in weeks)
        primary_team_id, primary_team_name = team_counts.most_common(1)[0][0]
        primary_owner = team_owners.get((year, primary_team_id), 'Unknown')
        record = [
            player_id, clean(first['player_name']), clean(first['position']), points,
            len(weeks), starts, round2(best['points']), int(best['week']),
            primary_team_name, primary_owner,
        ]
        all_season_rows.append((year, record))

    career_rows = []
    for player_id, weeks in by_career.items():
        first = weeks[0]
        seasons = len({int(w['year']) for w in weeks})
        points = round2(sum(float(w['points'] or 0) for w in weeks))
        starts = sum(int(w['is_starter'] or 0) for w in weeks)
        best = max(weeks, key=lambda w: float(w['points'] or 0))
        career_rows.append([
            player_id, clean(first['player_name']), clean(first['position']), seasons,
            points, len(weeks), starts, round2(best['points']), int(best['year']), int(best['week'])
        ])
    career_rows.sort(key=lambda p: (-p[4], p[1].lower()))

    highest_week = max(rows, key=lambda r: float(r['points'] or 0))
    highest_week_owner = team_owners.get((int(highest_week['year']), int(highest_week['fantasy_team_id'])), 'Unknown')
    highest_week_record = [
        round2(highest_week['points']), clean(highest_week['player_name']), clean(highest_week['position']),
        int(highest_week['year']), int(highest_week['week']), clean(highest_week['fantasy_team_name']),
        highest_week_owner, int(highest_week['is_starter'] or 0),
    ]

    highest_season_year, highest_season = max(all_season_rows, key=lambda item: item[1][3])
    highest_season_record = [
        highest_season[3], highest_season[1], highest_season[2], highest_season_year,
        highest_season[4], highest_season[5], highest_season[8], highest_season[9]
    ]

    career_leader = career_rows[0]
    career_record = [
        career_leader[4], career_leader[1], career_leader[2], career_leader[3],
        career_leader[5], career_leader[6], career_leader[7], career_leader[8], career_leader[9]
    ]

    out_dir = root / 'data' / 'players'
    out_dir.mkdir(parents=True, exist_ok=True)
    for year in years:
        season_rows = [record for row_year, record in all_season_rows if row_year == year]
        season_rows.sort(key=lambda p: (-p[3], p[1].lower()))
        payload = {
            'schemaVersion': 1,
            'year': year,
            'playerCount': len(season_rows),
            'players': season_rows[:SEASON_LIMIT],
            'leaderboardRows': min(SEASON_LIMIT, len(season_rows)),
        }
        (out_dir / f'{year}.json').write_text(
            json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8'
        )

    index = {
        'schemaVersion': 1,
        'seasonRange': [min(years), max(years)],
        'years': sorted(years, reverse=True),
        'playerCount': len(by_career),
        'records': {
            'highestWeek': highest_week_record,
            'highestSeason': highest_season_record,
            'careerPoints': career_record,
        },
        'careers': career_rows[:CAREER_LIMIT],
        'careerRows': min(CAREER_LIMIT, len(career_rows)),
    }
    (out_dir / 'index.json').write_text(
        json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8'
    )
    print(
        f'Wrote Player History: {len(by_career)} players, {len(years)} seasons, '
        f'top {CAREER_LIMIT} career / {SEASON_LIMIT} per season'
    )
    print('Highest week:', highest_week_record)
    print('Highest season:', highest_season_record)
    print('Career leader:', career_record)


if __name__ == '__main__':
    main()
