#!/usr/bin/env python3
from __future__ import annotations

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_web_data as export


class ExportWebDataTests(unittest.TestCase):
    def test_named_season_shape(self):
        season = export.named_season(
            number="1",
            year=2025,
            finish=5,
            team="Shiesty Szn",
            record="8-6",
            points_for=1686.08,
            points_against=1565.66,
        )
        self.assertEqual(season["id"], "mgr-01-2025")
        self.assertEqual(season["year"], 2025)
        self.assertEqual(season["finish"], 5)
        self.assertEqual(season["team"], "Shiesty Szn")
        self.assertEqual(season["record"], "8-6")
        self.assertEqual(season["pointsFor"], 1686.08)
        self.assertEqual(season["pointsAgainst"], 1565.66)
        self.assertNotIsInstance(season, list)
        self.assertNotIn(0, season)

    def test_payload_is_schema_two_with_provenance(self):
        members = [
            {
                "id": export.manager_id(str(index).zfill(2)),
                "number": str(index).zfill(2),
                "name": f"Manager {index}",
                "role": "League Member",
                "seasons": [
                    export.named_season(
                        number=str(index).zfill(2),
                        year=2025,
                        finish=index,
                        team=f"Team {index}",
                        record="8-6",
                        points_for=1000 + index,
                        points_against=900 + index,
                    )
                ],
            }
            for index in range(1, 13)
        ]
        export.validate(members)
        payload = export.members_payload(members)
        self.assertEqual(payload["schemaVersion"], 2)
        self.assertEqual(payload["provenance"]["kind"], "canonical")
        self.assertEqual(payload["members"][0]["id"], "mgr-01")
        self.assertEqual(payload["members"][0]["seasons"][0]["id"], "mgr-01-2025")

    def test_validate_rejects_compact_arrays(self):
        members = [
            {
                "id": export.manager_id(str(index).zfill(2)),
                "number": str(index).zfill(2),
                "name": f"Manager {index}",
                "role": "League Member",
                "seasons": [[2025, index, f"Team {index}", "8-6", 1000.0, 900.0]],
            }
            for index in range(1, 13)
        ]
        with self.assertRaisesRegex(RuntimeError, "named objects"):
            export.validate(members)


if __name__ == "__main__":
    unittest.main()
