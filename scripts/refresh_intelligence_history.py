#!/usr/bin/env python3
"""Refresh historical Intelligence Book facts from public verified exports."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
load=lambda name:json.loads((ROOT/'data'/name).read_text(encoding='utf-8'))
fmt=lambda value:f'{value:g}'

def playoff_game(year,row):
    if row[3] or row[8] is None:return None
    left=(row[6],row[5],float(row[7]));right=(row[10],row[9],float(row[11]))
    winner,loser=(left,right) if left[2]>right[2] else (right,left)
    return {'winner':winner[0],'winnerTeam':winner[1],'winnerScore':winner[2],
            'loser':loser[0],'loserTeam':loser[1],'loserScore':loser[2],
            'margin':round(winner[2]-loser[2],2),'combined':round(winner[2]+loser[2],2),
            'year':year,'week':row[0],'playoff':True,'label':row[2]}

def main():
    data=load('intelligence.json');matchups=load('matchups.json');playoffs=load('playoffs.json')
    notes=load('champion-notes.json')['notes'];streaks=load('streaks.json')
    games=[game for season in playoffs['seasons'] for row in season[6] if (game:=playoff_game(season[0],row))]
    championships=sorted((g for g in games if g['label']=='Championship'),key=lambda g:g['year'])
    data['games']['championships']=championships
    data['games']['closestPlayoff']=sorted(games,key=lambda g:(g['margin'],g['year'],g['week']))[:8]
    data['games']['playoffBlowouts']=sorted(games,key=lambda g:(-g['margin'],g['year'],g['week']))[:8]
    low=matchups['records']['lowestScore']
    low_game={'winner':low[3],'winnerTeam':low[4],'winnerScore':None,'loser':low[1],
              'loserTeam':low[2],'loserScore':low[0],'margin':None,'combined':None,
              'year':low[5],'week':low[6],'playoff':bool(low[7]),'label':'Regular'}
    data['games']['lowestScore']=low_game
    for title in data['titles']:title['note']=notes[str(title['year'])]
    finals={g['year']:g for g in championships}
    for item in data['heartbreaks']:
        game=finals.get(item['year'])
        if not game:continue
        if item['kind']=='championship-loss':
            item.update(owner=game['loser'],title=f"{game['loser']} lost the {game['year']} championship",
                        detail=f"{game['winner']} {fmt(game['winnerScore'])} – {fmt(game['loserScore'])} {game['loser']}.",
                        margin=game['margin'],opponent=game['winner'])
        elif item['kind']=='runner-up':item.update(margin=game['margin'],opponent=game['winner'])
    data['heartbreaks']=[item for item in data['heartbreaks'] if item['kind']!='close-playoff']
    for game in data['games']['closestPlayoff'][:3]:
        data['heartbreaks'].append({'id':f"close-{game['year']}-{game['week']}-{game['loser'].lower().replace(' ','-')}",
          'year':game['year'],'kind':'close-playoff','owner':game['loser'],
          'title':f"{game['loser']} lost a {game['label'].lower()} by {fmt(game['margin'])}",
          'detail':f"{game['winner']} {fmt(game['winnerScore'])} – {fmt(game['loserScore'])} {game['loser']} · {game['year']} {game['label']}.",
          'margin':game['margin'],'opponent':game['winner']})
    for record in data['records']:
        if record['id']=='low-week':record.update(value=fmt(low[0]),detail=f"{low[1]} · {low[2]} vs {low[3]} · {low[5]} W{low[6]}",owners=[low[1]],year=low[5])
        elif record['id']=='losing-streak':
            streak=streaks['leaderboards']['losingStreaks'][0]
            record.update(value=f"{streak['games']} straight",detail=f"{streak['manager']} · {streak['team']} · {streak['season']} W{streak['startWeek']}–W{streak['endWeek']} regular season",owners=[streak['manager']],year=streak['season'])
        elif record['id']=='german-last':record['label']='Two last-place finishes'
    for owner in data['owners']:
        owner['heartbreaks']=[item for item in data['heartbreaks'] if item.get('owner')==owner['owner']]
    (ROOT/'data'/'intelligence.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Refreshed Intelligence Book historical facts.')

if __name__=='__main__':main()
