import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_current import normalize_bundle, normalize_scoreboard, normalize_standings


class CurrentFetchTests(unittest.TestCase):
    def setUp(self):
        self.payload = {
            "teams": [
                {"id": 1, "name": " Team One ", "record": {"overall": {"wins": 1, "losses": 0, "ties": 0}}},
                {"id": 2, "name": "Team Two", "record": {"overall": {"wins": 0, "losses": 1, "ties": 0}}},
            ],
            "schedule": [
                {"id": 10, "matchupPeriodId": 1, "home": {"teamId": 1, "totalScore": 101}, "away": {"teamId": 2, "totalScore": 99}},
                {"id": 11, "matchupPeriodId": 2, "home": {"teamId": 2, "totalScore": 88}, "away": {"teamId": 1, "totalScore": 90}},
            ],
        }

    def test_standings_trim_names_and_normalize_zero_rank(self):
        result = normalize_standings(self.payload, 2026, 1237285)
        self.assertEqual(result["teams"][0]["team_name"], "Team One")
        self.assertIsNone(result["teams"][0]["rank"])

    def test_scoreboard_filters_requested_week(self):
        result = normalize_scoreboard(self.payload, 2026, 1237285, 1)
        self.assertEqual(len(result["games"]), 1)
        self.assertEqual(result["games"][0]["matchup_id"], 10)
        self.assertEqual(result["games"][0]["home"]["team_name"], "Team One")

    def test_bundle_splits_previous_current_and_upcoming_weeks(self):
        payload = {
            **self.payload,
            "scoringPeriodId": 2,
            "teams": [
                {"id": 1, "name": "Team One", "playoffSeed": 1, "record": {"overall": {"wins": 1, "losses": 0, "ties": 0, "pointsFor": 101, "pointsAgainst": 99}}},
                {"id": 2, "name": "Team Two", "playoffSeed": 2, "record": {"overall": {"wins": 0, "losses": 1, "ties": 0, "pointsFor": 99, "pointsAgainst": 101}}},
            ],
        }
        result = normalize_bundle(payload, 2026, 1237285, None)
        self.assertEqual(result["current_week"], 2)
        self.assertEqual(result["phase"], "regular")
        self.assertEqual(result["previous"]["week"], 1)
        self.assertEqual(result["current"]["week"], 2)
        self.assertEqual(result["upcoming"]["week"], 3)
        self.assertEqual(result["previous"]["games"][0]["matchup_id"], 10)
        self.assertEqual(result["current"]["games"][0]["matchup_id"], 11)
        self.assertEqual(result["upcoming"]["games"], [])


if __name__ == "__main__":
    unittest.main()
