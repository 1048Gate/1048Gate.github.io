import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_matchup_leaderboards import update_leaderboards


def archive():
    high = [[235.64, "Collin", "Browns", "Brian", "Daddy", 2022, 8, 0], [218.82, "Jared", "Bishop", "Trevor", "Hash", 2021, 5, 0], [212.08, "Brian", "Daddy", "Collin", "Chubb", 2020, 4, 0], [208.2, "Tommy", "Ring", "Brian", "Daddy", 2020, 13, 0], [201.96, "George", "Ewoks", "Trevor", "Hash", 2019, 7, 0]]
    low = [[26.5, "Vinny", "Thoughts", "Kyle", "Dreams", 2022, 17, 1], [35.44, "Bryan", "Howya", "Kyle", "Bijan", 2023, 17, 1], [37.6, "Trevor", "Hash", "Collin", "Browns", 2022, 17, 1], [52.8, "Vinny", "Thielen", "Tommy", "Tattoo", 2017, 16, 1], [53.24, "Bryan", "Howya", "Tommy", "Tomboy", 2022, 17, 1]]
    return {"schemaVersion": 2, "seasonRange": {"from": 2017, "to": 2025}, "gameCount": 885, "archiveGameCount": 885, "records": {}, "leaderboards": {"highestScores": high, "lowestScores": low}, "archiveLeaderboards": {"highestScores": high, "lowestScores": low}, "currentSeasonScores": []}


def board(state="final", score=240):
    games = []
    for index in range(6):
        games.append({"state": state, "away": {"teamId": index * 2 + 1, "owner": f"Away {index}", "team": f"A{index}", "score": score if index == 0 else 100 + index}, "home": {"teamId": index * 2 + 2, "owner": f"Home {index}", "team": f"H{index}", "score": 90 + index}})
    return {"season": 2026, "week": 1, "matchups": games}


class UpdateMatchupLeaderboardsTests(unittest.TestCase):
    def test_skips_incomplete_week(self):
        data = archive()
        self.assertFalse(update_leaderboards(data, board("live")))
        self.assertEqual(data["currentSeasonScores"], [])

    def test_merges_final_week_and_updates_records(self):
        data = archive()
        self.assertTrue(update_leaderboards(data, board()))
        self.assertEqual(len(data["currentSeasonScores"]), 12)
        self.assertEqual(data["leaderboards"]["highestScores"][0][0], 240)
        self.assertEqual(data["records"]["highestScore"][0], 240)
        self.assertEqual(data["seasonRange"]["to"], 2026)
        self.assertEqual(data["gameCount"], 891)

    def test_rerun_replaces_corrected_week_without_duplicates(self):
        data = archive()
        update_leaderboards(data, board(score=240))
        corrected = copy.deepcopy(board(score=199))
        self.assertTrue(update_leaderboards(data, corrected))
        self.assertEqual(len(data["currentSeasonScores"]), 12)
        self.assertEqual(data["gameCount"], 891)
        self.assertEqual(data["leaderboards"]["highestScores"][0][0], 235.64)


if __name__ == "__main__":
    unittest.main()
