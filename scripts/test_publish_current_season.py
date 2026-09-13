import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from publish_current_season import build_board, load_roster


class PublishCurrentSeasonTests(unittest.TestCase):
    def setUp(self):
        self.roster_seed = {
            "schemaVersion": 1,
            "season": 2026,
            "seasonNumber": 10,
            "week": 1,
            "phase": "Week 1",
            "standings": [
                {"locker": 1, "teamId": 1, "team": "Old Name", "owner": "George Travis", "abbrev": "BDS", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 2, "teamId": 2, "team": "Second", "owner": "Other Manager", "abbrev": "TWO", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 3, "teamId": 3, "team": "Third", "owner": "Third Manager", "abbrev": "TRI", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 4, "teamId": 4, "team": "Fourth", "owner": "Fourth Manager", "abbrev": "FOR", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 5, "teamId": 5, "team": "Fifth", "owner": "Fifth Manager", "abbrev": "FIF", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 6, "teamId": 6, "team": "Sixth", "owner": "Sixth Manager", "abbrev": "SIX", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 7, "teamId": 7, "team": "Seventh", "owner": "Seventh Manager", "abbrev": "SEV", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 8, "teamId": 8, "team": "Eighth", "owner": "Eighth Manager", "abbrev": "EIG", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 9, "teamId": 9, "team": "Ninth", "owner": "Ninth Manager", "abbrev": "NIN", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 10, "teamId": 10, "team": "Tenth", "owner": "Tenth Manager", "abbrev": "TEN", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 11, "teamId": 11, "team": "Eleventh", "owner": "Eleventh Manager", "abbrev": "ELE", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
                {"locker": 12, "teamId": 12, "team": "Twelfth", "owner": "Twelfth Manager", "abbrev": "TWE", "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0},
            ],
        }
        self.standings = {
            "teams": [
                {"team_id": i, "team_name": f"Club {i}", "abbrev": f"T{i}", "wins": i % 3, "losses": 1, "ties": 0, "points_for": 100 + i, "points_against": 90 + i}
                for i in range(1, 13)
            ]
        }
        self.scoreboard = {
            "games": [
                {
                    "matchup_id": i,
                    "scoring_period": 2,
                    "matchup_period": 2,
                    "home": {"team_id": i, "team_name": f"Club {i}", "score": 110 + i},
                    "away": {"team_id": 13 - i, "team_name": f"Club {13 - i}", "score": 100 + i},
                }
                for i in range(1, 7)
            ]
        }

    def test_build_board_preserves_owners_and_updates_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            seed = Path(tmp) / "current-season.json"
            seed.write_text(json.dumps(self.roster_seed), encoding="utf-8")
            roster = load_roster(seed)
        board = build_board(
            season=2026,
            season_number=10,
            week=2,
            fetched_at="2026-09-10T00:00:00+00:00",
            standings_norm=self.standings,
            scoreboard_norm=self.scoreboard,
            roster=roster,
        )
        self.assertEqual(board["phase"], "Week 2")
        self.assertEqual(board["week"], 2)
        self.assertEqual(len(board["standings"]), 12)
        self.assertEqual(len(board["matchups"]), 6)
        first = next(row for row in board["standings"] if row["teamId"] == 1)
        self.assertEqual(first["owner"], "George Travis")
        self.assertEqual(first["team"], "Club 1")
        self.assertEqual(first["wins"], 1)
        self.assertEqual(board["matchups"][0]["home"]["owner"], "George Travis")
        ordered_ids = [row["teamId"] for row in board["standings"]]
        self.assertEqual(ordered_ids[0], 11)
        self.assertGreaterEqual(board["standings"][0]["wins"], board["standings"][1]["wins"])
        self.assertGreaterEqual(board["standings"][0]["pointsFor"], board["standings"][1]["pointsFor"])
        self.assertTrue(board["note"].startswith("Week 2"))


if __name__ == "__main__":
    unittest.main()
