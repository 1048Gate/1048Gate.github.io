"""Offline catch-up regressions; all writes use OS temporary directories.

Default tests use small synthetic boards. To also replay the committed Week 6
history (requires git object 969cb200 and Node), from the repository root run:
  PYTHONDONTWRITEBYTECODE=1 H3_VERIFY_HISTORY=1 python -m unittest scripts/test_backfill_completed_weeks.py
PowerShell: set those two environment variables with $env:NAME='1' first.
The history replay copies this checkout's data into OS temp, obtains the old
board via git show, and cross-checks winners/scores against the committed edition.
It never fetches ESPN, rewrites a published edition, or writes worktree data.
"""
import copy
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from contextlib import redirect_stderr, redirect_stdout
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backfill_completed_weeks as backfill
from test_update_matchup_leaderboards import archive

ROOT = Path(__file__).resolve().parents[1]


def board(week):
    standings = [dict(teamId=i, owner=f'Owner {i}', team=f'Team {i}', wins=2,
                      losses=3, ties=0, pointsFor=500+i, pointsAgainst=500-i)
                 for i in range(1, 13)]
    games = []
    for i in range(6):
        away, home = [dict(standings[2*i+j], score=100+2*i+j) for j in range(2)]
        games.append(dict(week=week, state='final', winner='HOME', away=away, home=home))
    return dict(season=2026, week=week, phase=f'Week {week}', standings=standings, matchups=games)


def raw_rows(payload):
    """Extract each row's actual serialized bytes, including field formatting."""
    text = payload.decode('utf-8')
    position = text.index('[', text.index('"currentSeasonScores"')) + 1
    decoder = json.JSONDecoder()
    rows = {}
    while True:
        while text[position].isspace() or text[position] == ',':
            position += 1
        if text[position] == ']':
            return rows
        row, end = decoder.raw_decode(text, position)
        rows[(row['season'], row['week'], row['teamId'])] = text[position:end].encode('utf-8')
        position = end


class BackfillTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='test-completed-weeks-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.current, self.matchups, self.streaks = [self.root / name for name in
            ('current-season.json', 'matchups.json', 'streaks.json')]
        self.current.write_text(json.dumps(board(7)), encoding='utf-8')
        data = archive()
        for week in range(1, 6):
            backfill.update_leaderboards(data, board(week))
        self.matchups.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
        leaders = {name: [dict(games=20-i, manager=f'Historic owner {i}', team='Historic team',
                              season=2020, startWeek=1, endWeek=20-i, includesPostseason=False)
                          for i in range(3)]
                   for name in ('winningStreaks', 'losingStreaks')}
        streaks = dict(schemaVersion=2, seasonRange=dict(to=2026),
                       archiveLeaderboards=leaders, leaderboards=leaders)
        backfill.update_streak_leaderboards(streaks, data['currentSeasonScores'])
        self.streaks.write_text(json.dumps(streaks), encoding='utf-8')
        self.live = self.current.read_bytes()
        self.calls = []

    def fetch(self, season, week, output):
        self.calls.append((season, week))
        self.assertLess(week, json.loads(self.live)['week'], 'Never fetch the saved/current week')
        self.assertFalse(output.is_relative_to(ROOT / 'data'))
        self.assertFalse(output.is_relative_to(self.root))
        output.write_text(json.dumps(board(week)), encoding='utf-8')

    def run_backfill(self, fetch=None):
        output = io.StringIO()
        with redirect_stdout(output):
            changed = backfill.backfill_completed_weeks(
                self.current, self.matchups, self.streaks, fetch or self.fetch)
        self.assertEqual(self.live, self.current.read_bytes())
        return changed, output.getvalue()

    def run_main(self, fetch=None):
        output = io.StringIO()
        with redirect_stdout(output), redirect_stderr(output):
            code = backfill.main(['--current', str(self.current), '--matchups', str(self.matchups),
                                  '--streaks', str(self.streaks)], fetch=fetch or self.fetch)
        self.assertEqual(self.live, self.current.read_bytes())
        return code, output.getvalue()

    def snapshots(self):
        return [path.read_bytes() for path in (self.current, self.matchups, self.streaks)]

    def remove_week(self, week):
        data = json.loads(self.matchups.read_bytes())
        data['currentSeasonScores'] = [row for row in data['currentSeasonScores'] if row['week'] != week]
        self.matchups.write_text(json.dumps(data), encoding='utf-8')

    def test_fills_only_missing_historical_weeks_and_second_run_fetches_nothing(self):
        before = self.snapshots()
        self.assertEqual(self.run_backfill()[0], [6])
        after = json.loads(self.matchups.read_bytes())
        self.assertEqual(len(after['currentSeasonScores']), 72)
        existing = raw_rows(before[1])
        repaired = raw_rows(self.matchups.read_bytes())
        self.assertTrue(all(repaired[key] == value for key, value in existing.items()))
        self.assertEqual(before[2], self.streaks.read_bytes())
        self.assertEqual(self.calls, [(2026, 6)])
        saved = self.snapshots()
        self.calls.clear()
        changed, output = self.run_backfill()
        self.assertEqual(changed, [])
        self.assertIn('no-op', output)
        self.assertEqual(self.calls, [])
        self.assertEqual(saved, self.snapshots())

    def test_first_week_does_not_fetch(self):
        self.current.write_text(json.dumps(board(1)), encoding='utf-8')
        self.live = self.current.read_bytes()
        self.assertEqual(self.run_backfill()[0], [])
        self.assertEqual(self.calls, [])

    def test_points_and_undecided_never_finalize_even_with_final_state(self):
        for state in ('live', 'final'):
            def fetch(season, week, output):
                candidate = board(week)
                for game in candidate['matchups']:
                    game.update(state=state, winner='UNDECIDED')
                output.write_text(json.dumps(candidate), encoding='utf-8')
            with self.subTest(state=state):
                saved = self.snapshots()
                changed, output = self.run_backfill(fetch)
                self.assertEqual(changed, [])
                self.assertIn('::warning::Completed-week catch-up deferred Week 6:', output)
                self.assertEqual(saved, self.snapshots())

    def test_explicit_home_away_and_tie_winners_are_accepted(self):
        def fetch(season, week, output):
            candidate = board(week)
            candidate['matchups'][0]['winner'] = 'AWAY'
            candidate['matchups'][0]['away']['score'] = 110
            candidate['matchups'][1]['winner'] = 'TIE'
            candidate['matchups'][1]['away']['score'] = candidate['matchups'][1]['home']['score']
            output.write_text(json.dumps(candidate), encoding='utf-8')
        self.assertEqual(self.run_backfill(fetch)[0], [6])

    def test_partial_week_and_multiple_missing_weeks(self):
        data = json.loads(self.matchups.read_bytes())
        data['currentSeasonScores'] = [row for row in data['currentSeasonScores']
                                       if row['week'] != 2 or row['teamId'] == 1]
        self.matchups.write_text(json.dumps(data), encoding='utf-8')
        self.assertEqual(self.run_backfill()[0], [2, 6])
        self.assertEqual(self.calls, [(2026, 2), (2026, 6)])
        self.assertEqual(len(json.loads(self.matchups.read_bytes())['currentSeasonScores']), 72)

    def test_historical_failures_warn_continue_and_exit_zero(self):
        failures = ('exception', 'nonzero', 'bad_json', 'wrong_week', 'bad_shape', 'timeout')
        initial = self.snapshots()
        for failure in failures:
            with self.subTest(failure=failure):
                for path, payload in zip((self.current, self.matchups, self.streaks), initial):
                    path.write_bytes(payload)
                self.calls.clear()
                self.remove_week(2)
                def flaky(season, week, output):
                    if week == 2:
                        if failure == 'exception': raise Exception('ESPN unavailable')
                        if failure == 'nonzero': raise subprocess.CalledProcessError(2, ['publisher'])
                        if failure == 'timeout': raise subprocess.TimeoutExpired(['publisher'], 120)
                        if failure == 'bad_json': output.write_text('{bad JSON', encoding='utf-8')
                        if failure == 'bad_shape': output.write_text('[]', encoding='utf-8')
                        if failure == 'wrong_week': output.write_text(json.dumps(board(3)), encoding='utf-8')
                    else:
                        self.fetch(season, week, output)
                code, output = self.run_main(flaky)
                self.assertEqual(code, 0)
                self.assertIn('::warning::Completed-week catch-up deferred Week 2:', output)
                self.assertEqual(self.calls, [(2026, 6)])
                weeks = Counter(row['week'] for row in json.loads(self.matchups.read_bytes())['currentSeasonScores'])
                self.assertEqual(weeks[2], 0)
                self.assertEqual(weeks[6], 12)

    def test_real_publisher_nonzero_warns_and_exits_zero(self):
        with patch.object(backfill.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['publisher'])):
            code, output = self.run_main(lambda year, week, path: backfill.fetch_week(year, week, path, self.current))
        self.assertEqual(code, 0)
        self.assertIn('::warning::Completed-week catch-up deferred Week 6:', output)

    def test_live_board_clobber_is_restored_and_fails_even_when_fetch_raises(self):
        for raises in (False, True):
            with self.subTest(raises=raises):
                saved = self.snapshots()
                def clobber(season, week, output):
                    self.current.write_bytes(b'corrupted live board')
                    if raises: raise RuntimeError('publisher failed after clobber')
                    self.fetch(season, week, output)
                code, output = self.run_main(clobber)
                self.assertEqual(code, 1)
                self.assertIn('::error::Live public board was modified and has been restored.', output)
                self.assertEqual(saved, self.snapshots())

    def test_deleted_live_board_is_restored_and_fails(self):
        def delete(season, week, output):
            self.current.unlink()
        self.assertEqual(self.run_main(delete)[0], 1)

    def test_playoff_five_games_plus_two_byes_and_short_slate_defer(self):
        for byes in (False, True):
            def fetch(season, week, output):
                candidate = board(week)
                omitted = candidate['matchups'].pop()
                if byes:
                    candidate['matchups'].extend([
                        dict(week=week, state='final', isBye=True, away=None, home=omitted['away']),
                        dict(week=week, state='final', isBye=True, away=None, home=omitted['home'])])
                output.write_text(json.dumps(candidate), encoding='utf-8')
            with self.subTest(byes=byes):
                saved = self.snapshots()
                code, output = self.run_main(fetch)
                self.assertEqual(code, 0)
                self.assertIn('Week 6: playoff/bye slate not supported by catch-up yet (see playoff readiness); retry later', output)
                self.assertEqual(saved, self.snapshots())

    def test_duplicate_teams_are_rejected(self):
        def fetch(season, week, output):
            candidate = board(week)
            candidate['matchups'][0]['away'] = candidate['matchups'][0]['home']
            output.write_text(json.dumps(candidate), encoding='utf-8')
        self.assertEqual(self.run_backfill(fetch)[0], [])

    def test_production_fetch_uses_forced_week_and_temporary_output(self):
        with patch.object(backfill.subprocess, 'run') as run:
            output = self.root / 'candidate.json'
            backfill.fetch_week(2026, 6, output, self.current)
        args = run.call_args.args[0]
        self.assertIn('--no-sync-site-phase', args)
        self.assertEqual(args[args.index('--week') + 1], '6')
        self.assertEqual(args[args.index('--output') + 1], str(output))
        self.assertEqual(args[args.index('--roster') + 1], str(self.current))
        self.assertEqual(run.call_args.kwargs, dict(check=True, timeout=120))


@unittest.skipUnless(os.getenv('H3_VERIFY_HISTORY') == '1', 'Opt-in committed-history replay; see module docstring')
class CommittedHistoryTests(unittest.TestCase):
    def test_week_six_restore_from_committed_history(self):
        original = json.loads(subprocess.check_output(
            ['git', 'show', '969cb200:data/current-season.json'], cwd=ROOT))
        edition = json.loads((ROOT / 'data/newspaper_editions/2026/week_06.json').read_bytes())
        self.assertEqual((edition['source_status'], edition['validation_status']), ('verified_final', 'valid'))
        final = copy.deepcopy(original)
        for game in final['matchups']:
            result = next(result for result in edition['results'] if
                          {result['winnerOwner'], result['loserOwner']} ==
                          {game['away']['owner'], game['home']['owner']})
            for side in ('away', 'home'):
                prefix = 'winner' if game[side]['owner'] == result['winnerOwner'] else 'loser'
                self.assertEqual(Decimal(str(game[side]['score'])), Decimal(str(result[prefix + 'Score'])))
            game['state'] = 'final'
            game['winner'] = 'AWAY' if game['away']['owner'] == result['winnerOwner'] else 'HOME'
        with tempfile.TemporaryDirectory(prefix='h3-history-replay-') as directory:
            root = Path(directory)
            shutil.copytree(ROOT / 'data', root / 'data')
            current, matchups, streaks = [root / 'data' / name for name in
                ('current-season.json', 'matchups.json', 'streaks.json')]
            def snapshot():
                return {str(path.relative_to(root)): path.read_bytes() for path in (root / 'data').rglob('*') if path.is_file()}
            before = snapshot()
            calls = []
            def fetch(candidate):
                def replay(season, week, output):
                    calls.append((season, week))
                    self.assertLess(week, json.loads(current.read_bytes())['week'])
                    self.assertEqual((season, week), (candidate['season'], candidate['week']))
                    output.write_text(json.dumps(candidate), encoding='utf-8')
                return replay
            with patch.object(backfill, 'fetch_week', side_effect=AssertionError('No ESPN requests')):
                self.assertEqual(backfill.backfill_completed_weeks(current, matchups, streaks, fetch(original)), [])
                self.assertEqual(before, snapshot())
                self.assertEqual(backfill.backfill_completed_weeks(current, matchups, streaks, fetch(final)), [6])
                repaired = snapshot()
                existing, after = raw_rows(before[str(matchups.relative_to(root))]), raw_rows(matchups.read_bytes())
                self.assertEqual((len(existing), len(after)), (60, 72))
                self.assertTrue(all(after[key] == value for key, value in existing.items()))
                self.assertEqual(current.read_bytes(), before[str(current.relative_to(root))])
                self.assertEqual(streaks.read_bytes(), before[str(streaks.relative_to(root))])
                rows = json.loads(matchups.read_bytes())['currentSeasonScores']
                self.assertEqual(Counter(row['week'] for row in rows), Counter({week: 12 for week in range(1, 7)}))
                owners = json.loads(current.read_bytes())['standings']
                self.assertEqual(len(owners), 12)
                for owner in owners:
                    total = sum((Decimal(str(row['score'])) for row in rows if row['owner'] == owner['owner']), Decimal(0))
                    self.assertLessEqual(abs(total - Decimal(str(owner['pointsFor']))), Decimal('0.01'))
                self.assertTrue(all(before[name] == repaired[name] for name in before if 'newspaper_editions' in name))
                calls.clear()
                self.assertEqual(backfill.backfill_completed_weeks(current, matchups, streaks, fetch(final)), [])
                self.assertEqual(calls, [])
                self.assertEqual(repaired, snapshot())
                print('H3 HISTORY PASS: 60 -> 72 rows; 12 owners PF within 0.01; 60 existing rows, streaks, live board and editions byte-identical; second run byte-identical; UNDECIDED adds 0; current-week fetches 0; second-run fetches 0.')
            # Exercise the newspaper's ratings pass, restore only the live board,
            # then rebuild the public derivatives. All builders run in OS temp.
            for name in ('scripts', 'js'):
                shutil.copytree(ROOT / name, root / name, ignore=shutil.ignore_patterns('__pycache__'))
            for name in ('index.html', 'package.json'):
                shutil.copyfile(ROOT / name, root / name)
            def node(script):
                completed = subprocess.run(['node', f'scripts/{script}'], cwd=root,
                                           capture_output=True, text=True, timeout=120)
                self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            live = current.read_bytes()
            current.write_text(json.dumps(final), encoding='utf-8')
            node('build-futures.mjs')
            current.write_bytes(live)
            for script in ('build-futures.mjs', 'build-homepage-week.mjs', 'build-static-week-board.mjs',
                           'test-futures.mjs', 'test-homepage-week.mjs', 'test-static-week-board.mjs',
                           'check-homepage-week.mjs'):
                node(script)
            rebuilt = snapshot()
            self.assertEqual(current.read_bytes(), live)
            self.assertTrue(all(before[name] == rebuilt[name] for name in before if 'newspaper_editions' in name))
            rankings = json.loads((root / 'data/power-rankings.json').read_bytes())
            self.assertEqual(rankings['schedule']['knownWeeks'], list(range(1, 8)))
            self.assertEqual(rankings['scoring']['inputs']['completedWeeksUsed'], 6)
            print('H3 DERIVATIVES PASS: outgoing-week futures, live-board restore, futures/homepage/static rebuild and four checks passed; knownWeeks [1,2,3,4,5,6,7]; completedWeeksUsed 6; published editions byte-identical.')


if __name__ == '__main__':
    unittest.main()
