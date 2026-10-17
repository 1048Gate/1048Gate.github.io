"""Offline failure/recovery fixtures: no ESPN or private database requests."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import test_publish_current_season as fixtures
import publish_current_season as publisher
import collect_fantasy_data as collector


class PublicScoreReliabilityTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.PublishCurrentSeasonTests()
        fixture.setUp()
        self.roster = {row['teamId']: row for row in fixture.roster_seed['standings']}
        self.standings, self.scoreboard = fixture.standings, fixture.scoreboard
        self.board = self.build()
        self.previous = copy.deepcopy(self.board)
        self.previous.update(projectionsFetchedAt='2026-09-09T10:00:00+00:00',
                             teamProjections=[{'teamId':team_id, 'projectedScore':0 if team_id == 1 else 120.5,
                                               'complete':True} for team_id in self.roster])

    def build(self):
        return publisher.build_board(season=2026, season_number=10, week=2,
            fetched_at='2026-09-10T00:00:00+00:00', standings_norm=self.standings,
            scoreboard_norm=self.scoreboard, roster=self.roster)

    def test_same_week_fallback_keeps_timestamp_and_marks_stale(self):
        result = publisher.retain_same_week_projections(self.board, self.previous)
        self.assertTrue(result['projectionsStale'])
        self.assertEqual(result['projectionsFetchedAt'], self.previous['projectionsFetchedAt'])
        self.assertEqual(result['teamProjections'], self.previous['teamProjections'])
        self.assertEqual(result['matchups'][0]['home']['projectedScore'], 0)
        self.assertEqual(result['matchups'][0]['home']['score'], 111)
        publisher.validate_board(result)

    def test_cross_week_and_cross_season_rejected(self):
        for field in ('week', 'season'):
            with self.subTest(field=field):
                previous = copy.deepcopy(self.previous)
                previous[field] -= 1
                result = publisher.retain_same_week_projections(copy.deepcopy(self.board), previous)
                self.assertNotIn('teamProjections', result)
                self.assertNotIn('projectedScore', result['matchups'][0]['home'])

    def test_bad_projection_fallback_is_not_reused(self):
        for change in ('missing', 'duplicate', 'nonfinite', 'timestamp'):
            previous = copy.deepcopy(self.previous)
            if change == 'missing': previous['teamProjections'].pop()
            if change == 'duplicate': previous['teamProjections'][1]['teamId'] = 1
            if change == 'nonfinite': previous['teamProjections'][0]['projectedScore'] = float('nan')
            if change == 'timestamp': previous['projectionsFetchedAt'] = 'not-a-date'
            with self.subTest(change=change):
                self.assertNotIn('teamProjections', publisher.retain_same_week_projections(copy.deepcopy(self.board), previous))

    def test_fallback_only_copies_public_aggregate_fields(self):
        self.previous['teamProjections'][0]['roster'] = ['private player']
        result = publisher.retain_same_week_projections(self.board, self.previous)
        self.assertNotIn('private player', json.dumps(result))
        self.assertEqual(set(result['teamProjections'][0]), {'teamId','projectedScore','complete'})

    def test_projection_collection_failure_preserves_fallback_file(self):
        publisher.retain_same_week_projections(self.board, self.previous)
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'board.json'
            original = json.dumps(self.board)
            output.write_text(original)
            with patch.dict('os.environ', {'ESPN_S2':'fixture', 'ESPN_SWID':'fixture'}), \
                 patch.object(sys, 'argv', ['collector','--week','2','--board-output',str(output)]), \
                 patch.object(collector, 'request_espn', side_effect=RuntimeError('fixture collection failure')):
                self.assertEqual(collector.main(), 1)
            self.assertEqual(output.read_text(), original)

    def test_successful_collection_replaces_retained_totals(self):
        publisher.retain_same_week_projections(self.board, self.previous)
        snapshot = {'season':2026, 'week':2, 'fetched_at':'2026-09-10T00:01:00+00:00',
                    'settings':{'lineup_slots':[{'id':2,'count':1}]},
                    'teams':[{'id':team_id, 'roster':[{'lineup_slot_id':2, 'projected_points':100+team_id,
                              'name':'private player'}]} for team_id in self.roster]}
        result = collector.add_team_projections(self.board, snapshot)
        self.assertFalse(result['projectionsStale'])
        self.assertEqual(result['projectionsFetchedAt'], snapshot['fetched_at'])
        self.assertEqual(result['matchups'][0]['home']['projectedScore'], 101)
        self.assertNotIn('private player', json.dumps(result))
        publisher.validate_board(result)

    def test_invalid_public_scores_are_rejected(self):
        for change in ('missing_team','duplicate_team','week','score','record','missing_score'):
            board = copy.deepcopy(self.board)
            if change == 'missing_team': board['standings'].pop()
            if change == 'duplicate_team': board['matchups'][0]['away']['teamId'] = 1
            if change == 'week': board['matchups'][0]['week'] = 3
            if change == 'score': board['matchups'][0]['home']['score'] = float('inf')
            if change == 'record': board['standings'][0]['wins'] = -1
            if change == 'missing_score': board['matchups'][0]['home']['score'] = None
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                publisher.validate_board(board)

    def test_public_source_failure_does_not_replace_output(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'board.json'
            original = json.dumps(self.previous)
            output.write_text(original)
            with patch.dict('os.environ', {'ESPN_S2':'fixture','ESPN_SWID':'fixture'}), \
                 patch.object(sys, 'argv', ['publisher','--week','2','--roster',str(output),'--output',str(output),'--no-sync-site-phase']), \
                 patch.object(publisher, 'fetch_json', side_effect=RuntimeError('fixture score failure')):
                self.assertEqual(publisher.main(), 1)
            self.assertEqual(output.read_text(), original)

    def test_publisher_cli_retains_projections_without_extra_fetches(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'board.json'
            output.write_text(json.dumps(self.previous))
            with patch.dict('os.environ', {'ESPN_S2':'fixture','ESPN_SWID':'fixture'}), \
                 patch.object(sys, 'argv', ['publisher','--week','2','--roster',str(output),'--output',str(output),'--no-sync-site-phase']), \
                 patch.object(publisher, 'fetch_json', return_value={}) as fetch, \
                 patch.object(publisher, 'normalize_standings', return_value=self.standings), \
                 patch.object(publisher, 'normalize_scoreboard', return_value=self.scoreboard):
                self.assertEqual(publisher.main(), 0)
                self.assertEqual(fetch.call_count, 2)
            result = json.loads(output.read_text())
            self.assertTrue(result['projectionsStale'])
            self.assertEqual(result['projectionsFetchedAt'], self.previous['projectionsFetchedAt'])

    def test_invalid_source_never_overwrites_previous_public_file(self):
        malformed_points = [(key, value) for key in ('points_for', 'points_against')
                            for value in ('', False, True, '12.5', float('nan'), float('inf'))]
        for invalid in ['duplicate', 'missing_record', 'wrong_week', 'nonfinite', 'wrong_season', 'missing_live_score', *malformed_points]:
            standings, scoreboard = copy.deepcopy(self.standings), copy.deepcopy(self.scoreboard)
            if isinstance(invalid, tuple): standings['teams'][0][invalid[0]] = invalid[1]
            if invalid == 'duplicate': standings['teams'][1]['team_id'] = 1
            if invalid == 'missing_record': standings['teams'][0]['wins'] = None
            if invalid == 'wrong_week': scoreboard['games'][0]['matchup_period'] = 3
            if invalid == 'nonfinite': scoreboard['games'][0]['home']['score'] = float('nan')
            if invalid == 'wrong_season': scoreboard['season'] = 2025
            if invalid == 'missing_live_score':
                scoreboard['games'][0].update(status='STATUS_IN_PROGRESS', winner='UNDECIDED')
                scoreboard['games'][0]['home']['score'] = None
                scoreboard['games'][0]['away']['score'] = 0
            with self.subTest(invalid=invalid), tempfile.TemporaryDirectory() as folder:
                output = Path(folder) / 'board.json'
                original = json.dumps(self.previous)
                output.write_text(original)
                with patch.dict('os.environ', {'ESPN_S2':'fixture','ESPN_SWID':'fixture'}), \
                     patch.object(sys, 'argv', ['publisher','--week','2','--roster',str(output),'--output',str(output),'--no-sync-site-phase']), \
                     patch.object(publisher, 'fetch_json', return_value={}), \
                     patch.object(publisher, 'normalize_standings', return_value=standings), \
                     patch.object(publisher, 'normalize_scoreboard', return_value=scoreboard), \
                     self.assertRaises(RuntimeError):
                    publisher.main()
                self.assertEqual(output.read_text(), original)

    def test_validation_accepts_nondefault_season_but_rejects_explicit_mismatch(self):
        board = copy.deepcopy(self.board)
        board['season'] = 2027
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'board.json'
            output.write_text(json.dumps(board))
            for season_args in ([], ['--season','2027']):
                with patch.object(sys, 'argv', ['publisher','--validate-only','--output',str(output),*season_args]), \
                     patch.object(publisher, 'fetch_json') as fetch:
                    self.assertEqual(publisher.main(), 0)
                    fetch.assert_not_called()
            with patch.object(sys, 'argv', ['publisher','--validate-only','--output',str(output),'--season','2026']), \
                 self.assertRaisesRegex(RuntimeError, 'requested season/week mismatch'):
                publisher.main()


if __name__ == '__main__':
    unittest.main()
