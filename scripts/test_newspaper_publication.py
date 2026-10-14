import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from newspaper_publication import publication_due, completed_week

class PublicationTests(unittest.TestCase):
    def test_dst_slots_and_delayed_starts(self):
        for date, accepted, rejected in [
            ('2026-10-20T11:00:00', '0 11 * * 2', '0 12 * * 2'),
            ('2026-11-03T12:00:00', '0 12 * * 2', '0 11 * * 2'),
            ('2027-03-09T12:00:00', '0 12 * * 2', '0 11 * * 2'),
            ('2027-03-16T11:00:00', '0 11 * * 2', '0 12 * * 2'),
            ('2026-10-20T14:05:00', '0 11 * * 2', '0 12 * * 2'),
        ]:
            now=datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
            with self.subTest(date=date):
                self.assertTrue(publication_due(accepted, now))
                self.assertFalse(publication_due(rejected, now))
        self.assertFalse(publication_due('0 12 * * 2', datetime(2026,11,3,11,tzinfo=timezone.utc)))
        self.assertFalse(publication_due('0 11 * * 2', datetime(2026,10,22,11,tzinfo=timezone.utc)))

    def test_completed_week_before_and_after_rollover(self):
        final=[{'state':'final','winner':'HOME'} for _ in range(6)]
        self.assertEqual(completed_week({'week':5,'matchups':final}),5)
        self.assertEqual(completed_week({'week':6,'matchups':[{'state':'scheduled'}]*6}),5)
        self.assertEqual(completed_week({'week':6,'matchups':[{'state':'live'}]*6}),5)
        with self.assertRaises(ValueError): completed_week({'week':1,'matchups':[]})

if __name__ == '__main__': unittest.main()
