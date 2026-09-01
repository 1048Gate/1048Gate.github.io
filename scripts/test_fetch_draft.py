#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("fetch_draft.py")
SPEC = importlib.util.spec_from_file_location("fetch_draft", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class DraftFetchTests(unittest.TestCase):
    def setUp(self):
        self.payload = {
            "settings": {"name": "1048 Gate Szn 10"},
            "members": [
                {"id": "{AAA}", "firstName": "Trevor", "lastName": "Hash"},
                {"id": "{BBB}", "firstName": "Tommy", "lastName": "Speer"},
            ],
            "draftDetail": {
                "drafted": True,
                "complete": True,
                "inProgress": False,
                "picks": [
                    {"id": 1, "overallPickNumber": 1, "roundId": 1, "roundPickNumber": 1, "teamId": 12, "playerId": 101, "keeper": False},
                    {"id": 2, "overallPickNumber": 2, "roundId": 1, "roundPickNumber": 2, "teamId": 9, "playerId": 202, "keeper": True},
                ],
            },
            "teams": [
                {
                    "id": 12,
                    "name": "Team Hash",
                    "primaryOwner": "{AAA}",
                    "roster": {"entries": [
                        {"playerId": 101, "playerPoolEntry": {"player": {
                            "id": 101, "fullName": "Ja'Marr Chase", "defaultPositionId": 3,
                            "draftRanksByRankType": {"PPR": {"rank": 2}},
                            "ownership": {"averageDraftPosition": 1.4},
                        }}}
                    ]},
                },
                {
                    "id": 9,
                    "name": "The Swifties",
                    "primaryOwner": "{BBB}",
                    "roster": {"entries": [
                        {"playerId": 202, "playerPoolEntry": {"player": {
                            "id": 202, "fullName": "Puka Nacua", "defaultPositionId": 3,
                            "draftRanksByRankType": {"PPR": {"rank": 8}},
                        }}}
                    ]},
                },
            ],
        }
        self.members = ["Trevor Hash", "Thomas Speer", "Collin Krum"]

    def test_normalizes_compact_archive_and_owner_aliases(self):
        result = MODULE.normalize_draft(self.payload, 2026, 1237285, self.members)
        self.assertEqual(result["archive"]["year"], 2026)
        self.assertEqual(result["archive"]["league"], "1048 Gate Szn 10")
        self.assertEqual(result["keepers"], 1)
        self.assertEqual(result["teams"][0], ["Team Hash", "Trevor Hash"])
        self.assertEqual(result["teams"][1], ["The Swifties", "Thomas Speer"])
        self.assertEqual(result["picks"][0], [1, 0, "Ja'Marr Chase", 0])
        self.assertEqual(result["picks"][1], [2, 1, "Puka Nacua", 1])
        self.assertEqual(result["full_picks"][0]["rank"], 2)
        self.assertTrue(result["complete"])

    def test_rejects_empty_draft(self):
        with self.assertRaises(RuntimeError):
            MODULE.normalize_draft({"draftDetail": {"picks": []}}, 2026, 1237285, self.members)


if __name__ == "__main__":
    unittest.main()
