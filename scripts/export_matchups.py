#!/usr/bin/env python3
"""Export current-member head-to-head summaries from the local SQLite archive."""
from __future__ import annotations
import json,re,sqlite3,sys
from pathlib import Path

CURRENT_MEMBERS=['George Travis','Jared Hall','Kyle Fowler','Bryan Hunt','Brian Heino','Vincent Cannarozzi','James Brochu','JD Daley','Thomas Speer','Collin Krum','German Haro','Trevor Hash']
ALIASES={
    'chardo bryce':'Chardo Bryce',
    'german joshua haro':'German Haro',
    'ronnie coiro':'Ronnie Coiro',
    'tommy speer':'Thomas Speer',
}

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
        hn=clean(person_name(owner_row[(y,ho)]));an=clean(person_name(owner_row[(y,ao)]))
        hn=ALIASES.get(name_key(hn),canon.get(name_key(hn),hn));an=ALIASES.get(name_key(an),canon.get(name_key(an),an))
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
    ranked_high=sorted(sides,key=lambda x:(-x[0],x[5][0],x[5][1],x[1].lower()))
    ranked_low=sorted((side for side in sides if not side[5][2]),key=lambda x:(x[0],x[5][0],x[5][1],x[1].lower()))
    high=ranked_high[0];low=ranked_low[0];nonties=[g for g in games if g[6]!=g[9]]
    blow=max(nonties,key=lambda g:abs(g[6]-g[9]));close=min(nonties,key=lambda g:abs(g[6]-g[9]));combined=max(games,key=lambda g:g[6]+g[9])
    records={
      'highestScore':[high[0],high[1],high[2],high[3],high[4],high[5][0],high[5][1],high[5][2]],
      'lowestScore':[low[0],low[1],low[2],low[3],low[4],low[5][0],low[5][1],low[5][2]],
      'biggestBlowout':[round(abs(blow[6]-blow[9]),2),blow[4],blow[6],blow[7],blow[9],blow[0],blow[1],blow[2]],
      'closestGame':[round(abs(close[6]-close[9]),2),close[4],close[6],close[7],close[9],close[0],close[1],close[2]],
      'highestCombined':[round(combined[6]+combined[9],2),combined[4],combined[6],combined[7],combined[9],combined[0],combined[1],combined[2]]}
    leaderboard_row=lambda side:[side[0],side[1],side[2],side[3],side[4],side[5][0],side[5][1],side[5][2]]
    def game_row(game, metric):
        y,w,po,typ,a,at,sa,b,bt,sb=game
        if sb>sa: a,at,sa,b,bt,sb=b,bt,sb,a,at,sa
        return [round(metric,2),a,at,sa,b,bt,sb,y,w,po,typ]
    competitive=[g for g in nonties if g[3] not in {'LOSERS_CONSOLATION_LADDER','WINNERS_CONSOLATION_LADDER'}]
    archive_leaderboards={
      'highestScores':[leaderboard_row(side) for side in ranked_high[:5]],
      'lowestScores':[leaderboard_row(side) for side in ranked_low[:5]],
      'biggestBlowouts':[game_row(g,abs(g[6]-g[9])) for g in sorted(competitive,key=lambda g:(-abs(g[6]-g[9]),g[0],g[1]))[:3]],
      'closestGames':[game_row(g,abs(g[6]-g[9])) for g in sorted(nonties,key=lambda g:(abs(g[6]-g[9]),g[0],g[1]))[:3]],
      'highestCombinedGames':[game_row(g,g[6]+g[9]) for g in sorted(games,key=lambda g:(-(g[6]+g[9]),g[0],g[1]))[:3]],
    }
    payload={
      'schemaVersion':2,
      'seasonRange':{'from':min(g[0] for g in games),'to':max(g[0] for g in games)},
      'gameCount':len(games),
      'archiveGameCount':len(games),
      'participants':CURRENT_MEMBERS,
      'records':records,
      'leaderboards':archive_leaderboards,
      'archiveLeaderboards':archive_leaderboards,
      'currentSeasonScores':[],
      'pairs':pair_rows,
    }
    out=root/'data'/'matchups.json';out.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'Wrote {out}: {len(games)} games, {len(pair_rows)} current-member pairings')
if __name__=='__main__': main()
