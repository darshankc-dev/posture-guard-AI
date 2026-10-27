"""
Unit tests for PostureEngine using synthetic landmark data.
Executes completely offline without requiring a webcam or GUI.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from postureguard.calibration import CalibrationProfile
from postureguard.posture_engine import (
    DeviationType,
    PostureAssessment,
    PostureEngine,
    PostureState,
)


class TestPostureEngine(unittest.TestCase):
    """Test suite for biomechanical calculations and state transitions."""

    def setUp(self) -> None:
        # Standard synthetic calibration baseline
        self.baseline_profile = CalibrationProfile(
            neck_length_ratio=0.55,
            shoulder_width_norm=0.35,
            shoulder_tilt_deg=0.0,
            head_tilt_deg=0.0,
            head_forward_drop_ratio=0.25,
            ref_mid_shoulder_y=0.60,
            ref_nose_y=0.35,
            sample_count=40,
            calibrated_at="2026-10-27 10:00:00",
            is_valid=True,
        )

        self.engine = PostureEngine(
            calibration=self.baseline_profile,
            sensitivity="medium",
            alert_delay_seconds=3.0,
            min_confidence=0.55,
            ema_alpha=1.0,  # Alpha=1.0 for instantaneous testing without smoothing lag
            hysteresis_recovery_seconds=1.0,
        )

    def _make_landmarks(
        self,
        nose_y: float = 0.35,
        ear_y: float = 0.30,
        shoulder_y: float = 0.60,
        shoulder_tilt: float = 0.0,
        shoulder_width: float = 0.35,
        vis: float = 0.95,
    ):
        """Construct synthetic upper-body landmark coordinates."""
        mid_x = 0.50
        half_w = shoulder_width / 2.0

        nose = (mid_x, nose_y, vis)
        left_ear = (mid_x - 0.07, ear_y, vis)
        right_ear = (mid_x + 0.07, ear_y, vis)

        # Apply tilt to shoulders
        left_shoulder = (mid_x - half_w, shoulder_y - (shoulder_tilt / 2.0), vis)
        right_shoulder = (mid_x + half_w, shoulder_y + (shoulder_tilt / 2.0), vis)

        return nose, left_ear, right_ear, left_shoulder, right_shoulder

    def test_ideal_posture_evaluates_as_good(self) -> None:
        """Frame matching baseline should evaluate to GOOD."""
        nose, lear, rear, lsh, rsh = self._make_landmarks()
        result = self.engine.evaluate(nose, lear, rear, lsh, rsh, current_time=100.0)

        self.assertEqual(result.state, PostureState.GOOD)
        self.assertEqual(result.primary_deviation, DeviationType.NONE)
        self.assertIn("comfort", result.message.lower())

    def test_low_confidence_evaluates_as_unassessed(self) -> None:
        """Low landmark visibility must yield UNASSESSED state."""
        nose, lear, rear, lsh, rsh = self._make_landmarks(vis=0.20)
        result = self.engine.evaluate(nose, lear, rear, lsh, rsh, current_time=100.0)

        self.assertEqual(result.state, PostureState.UNASSESSED)
        self.assertIn("lighting", result.message.lower())

    def test_forward_head_deviation_triggers_warning_then_alert(self) -> None:
        """Forward head posture should first trigger WARNING, then ALERT after delay."""
        # Nose drops downward significantly towards shoulders
        nose, lear, rear, lsh, rsh = self._make_landmarks(nose_y=0.48, ear_y=0.45)

        # Frame 1 at t=0s -> WARNING
        res1 = self.engine.evaluate(nose, lear, rear, lsh, rsh, current_time=0.0)
        self.assertEqual(res1.state, PostureState.WARNING)
        self.assertEqual(res1.primary_deviation, DeviationType.FORWARD_HEAD)
        self.assertAlmostEqual(res1.time_in_deviation, 0.0)

        # Frame 2 at t=2.0s (< alert_delay 3.0s) -> Still WARNING
        res2 = self.engine.evaluate(nose, lear, rear, lsh, rsh, current_time=2.0)
        self.assertEqual(res2.state, PostureState.WARNING)
        self.assertAlmostEqual(res2.time_in_deviation, 2.0)

        # Frame 3 at t=3.5s (>= alert_delay 3.0s) -> ALERT!
        res3 = self.engine.evaluate(nose, lear, rear, lsh, rsh, current_time=3.5)
        self.assertEqual(res3.state, PostureState.ALERT)
        self.assertAlmostEqual(res3.time_in_deviation, 3.5)
        self.assertIn("head back", res3.message.lower())

    def test_slouching_deviation_triggers_alert(self) -> None:
        """Slouching (shoulders dropping downward in frame) detected."""
        # Shoulders drop down from Y=0.60 to Y=0.72
        nose, lear, rear, lsh, rsh = self._make_landmarks(shoulder_y=0.72)

        res1 = self.engine.evaluate(nose, lear, rear, lsh, rsh, current_time=0.0)
        self.assertEqual(res1.state, PostureState.WARNING)
        self.assertEqual(res1.primary_deviation, DeviationType.SLOUCHING)

        res2 = self.engine.evaluate(nose, lear, rear, lsh, rsh, current_time=4.0)
        self.assertEqual(res2.state, PostureState.ALERT)
        self.assertEqual(res2.primary_deviation, DeviationType.SLOUCHING)

    def test_shoulder_tilt_detected(self) -> None:
        """Shoulder asymmetry beyond threshold detected."""
        # Significant shoulder tilt (one shoulder much higher than other)
        nose, lear, rear, lsh, rsh = self._make_landmarks(shoulder_tilt=0.12)

        res = self.engine.evaluate(nose, lear, rear, lsh, rsh, current_time=0.0)
        self.assertEqual(res.primary_deviation, DeviationType.SHOULDER_TILT)
        self.assertIn("uneven", res.message.lower())

    def test_hysteresis_recovery(self) -> None:
        """Returning to good posture must persist through recovery window before state clears."""
        bad_nose, blear, brear, blsh, brsh = self._make_landmarks(nose_y=0.48, ear_y=0.45)
        good_nose, glear, grear, glsh, grsh = self._make_landmarks()

        # Enter ALERT at t=5s
        self.engine.evaluate(bad_nose, blear, brear, blsh, brsh, current_time=0.0)
        self.engine.evaluate(bad_nose, blear, brear, blsh, brsh, current_time=5.0)
        self.assertEqual(self.engine.current_state, PostureState.ALERT)

        # User sits up straight at t=5.2s -> Still in recovery hysteresis
        res_rec = self.engine.evaluate(good_nose, glear, grear, glsh, grsh, current_time=5.2)
        self.assertEqual(res_rec.state, PostureState.ALERT)

        # Good posture sustained past 1.0s recovery window (at t=6.5s) -> GOOD
        res_recovered = self.engine.evaluate(good_nose, glear, grear, glsh, grsh, current_time=6.5)
        self.assertEqual(res_recovered.state, PostureState.GOOD)


if __name__ == "__main__":
    unittest.main()
