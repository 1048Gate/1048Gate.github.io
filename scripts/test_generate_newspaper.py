import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_newspaper import (
    GenerationSkip, apply_grok_stories, edition_path, existing_valid_edition,
    generate_edition, inspect_week, main, update_index, validate_edition,
)


def side(team_id, team, owner, score):
    return {"teamId": team_id, "team": team, "owner": owner, "score": score}


def standing(team_id, team, owner, wins, losses, pf, pa, locker):
    return {"locker": locker, "teamId": team_id, "team": team, "owner": owner, "abbrev": owner[:4].upper(), "wins": wins, "losses": losses, "ties": 0, "pointsFor": pf, "pointsAgainst": pa}


def final_board():
    matchups = [
        {"id": 1, "week": 1, "state": "final", "winner": "HOME", "away": side(9, "Ja'Marr-a-Lago", "JD Daley", 112.26), "home": side(5, "Howya Been's", "Bryan Hunt", 122.16)},
        {"id": 2, "week": 1, "state": "final", "winner": "AWAY", "away": side(11, "Your Reigning Champ", "Thomas Speer", 96.50), "home": side(1, "Madison Beer Garden", "George Travis", 88.32)},
        {"id": 3, "week": 1, "state": "final", "winner": "AWAY", "away": side(15, "Team Hash", "Trevor Hash", 150.76), "home": side(4, "1912 Titanic Swimteam", "Kyle Fowler", 70.12)},
        {"id": 4, "week": 1, "state": "final", "winner": "HOME", "away": side(13, "Breezin’ with Bijan", "Collin Krum", 64.12), "home": side(14, "Ice Has Me Running Back", "German Haro", 101.62)},
        {"id": 5, "week": 1, "state": "final", "winner": "HOME", "away": side(3, "Darty at 1048", "Jared Hall", 80.60), "home": side(7, "McConkey Tonk Badonkadonk", "Vincent Cannarozzi", 126.60)},
        {"id": 6, "week": 1, "state": "final", "winner": "HOME", "away": side(6, "The Buwhops", "Brian Heino", 41.80), "home": side(8, "Jigalos Jims", "James Brochu", 120.86)},
    ]
    standings = [
        standing(15, "Team Hash", "Trevor Hash", 1, 0, 150.76, 70.12, 12),
        standing(7, "McConkey Tonk Badonkadonk", "Vincent Cannarozzi", 1, 0, 126.60, 80.60, 6),
        standing(5, "Howya Been's", "Bryan Hunt", 1, 0, 122.16, 112.26, 4),
        standing(8, "Jigalos Jims", "James Brochu", 1, 0, 120.86, 41.80, 7),
        standing(14, "Ice Has Me Running Back", "German Haro", 1, 0, 101.62, 64.12, 11),
        standing(11, "Your Reigning Champ", "Thomas Speer", 1, 0, 96.50, 88.32, 9),
        standing(1, "Madison Beer Garden", "George Travis", 0, 1, 88.32, 96.50, 8),
        standing(3, "Darty at 1048", "Jared Hall", 0, 1, 80.60, 126.60, 2),
        standing(4, "1912 Titanic Swimteam", "Kyle Fowler", 0, 1, 70.12, 150.76, 3),
        standing(13, "Breezin’ with Bijan", "Collin Krum", 0, 1, 64.12, 101.62, 10),
        standing(9, "Ja'Marr-a-Lago", "JD Daley", 0, 1, 112.26, 122.16, 8),
        standing(6, "The Buwhops", "Brian Heino", 0, 1, 41.80, 120.86, 5),
    ]
    return {"schemaVersion": 1, "season": 2026, "week": 1, "phase": "Week 1", "source": "ESPN league endpoint", "standings": standings, "matchups": matchups}
