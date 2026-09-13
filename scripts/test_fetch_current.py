import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_current import normalize_scoreboard, normalize_standings


class CurrentFetchTests(unittest.TestCase):
    def setUp(self):
        self.payload = {
            "teams": [
                {"id": 1, "name": " Team One ", "record": {"overall": {"wins": 1, "losses": 0, "ties": 0}}},
                {"id": 2, "name": "Team Two", "record": {"overall": {"wins": 0, "losses": 1, "ties": 0}}},
            ],
            "schedule": [
                {"id": 10, "matchupPeriodId": 1, "home": {"teamId": 1, "totalPoints": 101.25}, "away": {"teamId": 2, "totalPoints": 99.5}},
                {"id": 11, "matchupPeriodId": 2, "home": {"teamId": 2, "totalPoints": 88}, "away": {"teamId": 1, "totalPoints": 90}},
            ],
        }

    def test_standings_trim_names_and_normalize_zero_rank(self):
        result = normalize_standings(self.payload, 2026, 1237285)
        self.assertEqual(result["teams"][0]["team_name"], "Team One")
        self.assertIsNone(result["teams"][0]["rank"])

    def test_scoreboard_filters_requested_week_and_reads_total_points(self):
        result = normalize_scoreboard(self.payload, 2026, 1237285, 1)
        self.assertEqual(len(result["games"]), 1)
        self.assertEqual(result["games"][0]["matchup_id"], 10)
        self.assertEqual(result["games"][0]["home"]["team_name"], "Team One")
        self.assertEqual(result["games"][0]["home"]["score"], 101.25)
        self.assertEqual(result["games"][0]["away"]["score"], 99.5)

    def test_scoreboard_accepts_legacy_total_score_fallback(self):
        payload = {
            "teams": self.payload["teams"],
            "schedule": [
                {"id": 12, "matchupPeriodId": 1, "home": {"teamId": 1, "totalScore": 77}, "away": {"teamId": 2, "totalScore": 66}},
            ],
        }
        result = normalize_scoreboard(payload, 2026, 1237285, 1)
        self.assertEqual(result["games"][0]["home"]["score"], 77)
        self.assertEqual(result["games"][0]["away"]["score"], 66)

    def test_scoreboard_prefers_total_points_when_both_fields_exist(self):
        payload = {
            "teams": self.payload["teams"],
            "schedule": [
                {"id": 13, "matchupPeriodId": 1, "home": {"teamId": 1, "totalPoints": 55.5, "totalScore": 0}, "away": {"teamId": 2, "totalPoints": 44.25, "totalScore": 0}},
            ],
        }
        result = normalize_scoreboard(payload, 2026, 1237285, 1)
        self.assertEqual(result["games"][0]["home"]["score"], 55.5)
        self.assertEqual(result["games"][0]["away"]["score"], 44.25)

    def test_scoreboard_uses_live_total_when_official_is_zero(self):
        payload = {
            "teams": self.payload["teams"],
            "schedule": [
                {
                    "id": 14,
                    "matchupPeriodId": 1,
                    "winner": "UNDECIDED",
                    "home": {"teamId": 1, "totalPoints": 0, "totalPointsLive": 87.4},
                    "away": {"teamId": 2, "totalPoints": 0, "rosterForCurrentScoringPeriod": {"appliedStatTotal": 62.1}},
                },
            ],
        }
        result = normalize_scoreboard(payload, 2026, 1237285, 1)
        self.assertEqual(result["games"][0]["home"]["score"], 87.4)
        self.assertEqual(result["games"][0]["away"]["score"], 62.1)
        self.assertEqual(result["games"][0]["winner"], "UNDECIDED")

    def test_scoreboard_keeps_missing_scores_as_none(self):
        payload = {
            "teams": self.payload["teams"],
            "schedule": [
                {"id": 15, "matchupPeriodId": 1, "home": {"teamId": 1}, "away": {"teamId": 2}},
            ],
        }
        result = normalize_scoreboard(payload, 2026, 1237285, 1)
        self.assertIsNone(result["games"][0]["home"]["score"])
        self.assertIsNone(result["games"][0]["away"]["score"])


if __name__ == "__main__":
    unittest.main()
