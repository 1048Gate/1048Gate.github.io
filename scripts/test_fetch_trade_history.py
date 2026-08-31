#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("fetch_trade_history.py")
SPEC = importlib.util.spec_from_file_location("fetch_trade_history", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class TradeHistoryTests(unittest.TestCase):
    def test_deduplicates_same_trade_seen_on_multiple_player_cards(self):
        transaction = {
            "id": "trade-1",
            "type": "TRADE",
            "status": "EXECUTED",
            "teamId": 2,
            "scoringPeriodId": 5,
            "processDate": 1700000000000,
            "items": [
                {"type": "TRADE", "playerId": 101, "fromTeamId": 1, "toTeamId": 2},
                {"type": "TRADE", "playerId": 202, "fromTeamId": 2, "toTeamId": 1},
            ],
        }
        payload = {"players": [
            {"player": {"id": 101, "fullName": "Alpha Player", "transactions": [transaction]}},
            {"player": {"id": 202, "fullName": "Beta Player", "transactions": [transaction]}},
        ]}
        result = MODULE.normalize_playercard(payload, 2025, 1237285)
        self.assertEqual(result["transaction_observation_count"], 2)
        self.assertEqual(result["transaction_count"], 1)
        self.assertEqual(result["team_to_team_transaction_count"], 1)
        event = result["transactions"][0]
        self.assertEqual(event["observed_on_player_ids"], [101, 202])
        self.assertEqual([item["player_name"] for item in event["items"]], ["Alpha Player", "Beta Player"])

    def test_ignores_context_transaction_without_primary_player(self):
        payload = {"players": [{"player": {"id": 101, "fullName": "Alpha", "transactions": [
            {"id": "other", "type": "FREEAGENT", "status": "EXECUTED", "items": [
                {"type": "ADD", "playerId": 202, "fromTeamId": 0, "toTeamId": 1}
            ]}
        ]}}]}
        result = MODULE.normalize_playercard(payload, 2025, 1237285)
        self.assertEqual(result["transaction_count"], 0)

    def test_supports_transactions_on_entry_wrapper(self):
        payload = {"players": [{
            "id": 303,
            "fullName": "Wrapper Player",
            "transactions": [{"id": "drop-1", "type": "FREEAGENT", "status": "EXECUTED", "items": [
                {"type": "DROP", "playerId": 303, "fromTeamId": 4, "toTeamId": 0}
            ]}]
        }]}
        result = MODULE.normalize_playercard(payload, 2024, 1237285)
        self.assertEqual(result["transaction_count"], 1)
        self.assertFalse(result["transactions"][0]["has_team_to_team_move"])

    def test_rejects_missing_players_list(self):
        with self.assertRaises(ValueError):
            MODULE.normalize_playercard({}, 2025, 1237285)


if __name__ == "__main__":
    unittest.main()
