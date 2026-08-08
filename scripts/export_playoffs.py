#!/usr/bin/env python3
"""Export the 1048 Gate historical playoff archive from SQLite."""
from __future__ import annotations
import json,re,sqlite3,sys
from pathlib import Path

EARLY_FINISH = {
  2017: {'Jared Hall':1,'George Travis':2,'Ronnie Coiro':3,'Joey Dwulet':4,'Brian James':5,'Bryan Hunt':6,'Brian Heino':7,'Kyle Fowler':8,'JD Daley':9,'Chardo BRYCE':10,'Thomas Speer':11,'Vincent Cannarozzi':12},
  2018: {'Kyle Fowler':1,'George Travis':2,'Jared Hall':3,'JD Daley':4,'Vincent Cannarozzi':5,'Ed Perrine':6,'Bryan Hunt':7,'Brian Heino':8,'Thomas Connelly':9,'Trevor Hash':10,'Thomas Speer':11,'Ronnie Coiro':12},
}
ALIASES={'german joshua haro':'German Haro','tommy speer':'Thomas Speer','ronnie coiro':'Ronnie Coiro','joey dwulet':'Joey Dwulet','brian james':'Brian James','kyle fowler':'Kyle Fowler','thomas connelly':'Thomas Connelly'}

def clean(v): return re.sub(r'\s+',' ',str(v or '')).strip()
def owner_name(con,year,owner_id):
    r=con.execute('select display_name,first_name,last_name from owners where year=? and owner_id=?',(year,owner_id)).fetchone()
    name=clean(f"{r['first_name'] or ''} {r['last_name'] or ''}") or clean(r['display_name'])
    return ALIASES.get(name.lower(),name)

def main():
    root=Path(__file__).resolve().parents[1]
    db=Path(sys.argv[1]).expanduser().resolve() if len(sys.argv)>1 else root/'1048_gate.db'
    if not db.exists(): raise SystemExit(f'Database not found: {db}')
    con=sqlite3.connect(db); con.row_factory=sqlite3.Row
    seasons=[]
    for year in range(2017,2026):
        teams=[]; by_id={}
        for r in con.execute('select team_id,team_name,owner_id,standing,final_standing from teams where year=?',(year,)):
            owner=owner_name(con,year,r['owner_id'])
            finish=int(r['final_standing'] or 0) or None
            if year in EARLY_FINISH: finish=EARLY_FINISH[year].get(owner,finish)
            team={'id':r['team_id'],'team':clean(r['team_name']),'owner':owner,'seed':int(r['standing'] or 0),'finish':finish}
            teams.append(team); by_id[r['team_id']]=team
        champion=next((t for t in teams if t['finish']==1),None)
        runner=next((t for t in teams if t['finish']==2),None)
        rows=list(con.execute('select week,is_bye,matchup_type,home_team_id,home_team_name,home_score,away_team_id,away_team_name,away_score from games where year=? and is_playoff=1 order by week,home_team_id',(year,)))
        start=min(int(r['week']) for r in rows)
        games=[]
        for r in rows:
            typ=r['matchup_type'] or 'LEGACY_POSTSEASON'
            bracket='championship' if typ=='WINNERS_BRACKET' else 'consolation' if typ=='LOSERS_CONSOLATION_LADDER' else 'placement' if typ=='WINNERS_CONSOLATION_LADDER' else 'legacy'
            idx=int(r['week'])-start
            label=({'championship':{0:'Quarterfinals',1:'Semifinals',2:'Championship'}}.get(bracket,{}).get(idx) or (f'Consolation Week {idx+1}' if bracket=='consolation' else f'Placement Week {idx+1}' if bracket=='placement' else f'Postseason Week {idx+1}'))
            home=by_id.get(r['home_team_id']); away=by_id.get(r['away_team_id']) if r['away_team_id'] is not None else None
            hs=float(r['home_score'] or 0); aws=float(r['away_score'] or 0)
            winner=1 if (r['is_bye'] or hs>aws) else 2 if aws>hs else 0
            games.append([int(r['week']),bracket,label,int(r['is_bye'] or 0),home['seed'] if home else None,clean(r['home_team_name']),home['owner'] if home else '',round(hs,2),away['seed'] if away else None,clean(r['away_team_name']) if away else None,away['owner'] if away else None,round(aws,2) if away else None,winner])
        field=sorted([t for t in teams if 1<=t['seed']<=6],key=lambda t:t['seed'])
        seasons.append([year,champion['owner'] if champion else '',champion['team'] if champion else '',runner['owner'] if runner else '',runner['team'] if runner else '',[[t['seed'],t['team'],t['owner']] for t in field],games])
    out=root/'data'/'playoffs.json'
    out.write_text(json.dumps({'schemaVersion':1,'seasonRange':{'from':2017,'to':2025},'seasons':seasons},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'Wrote {out}: {len(seasons)} seasons, {sum(len(s[6]) for s in seasons)} postseason rows')
if __name__=='__main__': main()
