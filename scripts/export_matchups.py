#!/usr/bin/env python3
"""Export current-member head-to-head summaries from the local SQLite archive."""
from __future__ import annotations
import json,re,sqlite3,sys
from pathlib import Path

CURRENT_MEMBERS=['George Travis','Jared Hall','Kyle Fowler','Bryan Hunt','Brian Heino','Vincent Cannarozzi','James Brochu','JD Daley','Thomas Speer','Collin Krum','German Haro','Trevor Hash']

def clean(v): return re.sub(r'\s+',' ',str(v or '')).strip()
def name_key(v): return clean(v).lower()
def person_name(row):
    full=clean(f"{row['first_name'] or ''} {row['last_name'] or ''}")
    return full or clean(row['display_name'])

def main():
    root=Path(__file__).resolve().parents[1]
    db=Path(sys.argv[1]).expanduser().resolve() if len(sys.argv)>1 else root/'1048_gate.db'
    if not db.exists(): raise SystemExit(f'Database not found: {db}')
    con=sqlite3.connect(db);con.row_factory=sqlite3.Row
    owners=list(con.execute('select year,owner_id,display_name,first_name,last_name from owners order by year'))
    owner_row={(r['year'],r['owner_id']):r for r in owners}
    team_owner={(r['year'],r['team_id']):r['owner_id'] for r in con.execute('select year,team_id,owner_id from teams')}
    canon={name_key(n):n for n in CURRENT_MEMBERS}
    games=[]
    for r in con.execute('select * from games where coalesce(is_bye,0)=0 order by year,week,home_team_id'):
        y=int(r['year']);ho=team_owner[(y,r['home_team_id'])];ao=team_owner[(y,r['away_team_id'])]
        hn=person_name(owner_row[(y,ho)]);an=person_name(owner_row[(y,ao)])
        hn=canon.get(name_key(hn),clean(hn));an=canon.get(name_key(an),clean(an))
        games.append([y,int(r['week']),int(r['is_playoff'] or 0),r['matchup_type'] or 'NONE',hn,clean(r['home_team_name']),round(float(r['home_score']),2),an,clean(r['away_team_name']),round(float(r['away_score']),2)])
    pairs={}
    for g in games:
        y,w,po,typ,a,at,sa,b,bt,sb=g
        if a not in CURRENT_MEMBERS or b not in CURRENT_MEMBERS: continue
        key=tuple(sorted((a,b),key=str.lower));p=pairs.setdefault(key,{'all':[0,0,0,0.0,0.0],'regular':[0,0,0],'playoffs':[0,0,0]})
        scores={a:sa,b:sb};x,y_score=scores[key[0]],scores[key[1]];idx=0 if x>y_score else 1 if y_score>x else 2
        p['all'][idx]+=1;p['all'][3]+=x;p['all'][4]+=y_score;p['playoffs' if po else 'regular'][idx]+=1
    pair_rows=[]
    for key,p in sorted(pairs.items()):
        p['all'][3]=round(p['all'][3],2);p['all'][4]=round(p['all'][4],2)
        pair_rows.append([key[0],key[1],p['all'],p['regular'],p['playoffs']])
    sides=[]
    for g in games:
        sides.extend([(g[6],g[4],g[5],g[7],g[8],g),(g[9],g[7],g[8],g[4],g[5],g)])
    high=max(sides,key=lambda x:x[0]);low=min(sides,key=lambda x:x[0]);nonties=[g for g in games if g[6]!=g[9]]
    blow=max(nonties,key=lambda g:abs(g[6]-g[9]));close=min(nonties,key=lambda g:abs(g[6]-g[9]));combined=max(games,key=lambda g:g[6]+g[9])
    records={
      'highestScore':[high[0],high[1],high[2],high[3],high[4],high[5][0],high[5][1],high[5][2]],
      'lowestScore':[low[0],low[1],low[2],low[3],low[4],low[5][0],low[5][1],low[5][2]],
      'biggestBlowout':[round(abs(blow[6]-blow[9]),2),blow[4],blow[6],blow[7],blow[9],blow[0],blow[1],blow[2]],
      'closestGame':[round(abs(close[6]-close[9]),2),close[4],close[6],close[7],close[9],close[0],close[1],close[2]],
      'highestCombined':[round(combined[6]+combined[9],2),combined[4],combined[6],combined[7],combined[9],combined[0],combined[1],combined[2]]}
    payload={'schemaVersion':1,'seasonRange':{'from':2017,'to':2025},'gameCount':len(games),'participants':CURRENT_MEMBERS,'records':records,'pairs':pair_rows}
    out=root/'data'/'matchups.json';out.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'Wrote {out}: {len(games)} games, {len(pair_rows)} current-member pairings')
if __name__=='__main__': main()
