#!/usr/bin/env python3
"""Retry missing historical score weeks without replacing the public live board.

Only weeks strictly before the saved week are candidates. Historical failures
warn and defer until a later run; a changed live board is restored and fails
loudly. Playoff/bye slate support belongs to the separate playoff readiness fix.
"""
from __future__ import annotations

import argparse
import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from publish_current_season import validate_board
from update_matchup_leaderboards import update_leaderboards, update_streak_leaderboards

ROOT = Path(__file__).resolve().parents[1]


class LiveBoardViolation(RuntimeError):
    """Historical catch-up touched the live board; do not publish this run."""


def warning(reason: str, week: int | None = None) -> None:
    # Escape workflow command data, including exceptions with multiple lines.
    reason = str(reason).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    target = f' Week {week}' if week is not None else ''
    print(f'::warning::Completed-week catch-up deferred{target}: {reason}')


def guard_live_board(current: Path, original: bytes) -> None:
    try:
        if current.read_bytes() == original:
            return
    except OSError:
        pass
    try:
        current.write_bytes(original)
    except OSError as error:
        raise LiveBoardViolation(f'Live public board changed; restoration failed: {error}') from error
    raise LiveBoardViolation('Live public board was modified and has been restored.')


def fetch_week(season: int, week: int, output: Path, current: Path) -> None:
    """Force-fetch through the publisher, with no public-board/site writes."""
    subprocess.run([
        sys.executable, str(ROOT / 'scripts' / 'publish_current_season.py'),
        '--season', str(season), '--week', str(week), '--roster', str(current),
        '--output', str(output), '--no-sync-site-phase',
    ], check=True, timeout=120)


def write_if_changed(path: Path, value: dict) -> None:
    # Preserve original bytes (including formatting) when the payload is unchanged.
    if json.loads(path.read_text(encoding='utf-8')) == value:
        return
    payload = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    path.write_text(payload, encoding='utf-8')


def backfill_completed_weeks(current: Path, matchups_path: Path, streaks_path: Path,
                             fetch=None) -> list[int]:
    """Retry underfilled weeks 1..saved_week-1 using isolated temporary boards.

    Injectable fetch(season, week, output_path) writes a candidate board. Never
    infer finality from points, the calendar, or an edition. Require six contested
    final games with explicit ESPN winners. The current week uses normal publish.
    """
    original = current.read_bytes()
    try:
        saved = json.loads(original)
        season, saved_week = int(saved['season']), int(saved['week'])
        if not 1 <= saved_week <= 25:
            raise ValueError('Saved week must be between 1 and 25')
        matchups = json.loads(matchups_path.read_text(encoding='utf-8'))
        fetch = fetch or (lambda year, week, output: fetch_week(year, week, output, current))
        changed = []
        # OS temp directories never create candidates beneath the public data tree.
        with tempfile.TemporaryDirectory(prefix='completed-weeks-') as directory:
            for week in range(1, saved_week):
                rows = [row for row in matchups.get('currentSeasonScores', [])
                        if row['season'] == season and row['week'] == week]
                if len(rows) >= 12:
                    continue
                output = Path(directory) / f'week_{week:02d}.json'
                try:
                    try:
                        fetch(season, week, output)
                    finally:
                        # Also restore clobbers when the publisher itself raises.
                        guard_live_board(current, original)
                    board = json.loads(output.read_text(encoding='utf-8'))
                    if (board.get('season'), board.get('week')) != (season, week):
                        raise ValueError('Fetched season/week does not match requested week')
                    games = board['matchups']
                    if (len(games) != 6 or any(not game.get('away') or not game.get('home')
                                               or game.get('isBye') for game in games)):
                        warning('playoff/bye slate not supported by catch-up yet '
                                '(see playoff readiness); retry later', week)
                        continue
                    validate_board(board)
                    if not all(game['state'] == 'final' and game.get('winner') in
                               {'HOME', 'AWAY', 'TIE'} for game in games):
                        warning('not six final results with explicit winners; retry later', week)
                        continue
                    # An updater exception must not leave a partially merged week.
                    candidate = copy.deepcopy(matchups)
                    if update_leaderboards(candidate, board):
                        matchups = candidate
                        changed.append(week)
                        print(f'Week {week}: merged 12 verified final score rows.')
                except LiveBoardViolation:
                    raise
                except Exception as error:
                    # Bad JSON, invalid shapes and publisher failures never block live scores.
                    warning(f'{error}; retry later', week)
        guard_live_board(current, original)
        if changed:
            streaks = json.loads(streaks_path.read_text(encoding='utf-8'))
            update_streak_leaderboards(streaks, matchups['currentSeasonScores'])
            write_if_changed(matchups_path, matchups)
            write_if_changed(streaks_path, streaks)
        else:
            print('Completed-week catch-up: no-op; no archive files changed.')
        return changed
    finally:
        guard_live_board(current, original)


def main(argv: list[str] | None = None, *, fetch=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--current', type=Path, default=ROOT / 'data/current-season.json')
    parser.add_argument('--matchups', type=Path, default=ROOT / 'data/matchups.json')
    parser.add_argument('--streaks', type=Path, default=ROOT / 'data/streaks.json')
    args = parser.parse_args(argv)
    try:
        backfill_completed_weeks(args.current, args.matchups, args.streaks, fetch)
    except LiveBoardViolation as error:
        print(f'::error::{error}', file=sys.stderr)
        return 1
    except Exception as error:
        warning(f'{error}; retry later')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
