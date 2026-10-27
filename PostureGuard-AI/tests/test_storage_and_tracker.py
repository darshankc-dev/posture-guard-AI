"""
Unit tests for HistoryStorage and SessionTracker.
Tests session accounting, consistency calculation, SQLite storage, and privacy clearing.
"""

from __future__ import annotations

import shutil
import tempfile
import time
import unittest
from pathlib import Path

from postureguard.posture_engine import PostureState
from postureguard.session_tracker import SessionTracker
from postureguard.storage import HistoryStorage, SessionRecord


class TestStorageAndTracker(unittest.TestCase):
    """Test suite for session tracking and SQLite persistence."""

    def setUp(self) -> None:
        self.test_dir = Path(tempfile.mkdtemp(prefix="postureguard_db_"))
        self.storage = HistoryStorage(db_dir=self.test_dir)
        self.tracker = SessionTracker(storage=self.storage)

    def tearDown(self) -> None:
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_session_lifecycle_and_duration_accounting(self) -> None:
        """Verify time accounting into good, warning, and alert buckets."""
        t0 = 1000.0
        self.tracker.start_session()
        self.tracker.session_start_time = t0
        self.tracker.last_update_time = t0
        self.tracker.current_state = PostureState.GOOD

        # 5s of GOOD posture (until t0 + 5.0)
        self.tracker.update_state(PostureState.WARNING, current_time=t0 + 5.0)
        self.assertEqual(self.tracker.good_seconds, 5.0)
        self.assertEqual(self.tracker.current_state, PostureState.WARNING)

        # 5s of WARNING posture (until t0 + 10.0)
        self.tracker.update_state(PostureState.ALERT, current_time=t0 + 10.0)
        self.tracker.increment_reminder()
        self.assertEqual(self.tracker.warning_seconds, 5.0)
        self.assertEqual(self.tracker.current_state, PostureState.ALERT)

        # 5s of ALERT posture (until t0 + 15.0)
        self.tracker.update_state(PostureState.ALERT, current_time=t0 + 15.0)
        self.assertEqual(self.tracker.alert_seconds, 5.0)
        self.assertEqual(self.tracker.reminders_count, 1)

        # Check snapshot at t0 + 15.0
        snap = self.tracker.get_snapshot(current_time=t0 + 15.0)
        self.assertEqual(snap.good_seconds, 5.0)
        self.assertEqual(snap.warning_seconds, 5.0)
        self.assertEqual(snap.alert_seconds, 5.0)
        self.assertEqual(snap.reminders_count, 1)
        # Consistency: 5s good / 15s total assessed = 33.3%
        self.assertAlmostEqual(snap.consistency_percentage, 33.3, places=1)

    def test_sqlite_save_and_retrieve_and_clear(self) -> None:
        """Verify SQLite save, aggregate metrics, and privacy clearing."""
        record = SessionRecord(
            id=None,
            start_time="2026-10-27 10:00:00",
            end_time="2026-10-27 10:30:00",
            duration_seconds=1800.0,
            good_seconds=1500.0,
            warning_seconds=200.0,
            alert_seconds=100.0,
            unassessed_seconds=0.0,
            reminders_count=3,
            consistency_percentage=83.3,
        )

        row_id = self.storage.save_session(record)
        self.assertIsNotNone(row_id)

        # Retrieve
        recent = self.storage.get_recent_sessions(limit=5)
        self.assertEqual(len(recent), 1)
        self.assertEqual(recent[0].reminders_count, 3)
        self.assertAlmostEqual(recent[0].consistency_percentage, 83.3)

        # Aggregate stats
        stats = self.storage.get_aggregate_stats()
        self.assertEqual(stats["total_sessions"], 1)
        self.assertEqual(stats["total_reminders"], 3)
        self.assertEqual(stats["total_hours"], 0.5)

        # Privacy clear
        cleared = self.storage.clear_all()
        self.assertTrue(cleared)
        self.assertEqual(len(self.storage.get_recent_sessions()), 0)


if __name__ == "__main__":
    unittest.main()
