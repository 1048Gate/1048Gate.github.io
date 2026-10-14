"""Select the single Eastern Tuesday publication slot and completed ESPN week."""
import argparse
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo('America/New_York')


def publication_due(schedule: str, now: datetime) -> bool:
    local = now.astimezone(EASTERN)
    # Two UTC candidates, exactly one accepted for the current Eastern offset.
    # Accept delayed Actions starts after 7 AM on Tuesday as well.
    utc_hour = 7 - int(local.utcoffset().total_seconds() // 3600)
    return local.weekday() == 1 and local.hour >= 7 and schedule == f'0 {utc_hour} * * 2'


def completed_week(board: dict) -> int:
    games = board.get('matchups', [])
    final = len(games) == 6 and all(
        str(game.get('state', '')).lower() == 'final' and
        str(game.get('winner', '')).upper() in {'HOME', 'AWAY', 'TIE'}
        for game in games
    )
    week = int(board['week']) if final else int(board['week']) - 1
    if week < 1:
        raise ValueError('No completed previous week is available.')
    return week


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--schedule')
    parser.add_argument('--board')
    args = parser.parse_args()
    if args.schedule:
        print(f'due={str(publication_due(args.schedule, datetime.now(timezone.utc))).lower()}')
    elif args.board:
        with open(args.board) as source:
            print(completed_week(json.load(source)))
    else:
        parser.error('--schedule or --board is required')
