import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_transactions import normalize_transactions


class FetchTransactionsTests(unittest.TestCase):
    def test_normalizes_freeagent_and_trade_accept(self):
        payload = {
            "teams": [{"id": 1, "name": "Alpha"}, {"id": 2, "name": "Beta"}],
            "players": [{"id": 101, "fullName": "Star Runner"}],
            "transactions": [
                {
                    "id": "fa-1",
                    "type": "FREEAGENT",
                    "status": "EXECUTED",
                    "teamId": 1,
                    "scoringPeriodId": 1,
                    "processDate": 1700000000000,
                    "items": [{"type": "ADD", "playerId": 101, "fromTeamId": 0, "toTeamId": 1}],
                },
                {
                    "id": "accept-1",
                    "type": "TRADE_ACCEPT",
                    "status": "EXECUTED",
                    "teamId": 1,
                    "scoringPeriodId": 2,
                    "processDate": 1700001000000,
                    "relatedTransactionId": "deal-1",
                    "items": [{"type": "TRADE", "playerId": 101, "fromTeamId": 1, "toTeamId": 2}],
                },
            ],
        }
        result = normalize_transactions(payload, 2026, 1237285)
        self.assertEqual(result["transaction_count"], 2)
        self.assertEqual(result["item_count"], 2)
        fa = result["transactions"][0]
        self.assertEqual(fa["transaction_type"], "FREEAGENT")
        self.assertEqual(fa["team_name"], "Alpha")
        self.assertEqual(result["items"][0]["player_name"], "Star Runner")
        accept = result["transactions"][1]
        self.assertEqual(accept["raw_data"]["relatedTransactionId"], "deal-1")


if __name__ == "__main__":
    unittest.main()
