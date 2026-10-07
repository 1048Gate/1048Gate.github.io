import json
import io
import urllib.error
import unittest
from unittest.mock import patch
from tempfile import TemporaryDirectory
from pathlib import Path
from collect_fantasy_data import main
from collect_fantasy_data import normalize, player_row, request_espn, add_team_projections


def player(pid=1,points=12.5):
    return {'id':pid,'fullName':'Test Player','defaultPositionId':2,'proTeamId':1,
            'ownership':{'percentOwned':90},'eligibleSlots':[2,23,20],
            'stats':[{'seasonId':2026,'scoringPeriodId':0,'statSourceId':1,'appliedTotal':300},
                     {'seasonId':2025,'scoringPeriodId':5,'statSourceId':1,'appliedTotal':50},
                     {'seasonId':2026,'scoringPeriodId':5,'statSourceId':0,'appliedTotal':40},
                     {'seasonId':2026,'scoringPeriodId':5,'statSourceId':1,'appliedTotal':points}]}


class FantasyDataTests(unittest.TestCase):
    def fixtures(self):
        league={'members':[{'email':'secret@example.test'}], 'credentials':'secret',
                'settings':{'scoringSettings':{'scoringItems':[{'statId':53,'points':1,'private':'secret'}]},
                            'rosterSettings':{'lineupSlotCounts':{'2':2,'20':7}}},
                'teams':[{'id':10,'name':'Private Team','owners':['secret-id'],
                          'roster':{'entries':[{'lineupSlotId':20,'playerPoolEntry':{'player':player()}}]}}]}
        pool={'players':[{'status':'FREEAGENT','player':player(2,0)},
                         {'status':'WAIVERS','player':player(3,None)},
                         {'status':'ONTEAM','player':player(4)}]}
        return league,pool
    def test_exact_week_projection_not_actual_or_season(self):
        self.assertEqual(player_row({'player':player()},2026,5)['projected_points'],12.5)
        self.assertIsNone(player_row({'player':player()},2026,6)['projected_points'])
    def test_allowlist_and_private_public_boundary(self):
        private=normalize(*self.fixtures(),2026,1237285,5)
        self.assertEqual(private['teams'][0]['roster'][0]['lineup_slot'],'Bench')
        self.assertEqual([row['availability'] for row in private['available_players']],['FREEAGENT','WAIVERS'])
        text=json.dumps(private); self.assertNotIn('secret',text)
        self.assertFalse(private['available_pool']['complete'])
    def test_reject_missing_rosters_and_unavailable_pool(self):
        league,pool=self.fixtures()
        league['teams'][0]['roster']['entries']=[]
        with self.assertRaises(RuntimeError):normalize(league,pool,2026,1237285,5)
        league,pool=self.fixtures()
        with self.assertRaises(RuntimeError):normalize(league,{},2026,1237285,5)
    def test_reject_no_weekly_projections(self):
        league,pool=self.fixtures()
        with self.assertRaises(RuntimeError):normalize(league,pool,2026,1237285,6)
    def test_collector_sends_private_data_only_to_database(self):
        league,pool=self.fixtures()
        league['scoringPeriodId']=5
        with TemporaryDirectory() as folder:
            output=Path(folder)/'board.json'
            output.write_text(json.dumps({'season':2026,'week':5,'matchups':[]}))
            with patch.dict('os.environ',{'ESPN_S2':'cookie','ESPN_SWID':'cookie','SUPABASE_URL':'https://example.test','SUPABASE_SERVICE_ROLE_KEY':'service'}), \
                 patch('sys.argv',['collector','--week','5','--board-output',str(output)]), \
                 patch('collect_fantasy_data.request_espn',side_effect=[league,pool,{'players':[{'player':player(1,17.5)}]}]) as espn, \
                 patch('collect_fantasy_data.supabase_request',side_effect=[[],None]) as database:
                self.assertEqual(main(),0)
                filters = espn.call_args_list[1].args[4]['players']
                self.assertEqual(set(filters), {'filterStatus', 'limit', 'sortPercOwned'})
                detail_request = espn.call_args_list[2].args
                self.assertEqual(detail_request[2], ['kona_player_info'])
                detail_filters = detail_request[4]['players']
                self.assertEqual(detail_filters['limit'],1)
                self.assertEqual(detail_filters['sortPercOwned'],{'sortPriority':1,'sortAsc':False})
                self.assertEqual(detail_filters['filterIds']['value'], [1])
                self.assertIn('teams',database.call_args_list[1].args[2]['payload'])
                public=json.loads(output.read_text())
                self.assertNotIn('roster',json.dumps(public))
                self.assertNotIn('Test Player',json.dumps(public))
                self.assertEqual(database.call_args_list[1].args[2]['payload']['teams'][0]['roster'][0]['projected_points'],17.5)
                self.assertEqual([f.name for f in Path(folder).iterdir()],['board.json'])
    def test_private_save_failure_preserves_public_file(self):
        league,pool=self.fixtures();league['scoringPeriodId']=5
        with TemporaryDirectory() as folder:
            output=Path(folder)/'board.json'
            output.write_text(json.dumps({'season':2026,'week':5,'matchups':[]}));output.write_text('previous')
            with patch.dict('os.environ',{'ESPN_S2':'cookie','ESPN_SWID':'cookie','SUPABASE_URL':'https://example.test','SUPABASE_SERVICE_ROLE_KEY':'service'}), \
                 patch('sys.argv',['collector','--week','5','--board-output',str(output)]), \
                 patch('collect_fantasy_data.request_espn',side_effect=[league,pool,{'players':[]}]), \
                 patch('collect_fantasy_data.supabase_request',side_effect=RuntimeError('private response')):
                self.assertEqual(main(),1)
                self.assertEqual(output.read_text(),'previous')
    def test_reject_missing_roster_projections_even_when_free_agents_have_them(self):
        league,pool = self.fixtures()
        league['teams'][0]['roster']['entries'][0]['playerPoolEntry']['player']['stats'] = []
        with self.assertRaisesRegex(RuntimeError,'No weekly ESPN roster projections'):
            normalize(league,pool,2026,1237285,5)

    def test_team_projections_only_count_complete_current_starters(self):
        private = normalize(*self.fixtures(),2026,1237285,5)
        private['settings']['lineup_slots'] = [{'id':2,'count':1},{'id':20,'count':7},{'id':21,'count':1}]
        roster = private['teams'][0]['roster']
        starter = dict(roster[0], id=9, lineup_slot_id=2, lineup_slot='RB', projected_points=0)
        roster.append(starter)
        board = {'season':2026,'week':5,'matchups':[{'away':{'teamId':10,'score':0},'home':{'teamId':11,'score':0}}]}
        result = add_team_projections(board,private)
        self.assertEqual(result['matchups'][0]['away']['projectedScore'],0)
        self.assertEqual(result['matchups'][0]['away']['score'],0)
        self.assertEqual(set(result['teamProjections'][0]),{'teamId','projectedScore','complete'})
        self.assertNotIn('Test Player',json.dumps(result))
        self.assertNotIn('percent_owned',json.dumps(result))
        self.assertNotIn('Bench',json.dumps(result))
        starter['projected_points']=None
        self.assertIsNone(add_team_projections(board,private)['teamProjections'][0]['projectedScore'])
        roster.pop()
        self.assertIsNone(add_team_projections(board,private)['teamProjections'][0]['projectedScore'])
        other = {'season':2026,'week':6}
        self.assertEqual(add_team_projections(other,private),other)
        self.assertNotIn('teamProjections',other)

    def test_nonfinite_projection_is_missing(self):
        self.assertIsNone(player_row({'player':player(points=float('nan'))},2026,5)['projected_points'])


class ESPNRequestTests(unittest.TestCase):
    def test_forbidden_is_safe_and_not_retried(self):
        error = urllib.error.HTTPError('https://private.test', 403, 'secret-cookie', {}, io.BytesIO(b'private body'))
        with patch.dict('os.environ', {'ESPN_S2':'secret-cookie', 'ESPN_SWID':'secret-id'}), \
             patch('collect_fantasy_data.urllib.request.urlopen', side_effect=error) as fetch, \
             patch('collect_fantasy_data.time.sleep') as sleep:
            with self.assertRaisesRegex(RuntimeError, 'ESPN kona_player_info: HTTP 403') as caught:
                request_espn(2026, 1237285, ['kona_player_info'], 5)
            self.assertNotIn('secret', str(caught.exception))
            self.assertNotIn('private', str(caught.exception))
            self.assertEqual(fetch.call_count, 1)
            sleep.assert_not_called()

    def test_transient_server_error_retries_then_succeeds(self):
        error = urllib.error.HTTPError('https://private.test', 503, 'private', {}, io.BytesIO())
        with patch.dict('os.environ', {'ESPN_S2':'cookie', 'ESPN_SWID':'cookie'}), \
             patch('collect_fantasy_data.urllib.request.urlopen', side_effect=[error, io.BytesIO(b'{"teams": []}')]) as fetch, \
             patch('collect_fantasy_data.time.sleep') as sleep:
            self.assertEqual(request_espn(2026, 1237285, ['mRoster'], 5), {'teams': []})
            self.assertEqual(fetch.call_count, 2)
            sleep.assert_called_once_with(1)

    def test_network_failure_is_bounded_and_safe(self):
        with patch.dict('os.environ', {'ESPN_S2':'cookie', 'ESPN_SWID':'cookie'}), \
             patch('collect_fantasy_data.urllib.request.urlopen', side_effect=urllib.error.URLError('secret-cookie')) as fetch, \
             patch('collect_fantasy_data.time.sleep') as sleep:
            with self.assertRaisesRegex(RuntimeError, 'ESPN mRoster: network connection failed') as caught:
                request_espn(2026, 1237285, ['mRoster'], 5)
            self.assertNotIn('secret', str(caught.exception))
            self.assertEqual(fetch.call_count, 3)
            self.assertEqual(sleep.call_count, 2)

    def test_invalid_json_is_safe_and_not_retried(self):
        with patch.dict('os.environ', {'ESPN_S2':'cookie', 'ESPN_SWID':'cookie'}), \
             patch('collect_fantasy_data.urllib.request.urlopen', return_value=io.BytesIO(b'private body')) as fetch:
            with self.assertRaisesRegex(RuntimeError, 'invalid JSON response'):
                request_espn(2026, 1237285, ['mRoster'], 5)
            self.assertEqual(fetch.call_count, 1)


if __name__=='__main__':unittest.main()
