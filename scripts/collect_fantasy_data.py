#!/usr/bin/env python3
"""Publish allowlisted ESPN projections; store normalized private snapshots in Supabase.

No raw responses, account details, or cookies are saved. Private snapshots are
sent directly to Supabase and are never written into the site's data directory.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from import_transactions_to_supabase import supabase_request
from fetch_current import BASE, DEFAULT_LEAGUE_ID, DEFAULT_SEASON

POSITIONS = {1:'QB', 2:'RB', 3:'WR', 4:'TE', 5:'K', 16:'D/ST'}
SLOTS = {0:'QB', 2:'RB', 4:'WR', 6:'TE', 16:'D/ST', 17:'K', 20:'Bench', 21:'IR', 23:'FLEX', 7:'OP', 3:'RB/WR', 5:'WR/TE'}
AVAILABLE_LIMIT = 1000


def request_espn(season, league_id, views, week=None, filters=None):
    query = [('view', view) for view in views]
    if week is not None: query.append(('scoringPeriodId', str(week)))
    url = f'{BASE}/seasons/{season}/segments/0/leagues/{league_id}?{urllib.parse.urlencode(query)}'
    headers = {'Accept':'application/json', 'User-Agent':'1048Gate-fantasy-desk/1.0',
               'Cookie':f"espn_s2={os.environ['ESPN_S2']}; SWID={os.environ['ESPN_SWID']}"}
    if filters: headers['X-Fantasy-Filter'] = json.dumps(filters)
    label = ','.join(views)
    for attempt in range(3):
        retryable = False
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
                result = json.load(response)
            if not isinstance(result, dict):
                raise RuntimeError(f'ESPN {label}: unexpected response shape; previous saved data was retained.')
            return result
        except urllib.error.HTTPError as error:
            # Only expose the status: response bodies and exception text can contain private data.
            reason = f'HTTP {error.code}'
            retryable = error.code == 429 or 500 <= error.code <= 599
            error.close()
        except (urllib.error.URLError, TimeoutError):
            reason = 'network connection failed'
            retryable = True
        except json.JSONDecodeError:
            reason = 'invalid JSON response'
        if retryable and attempt < 2:
            time.sleep(2 ** attempt)
            continue
        raise RuntimeError(f'ESPN {label}: {reason}; previous saved data was retained.') from None



def number(value):
    if isinstance(value, bool): return None
    try: result = float(value)
    except (TypeError, ValueError): return None
    return result if math.isfinite(result) else None


def player_row(entry, season, week, lineup=False):
    card = entry.get('playerPoolEntry') or entry
    player = card.get('player') or {}
    projected = None
    for stat in player.get('stats') or []:
        if stat.get('seasonId') == season and stat.get('scoringPeriodId') == week and stat.get('statSourceId') == 1:
            projected = number(stat.get('appliedTotal'))
            if projected is not None: break
    row = {'id':player.get('id', card.get('id')), 'name':str(player.get('fullName') or 'Unknown player'),
           'position':POSITIONS.get(player.get('defaultPositionId'), 'Unknown'),
           'nfl_team_id':player.get('proTeamId'), 'injury_status':str(player.get('injuryStatus') or ''),
           'projected_points':projected, 'percent_owned':number((player.get('ownership') or {}).get('percentOwned'))}
    if lineup:
        slot = entry.get('lineupSlotId')
        row.update(lineup_slot_id=slot, lineup_slot=SLOTS.get(slot, f'Slot {slot}'),
                   eligible_slots=[SLOTS.get(slot, f'Slot {slot}') for slot in player.get('eligibleSlots') or []])
    else: row['availability'] = card.get('status')
    return row


def normalize(league, pool, season, league_id, week):
    teams = []
    for team in league.get('teams') or []:
        roster = [player_row(entry, season, week, True) for entry in (team.get('roster') or {}).get('entries') or []]
        teams.append({'id':team['id'], 'name':str(team.get('name') or team.get('location') or f"Team {team['id']}"), 'roster':roster})
    if not teams or any(not team['roster'] for team in teams):
        raise RuntimeError('ESPN returned missing rosters; refusing to save an incomplete snapshot.')
    available = [player_row(entry, season, week) for entry in pool.get('players') or [] if entry.get('status') in ('FREEAGENT','WAIVERS')]
    if not available: raise RuntimeError('ESPN returned no available players; refusing to overwrite the last snapshot.')
    settings = league.get('settings') or {}
    scoring = settings.get('scoringSettings') or {}
    slots = (settings.get('rosterSettings') or {}).get('lineupSlotCounts') or {}
    timestamp = datetime.now(timezone.utc).isoformat()
    snapshot = {'schema_version':1, 'source':'ESPN', 'season':season, 'league_id':league_id, 'week':week, 'fetched_at':timestamp,
                'settings':{'scoring_type':scoring.get('scoringType'),
                            'scoring_items':[{key:item.get(key) for key in ('statId','points','pointsOverrides')} for item in scoring.get('scoringItems') or []],
                            'lineup_slots':[{'id':int(key), 'name':SLOTS.get(int(key),f'Slot {key}'), 'count':count} for key,count in slots.items()]},
                'teams':teams, 'available_players':available,
                'available_pool':{'limit':AVAILABLE_LIMIT, 'complete':False, 'selection':'Top available players by ESPN ownership; not the full player universe.'}}
    # Public feed contains player projections only: no fantasy team, lineup, availability, or settings.
    public_players = {}
    for row in [player for team in teams for player in team['roster']] + available:
        public_players[row['id']] = {key:row[key] for key in ('id','name','position','nfl_team_id','injury_status','projected_points')}
    projections = {'schema_version':1, 'source':'ESPN · league scoring', 'season':season, 'week':week, 'fetched_at':timestamp,
                   'players':sorted(public_players.values(), key=lambda player:-(player['projected_points'] if player['projected_points'] is not None else -999))}
    if not any(player['projected_points'] is not None for player in projections['players']):
        raise RuntimeError('No weekly ESPN projections returned; previous saved data was retained.')
    return snapshot, projections


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season',type=int,default=DEFAULT_SEASON)
    parser.add_argument('--week',type=int)
    parser.add_argument('--public-output',type=Path,default=Path('data/player-projections.json'))
    args = parser.parse_args()
    if not all(os.getenv(key) for key in ('ESPN_S2','ESPN_SWID')):
        print('ESPN credentials are missing.',file=sys.stderr); return 2
    league_id = int(os.getenv('ESPN_LEAGUE_ID',DEFAULT_LEAGUE_ID))
    try:
        league = request_espn(args.season,league_id,['mSettings','mTeam','mRoster'],args.week)
        week = args.week or league.get('scoringPeriodId')
        if not isinstance(week,int) or not 1 <= week <= 25: raise RuntimeError('Invalid ESPN scoring period.')
        if args.week is None:
            league = request_espn(args.season,league_id,['mSettings','mTeam','mRoster'],week)
        pool = request_espn(args.season,league_id,['kona_player_info'],week,{'players':{
            'filterStatus':{'value':['FREEAGENT','WAIVERS']}, 'limit':AVAILABLE_LIMIT,
            'sortPercOwned':{'sortPriority':1,'sortAsc':False}}})
        # Fetch weekly stat detail for rostered players too; mRoster can omit weekly stats.
        roster_ids = [entry.get('playerPoolEntry', {}).get('player', {}).get('id')
                      for team in league.get('teams') or []
                      for entry in (team.get('roster') or {}).get('entries') or []]
        roster_ids = [pid for pid in roster_ids if pid is not None]
        if roster_ids:
            details = request_espn(args.season,league_id,['kona_playercard'],week,{'players':{
                'filterIds':{'value':roster_ids},
                'filterStatsForTopScoringPeriodIds':{
                    'value':week, 'additionalValue':[f'00{args.season}',f'10{args.season}']}}})
            by_id = {entry['player']['id']:entry['player'] for entry in details.get('players') or [] if entry.get('player')}
            for team in league.get('teams') or []:
                for entry in (team.get('roster') or {}).get('entries') or []:
                    card = entry.get('playerPoolEntry') or {}
                    pid = (card.get('player') or {}).get('id')
                    if pid in by_id: card['player'] = by_id[pid]
        snapshot, projections = normalize(league,pool,args.season,league_id,week)
        if os.getenv('SUPABASE_URL') and os.getenv('SUPABASE_SERVICE_ROLE_KEY'):
            # Never echo server response bodies: they can include private payloads.
            try:
                latest = supabase_request('GET',f'fantasy_snapshots?season=eq.{args.season}&select=payload&order=fetched_at.desc&limit=1') or []
                previous = dict(latest[0]['payload']) if latest else {}
                current = dict(snapshot)
                previous.pop('fetched_at',None); current.pop('fetched_at',None)
                if previous != current:
                    supabase_request('POST','fantasy_snapshots?on_conflict=season,fetched_at',
                                     {'season':args.season,'week':week,'fetched_at':snapshot['fetched_at'],'payload':snapshot},
                                     prefer='resolution=ignore-duplicates,return=minimal')
            except RuntimeError:
                raise RuntimeError('Private snapshot save failed; no private data was written to disk.') from None
            print('Private ESPN archive is current (unchanged snapshots are not duplicated).')
        else: print('Private save skipped: configure existing Supabase service credentials for this workflow.')
        args.public_output.parent.mkdir(parents=True,exist_ok=True)
        temporary = args.public_output.with_suffix('.tmp')
        temporary.write_text(json.dumps(projections,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
        temporary.replace(args.public_output)
        print(f'Published {len(projections["players"])} player projections for Week {week}.')
        return 0
    except RuntimeError as exc:
        print(str(exc),file=sys.stderr); return 1


if __name__ == '__main__': raise SystemExit(main())
