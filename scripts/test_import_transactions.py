import copy
import unittest
from unittest.mock import patch

from fetch_transactions import normalize_transactions
from import_transactions_to_supabase import import_snapshot, prepare_import


class TransactionImportTests(unittest.TestCase):
    def setUp(self):
        self.data = normalize_transactions({'transactions': [{'id': 'keep', 'type': 'WAIVER', 'items': [{'type': 'ADD'}]}]}, 2025, 1237285)

    def test_partial_import_uses_atomic_rpc_without_cleanup(self):
        with patch('import_transactions_to_supabase.supabase_request') as request:
            import_snapshot(self.data)
            self.assertEqual(request.call_count, 1)
            method, path, payload = request.call_args.args
            self.assertEqual((method, path), ('POST', 'rpc/import_transaction_snapshot'))
            self.assertFalse(payload['p_snapshot']['snapshot_complete'])

    def test_authoritative_requires_explicit_certification(self):
        with patch('import_transactions_to_supabase.supabase_request') as request:
            with self.assertRaises(ValueError):
                import_snapshot(self.data, authoritative=True)
            request.assert_not_called()
        self.data['snapshot_complete'] = True
        self.assertTrue(prepare_import(self.data, authoritative=True)['snapshot_complete'])
        self.assertFalse(prepare_import(self.data)['snapshot_complete'])

    def test_duplicate_records_are_deduplicated_but_conflicts_rejected(self):
        self.data['transactions'] *= 2
        self.data['items'] *= 2
        self.data.update(transaction_count=2, item_count=2)
        result = prepare_import(self.data)
        self.assertEqual(len(result['transactions']), 1)
        self.assertEqual(len(result['items']), 1)
        self.data['transactions'][1] = {**self.data['transactions'][1], 'status': 'different'}
        with self.assertRaises(ValueError):
            prepare_import(self.data)

    def test_bad_or_incomplete_input_never_calls_database(self):
        for kind in ('season', 'league', 'items', 'counts', 'timestamp', 'array', 'provenance'):
            data = copy.deepcopy(self.data)
            if kind == 'season': data['items'][0]['season_year'] = 2024
            if kind == 'league': data['league_id'] = 1
            if kind == 'items': data.update(items=[], item_count=0)
            if kind == 'counts': data['transaction_count'] = 10
            if kind == 'timestamp': data['fetched_at'] = '2025-01-01'
            if kind == 'array': data['transactions'] = None
            if kind == 'provenance': data['transactions'][0]['raw_data'] = {}
            with self.subTest(kind=kind), patch('import_transactions_to_supabase.supabase_request') as request:
                with self.assertRaises(ValueError): import_snapshot(data, authoritative=True)
                request.assert_not_called()

    def test_empty_snapshot_requires_both_explicit_guards(self):
        data = normalize_transactions({'transactions': []}, 2025, 1237285)
        self.assertEqual(prepare_import(data)['transactions'], [])
        data['snapshot_complete'] = True
        with self.assertRaises(ValueError): prepare_import(data, authoritative=True)
        self.assertTrue(prepare_import(data, authoritative=True, allow_empty=True)['snapshot_complete'])
        draft_only = copy.deepcopy(self.data)
        draft_only['transactions'][0]['transaction_type'] = 'DRAFT'
        draft_only['snapshot_complete'] = True
        with self.assertRaises(ValueError): prepare_import(draft_only, authoritative=True)
        self.assertEqual(prepare_import(draft_only, authoritative=True, allow_empty=True)['transactions'], [])

    def test_source_identity_and_missing_data_rejected(self):
        for payload in ({}, {'transactions': [], 'seasonId': 2024}, {'transactions': [], 'id': 1}):
            with self.assertRaises(ValueError): normalize_transactions(payload, 2025, 1237285)

    def test_workflow_sources_accepted_unknown_source_or_league_rejected(self):
        for source in ('ESPN mTransactions2', 'ESPN kona_playercard', 'ESPN trade-history adapter'):
            data = copy.deepcopy(self.data); data['source'] = source
            self.assertEqual(prepare_import(data)['source'], source)
        for field, value in (('source', 'Unknown feed'), ('source', None), ('league_id', 999)):
            data = copy.deepcopy(self.data); data[field] = value
            with self.assertRaises(ValueError): prepare_import(data)

    def test_failed_rpc_does_not_run_further_writes(self):
        with patch('import_transactions_to_supabase.supabase_request', side_effect=RuntimeError('failed')) as request:
            with self.assertRaises(RuntimeError): import_snapshot(self.data)
            self.assertEqual(request.call_count, 1)
