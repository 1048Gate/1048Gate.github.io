#!/usr/bin/env python3
"""Export 1048 Gate draft history from the local SQLite archive."""
from __future__ import annotations
import json,re,sqlite3,sys
from pathlib import Path
ALIASES={'german joshua haro':'German Haro','tommy speer':'Thomas Speer'}
def clean(v): return re.sub(r'\s+',' ',str(v or '')).strip()
def person_name(r):
    n=clean(f"{r['first_name'] or ''} {r['last_name'] or ''}") or clean(r['display_name'])
    return ALIASES.get(n.lower(),n)
def main():
    root=Path(__file__).resolve().parents[1]
    db=Path(sys.argv[1]).expanduser().resolve() if len(sys.argv)>1 else root/'1048_gate.db'
    if not db.exists(): raise SystemExit(f'Database not found: {db}')
    con=sqlite3.connect(db);con.row_factory=sqlite3.Row
    owners={(r['year'],r['owner_id']):person_name(r) for r in con.execute('select year,owner_id,display_name,first_name,last_name from owners')}
    teams={(r['year'],r['team_id']):(clean(r['team_name']),owners.get((r['year'],r['owner_id']),'Unknown')) for r in con.execute('select year,team_id,team_name,owner_id from teams')}
    league={r['year']:clean(r['league_name']) for r in con.execute('select year,league_name from seasons')}
    years=[r[0] for r in con.execute('select distinct year from draft_picks order by year')]
    seasons=[]
    for year in years:
        team_rows=[];team_index={};picks=[]
        for r in con.execute('select * from draft_picks where year=? order by overall_pick',(year,)):
            team=teams.get((year,r['team_id']),(clean(r['team_name']),'Unknown'))
            if team not in team_index:
                team_index[team]=len(team_rows);team_rows.append(list(team))
            picks.append([int(r['overall_pick']),team_index[team],clean(r['player_name']),int(r['keeper'] or 0)])
        seasons.append([year,league.get(year,''),sum(p[3] for p in picks),team_rows,picks])
    payload={'schemaVersion':2,'seasonRange':[min(years),max(years)],'totalPicks':sum(len(s[4]) for s in seasons),'seasons':seasons}
    out=root/'data'/'drafts.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(f"Wrote {out}: {payload['totalPicks']} picks across {len(seasons)} seasons")
if __name__=='__main__': main()
