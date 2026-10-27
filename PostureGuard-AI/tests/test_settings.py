"""
Unit tests for AppSettings and SettingsManager.
Tests validation, JSON serialization, edge-case clamping, and recovery from corrupted files.
"""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from postureguard.settings import AppSettings, SettingsManager


class TestSettings(unittest.TestCase):
    """Test suite for settings loading, validation, and storage."""

    def setUp(self) -> None:
        self.test_dir = Path(tempfile.mkdtemp(prefix="postureguard_test_"))
        self.manager = SettingsManager(config_dir=self.test_dir)

    def tearDown(self) -> None:
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_default_settings_valid(self) -> None:
        """Default settings should be created and persisted automatically."""
        settings = self.manager.current
        self.assertEqual(settings.camera_index, 0)
        self.assertTrue(settings.sound_enabled)
        self.assertEqual(settings.sensitivity, "medium")
        self.assertTrue((self.test_dir / "settings.json").exists())

    def test_validation_clamps_out_of_bounds(self) -> None:
        """Settings should clamp negative or excessive values safely."""
        invalid_settings = AppSettings(
            camera_index=-5,
            sound_volume=250,
            alert_delay_seconds=0.1,
            alert_cooldown_seconds=1000.0,
            sensitivity="INVALID_MODE",
        )
        validated = invalid_settings.validate()

        self.assertEqual(validated.camera_index, 0)
        self.assertEqual(validated.sound_volume, 100)
        self.assertEqual(validated.alert_delay_seconds, 1.0)
        self.assertEqual(validated.alert_cooldown_seconds, 300.0)
        self.assertEqual(validated.sensitivity, "medium")

    def test_update_and_persist(self) -> None:
        """Updates should persist immediately to disk."""
        self.manager.update(alert_delay_seconds=8.0, sound_volume=65)
        
        # Read back from fresh manager instance
        new_mgr = SettingsManager(config_dir=self.test_dir)
        self.assertEqual(new_mgr.current.alert_delay_seconds, 8.0)
        self.assertEqual(new_mgr.current.sound_volume, 65)

    def test_corrupted_json_recovers_to_defaults(self) -> None:
        """A corrupted JSON file should not crash the app, but safely revert to defaults."""
        settings_file = self.test_dir / "settings.json"
        with open(settings_file, "w", encoding="utf-8") as f:
            f.write("!!NOT_VALID_JSON{:::broken")

        recovered = self.manager.load()
        self.assertIsInstance(recovered, AppSettings)
        self.assertEqual(recovered.sensitivity, "medium")


if __name__ == "__main__":
    unittest.main()
