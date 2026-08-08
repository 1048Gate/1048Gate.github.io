#!/usr/bin/env python3
from __future__ import annotations
import json, re, sqlite3, sys
from collections import defaultdict
from pathlib import Path

CURRENT=['George Travis','Jared Hall','Kyle Fowler','Bryan Hunt','Brian Heino','Vincent Cannarozzi','James Brochu','JD Daley','Thomas Speer','Collin Krum','German Haro','Trevor Hash']
ALIASES={'german joshua haro':'German Haro','tommy speer':'Thomas Speer','thomas speer':'Thomas Speer','jared hall':'Jared Hall','kyle fowler':'Kyle Fowler','brian james':'Brian James','ronnie coiro':'Ronnie Coiro'}
def clean(v): return re.sub(r'\s+',' ',str(v or '')).strip()
def canon(v):
    n=clean(v); return ALIASES.get(n.lower(),n)

def main():
    root=Path(__file__).resolve().parents[1]
    db=Path(sys.argv[1]).expanduser().resolve() if len(sys.argv)>1 else root/'1048_gate.db'
    if not db.exists(): raise SystemExit(f'Database not found: {db}')
    members=json.loads((root/'data'/'members.json').read_text(encoding='utf-8'))['members']
    members={m['name']:m for m in members}
    con=sqlite3.connect(db); con.row_factory=sqlite3.Row
    owners={(r['year'],r['owner_id']):canon(f"{r['first_name'] or ''} {r['last_name'] or ''}" or r['display_name']) for r in con.execute('select * from owners')}
    team_owner={(r['year'],r['team_id']):owners.get((r['year'],r['owner_id']),canon(r['owner_id'])) for r in con.execute('select * from teams')}

    h2h={n:defaultdict(lambda:[0,0,0,0.0,0.0]) for n in CURRENT}
    biggest_win={n:None for n in CURRENT}; worst_loss={n:None for n in CURRENT}
    for r in con.execute('select * from games where coalesce(is_bye,0)=0 order by year,week'):
        y=int(r['year']); h=team_owner.get((y,r['home_team_id'])); a=team_owner.get((y,r['away_team_id']))
        hs=float(r['home_score']); away=float(r['away_score'])
        if h in CURRENT and a in CURRENT:
            for me,op,ms,os in [(h,a,hs,away),(a,h,away,hs)]:
                row=h2h[me][op]
                if ms>os: row[0]+=1
                elif ms<os: row[1]+=1
                else: row[2]+=1
                row[3]+=ms; row[4]+=os
        for me,op,ms,os,myteam,opteam in [(h,a,hs,away,r['home_team_name'],r['away_team_name']),(a,h,away,hs,r['away_team_name'],r['home_team_name'])]:
            if me not in CURRENT: continue
            margin=round(ms-os,2)
            game=[round(abs(margin),2),canon(op),clean(myteam),round(ms,2),clean(opteam),round(os,2),y,int(r['week']),int(r['is_playoff'] or 0)]
            if margin>0 and (biggest_win[me] is None or margin>biggest_win[me][0]): biggest_win[me]=game
            if margin<0 and (worst_loss[me] is None or -margin>worst_loss[me][0]): worst_loss[me]=game

    drafts={n:[] for n in CURRENT}; keeper_counts={n:0 for n in CURRENT}; total_picks={n:0 for n in CURRENT}
    for r in con.execute('select * from draft_picks order by year desc,overall_pick'):
        name=team_owner.get((r['year'],r['team_id']))
        if name not in CURRENT: continue
        total_picks[name]+=1; keeper_counts[name]+=int(r['keeper'] or 0)
        if int(r['round_num'] or 0)==1: drafts[name].append([int(r['year']),int(r['overall_pick']),clean(r['player_name']),int(r['keeper'] or 0)])

    weapons={n:defaultdict(lambda:[0.0,0,9999,0]) for n in CURRENT}
    for r in con.execute('select year,fantasy_team_id,player_id,player_name,position,points from player_weeks where is_starter=1'):
        name=team_owner.get((r['year'],r['fantasy_team_id']))
        if name not in CURRENT: continue
        key=(int(r['player_id']),clean(r['player_name']),clean(r['position']))
        row=weapons[name][key]; row[0]+=float(r['points'] or 0); row[1]+=1; row[2]=min(row[2],int(r['year'])); row[3]=max(row[3],int(r['year']))

    profiles=[]
    for name in CURRENT:
        seasons=members[name]['seasons']
        playoff_years=[int(s[0]) for s in seasons if int(s[1])<=6]
        finals=[int(s[0]) for s in seasons if int(s[1])<=2]
        titles=[int(s[0]) for s in seasons if int(s[1])==1]
        best=min(seasons,key=lambda s:(int(s[1]),-float(s[4] or 0))) if seasons else None
        high=max(seasons,key=lambda s:float(s[4] or 0)) if seasons else None
        rival_rows=sorted(((sum(row[:3]),op,row) for op,row in h2h[name].items()),key=lambda x:(-x[0],x[1]))
        rival=None
        if rival_rows:
            meetings,op,row=rival_rows[0]; rival=[op,row[0],row[1],row[2],round(row[3],2),round(row[4],2),meetings]
        top=sorted(([round(row[0],2),pname,pos,row[1],row[2],row[3]] for (_,pname,pos),row in weapons[name].items()),key=lambda x:(-x[0],x[1]))[:5]
        profiles.append({'name':name,'resume':{'playoffAppearances':len(playoff_years),'playoffYears':playoff_years,'finals':len(finals),'finalYears':finals,'titles':len(titles),'titleYears':titles,'bestSeason':[int(best[0]),int(best[1]),clean(best[2]),clean(best[3]),round(float(best[4]),2)] if best else None,'highestPF':[int(high[0]),round(float(high[4]),2),clean(high[2])] if high else None},'rivalry':rival,'signature':{'biggestWin':biggest_win[name],'worstLoss':worst_loss[name]},'draft':{'totalPicks':total_picks[name],'keepers':keeper_counts[name],'firstRound':drafts[name][:6]},'weapons':top})

    payload={'schemaVersion':1,'seasonRange':[2017,2025],'playerRange':[2019,2025],'profiles':profiles}
    out=root/'data'/'manager-profiles.json'; out.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(f'Wrote {out}: {len(profiles)} manager profiles')
if __name__=='__main__': main()
