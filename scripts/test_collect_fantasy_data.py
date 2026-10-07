import json
import unittest
from unittest.mock import patch
from tempfile import TemporaryDirectory
from pathlib import Path
from collect_fantasy_data import main
from collect_fantasy_data import normalize, player_row


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
        private,public=normalize(*self.fixtures(),2026,1237285,5)
        self.assertEqual(private['teams'][0]['roster'][0]['lineup_slot'],'Bench')
        self.assertEqual([row['availability'] for row in private['available_players']],['FREEAGENT','WAIVERS'])
        text=json.dumps([private,public]); self.assertNotIn('secret',text)
        for key in ['teams','available_players','settings','lineup_slot','availability','percent_owned','Private Team']:
            self.assertNotIn(key,json.dumps(public))
        self.assertEqual(next(p for p in public['players'] if p['id']==2)['projected_points'],0)
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
            output=Path(folder)/'projections.json'
            with patch.dict('os.environ',{'ESPN_S2':'cookie','ESPN_SWID':'cookie','SUPABASE_URL':'https://example.test','SUPABASE_SERVICE_ROLE_KEY':'service'}), \
                 patch('sys.argv',['collector','--week','5','--public-output',str(output)]), \
                 patch('collect_fantasy_data.request_espn',side_effect=[league,pool,{'players':[]}]), \
                 patch('collect_fantasy_data.supabase_request',side_effect=[[],None]) as database:
                self.assertEqual(main(),0)
                self.assertIn('teams',database.call_args_list[1].args[2]['payload'])
                public=json.loads(output.read_text())
                self.assertNotIn('teams',public)
                self.assertEqual([f.name for f in Path(folder).iterdir()],['projections.json'])
    def test_private_save_failure_preserves_public_file(self):
        league,pool=self.fixtures();league['scoringPeriodId']=5
        with TemporaryDirectory() as folder:
            output=Path(folder)/'projections.json';output.write_text('previous')
            with patch.dict('os.environ',{'ESPN_S2':'cookie','ESPN_SWID':'cookie','SUPABASE_URL':'https://example.test','SUPABASE_SERVICE_ROLE_KEY':'service'}), \
                 patch('sys.argv',['collector','--week','5','--public-output',str(output)]), \
                 patch('collect_fantasy_data.request_espn',side_effect=[league,pool,{'players':[]}]), \
                 patch('collect_fantasy_data.supabase_request',side_effect=RuntimeError('private response')):
                self.assertEqual(main(),1)
                self.assertEqual(output.read_text(),'previous')
    def test_nonfinite_projection_is_missing(self):
        self.assertIsNone(player_row({'player':player(points=float('nan'))},2026,5)['projected_points'])


if __name__=='__main__':unittest.main()
