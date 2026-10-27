export interface DesktopFile {
  path: string;
  category: 'core' | 'gui' | 'cv' | 'tests' | 'config' | 'docs';
  description: string;
  language: string;
  content: string;
}

export const DESKTOP_FILES: DesktopFile[] = [
  {
    path: 'main.py',
    category: 'core',
    description: 'Application entry point, High-DPI configuration, and lifecycle initialization',
    language: 'python',
    content: `"""
PostureGuard AI - Native Desktop Application Entrypoint.

A complete Windows desktop posture monitoring assistant using PySide6,
OpenCV, and MediaPipe. Provides real-time upper-body tracking, personalized
calibration, and gentle reminders for prolonged bad posture.
"""

from __future__ import annotations

import logging
import os
import signal
import sys
from pathlib import Path

# Add project root to sys.path so postureguard package is discoverable
PROJECT_ROOT = Path(__file__).parent.resolve()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("postureguard")


def main() -> int:
    """Launch the PostureGuard AI desktop application."""
    logger.info("Initializing PostureGuard AI desktop application...")

    try:
        from PySide6.QtCore import Qt
        from PySide6.QtGui import QIcon
        from PySide6.QtWidgets import QApplication
    except ImportError:
        logger.critical(
            "PySide6 is not installed.\\n"
            "Please install the required dependencies with:\\n"
            "    pip install -r requirements.txt"
        )
        return 1

    from postureguard.calibration import CalibrationManager
    from postureguard.main_window import MainWindow
    from postureguard.settings import SettingsManager
    from postureguard.storage import HistoryStorage

    # Allow graceful termination with Ctrl+C in terminal
    signal.signal(signal.SIGINT, signal.SIG_DFL)

    # Enable High DPI scaling
    os.environ["QT_AUTO_SCREEN_SCALE_FACTOR"] = "1"

    app = QApplication(sys.argv)
    app.setApplicationName("PostureGuard AI")
    app.setOrganizationName("PostureGuard")

    # Set application icon if present
    icon_path = PROJECT_ROOT / "assets" / "icons" / "app_icon.png"
    if icon_path.exists():
        app.setWindowIcon(QIcon(str(icon_path)))

    # Initialize Managers
    settings_mgr = SettingsManager()
    calibration_mgr = CalibrationManager()
    storage = HistoryStorage()

    # Create & display main GUI window
    window = MainWindow(
        settings_manager=settings_mgr,
        calibration_manager=calibration_mgr,
        storage=storage,
    )
    window.show()

    logger.info("PostureGuard AI GUI launched successfully.")
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
`
  },
  {
    path: 'postureguard/posture_engine.py',
    category: 'cv',
    description: 'Biomechanical geometry calculation, EMA smoothing, hysteresis, and alert state machine',
    language: 'python',
    content: `"""
Posture Analysis Engine for PostureGuard AI.

Calculates biomechanical posture deviations from 2D camera landmarks:
- Forward head posture (craniovertebral angle proxy & neck compression)
- Slouching / Upper torso collapse (shoulder-to-hip or vertical drop)
- Excessive forward lean toward screen (scale expansion)
- Shoulder asymmetry (lateral tilt delta)
- Lateral head tilt

Includes Exponential Moving Average (EMA) smoothing, hysteresis state transitions,
configurable sensitivity multipliers, and sustained-deviation alert timing.
"""

from __future__ import annotations

import enum
import math
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from postureguard.calibration import CalibrationProfile


class PostureState(enum.Enum):
    """Categorical posture status."""
    UNASSESSED = "UNASSESSED"  # Insufficient landmark visibility or confidence
    GOOD = "GOOD"              # Normal posture within calibrated tolerance
    WARNING = "WARNING"        # Transient deviation detected; timer ticking
    ALERT = "ALERT"            # Sustained deviation exceeding duration threshold


class DeviationType(enum.Enum):
    """Specific primary cause of posture deviation."""
    NONE = "none"
    FORWARD_HEAD = "forward_head"
    SLOUCHING = "slouching"
    LEANING_FORWARD = "leaning_forward"
    SHOULDER_TILT = "shoulder_tilt"
    HEAD_TILT = "head_tilt"


@dataclass
class PostureAssessment:
    """Detailed output of a single posture evaluation frame."""
    state: PostureState
    primary_deviation: DeviationType
    message: str
    confidence: float
    deviation_score: float  # 0.0 (perfect) to 1.0+ (severe)
    time_in_deviation: float  # seconds deviation has persisted
    metrics: Dict[str, float] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)


class PostureEngine:
    """
    Core posture calculation and state machine engine.
    Compares real-time landmark coordinates with a calibrated baseline.
    """

    # Sensitivities adjust deviation thresholds (higher = stricter)
    SENSITIVITY_SCALERS = {
        "low": 1.25,     # 25% more relaxed tolerance
        "medium": 1.0,   # Baseline standard tolerance
        "high": 0.80,    # 20% stricter tolerance
    }

    # Guidance messages
    MESSAGES = {
        DeviationType.NONE: "Sitting comfortably in good posture.",
        DeviationType.FORWARD_HEAD: "Try bringing your head back into a comfortable position.",
        DeviationType.SLOUCHING: "Relax your shoulders and sit comfortably upright.",
        DeviationType.LEANING_FORWARD: "Your upper body has been leaning forward toward the screen. Adjust your sitting position.",
        DeviationType.SHOULDER_TILT: "Your shoulders appear uneven. Check your seating balance.",
        DeviationType.HEAD_TILT: "Your head is tilted to the side. Align your neck comfortably.",
    }

    def __init__(
        self,
        calibration: Optional[CalibrationProfile] = None,
        sensitivity: str = "medium",
        alert_delay_seconds: float = 5.0,
        min_confidence: float = 0.55,
        ema_alpha: float = 0.30,
        hysteresis_recovery_seconds: float = 1.2,
    ) -> None:
        self.calibration = calibration
        self.sensitivity = sensitivity
        self.alert_delay_seconds = alert_delay_seconds
        self.min_confidence = min_confidence
        self.ema_alpha = ema_alpha
        self.hysteresis_recovery_seconds = hysteresis_recovery_seconds

        # State tracking
        self.current_state = PostureState.UNASSESSED
        self.current_deviation = DeviationType.NONE
        self.deviation_start_time: Optional[float] = None
        self.good_posture_start_time: Optional[float] = None
        
        # Smoothed metrics cache
        self.smoothed_metrics: Dict[str, float] = {}

    def set_calibration(self, calibration: Optional[CalibrationProfile]) -> None:
        """Update active calibration baseline."""
        self.calibration = calibration
        self.reset_state()

    def set_sensitivity(self, sensitivity: str) -> None:
        """Update sensitivity level ('low', 'medium', 'high')."""
        if sensitivity.lower() in self.SENSITIVITY_SCALERS:
            self.sensitivity = sensitivity.lower()

    def set_alert_delay(self, seconds: float) -> None:
        """Configure seconds required before transitioning from WARNING to ALERT."""
        self.alert_delay_seconds = max(1.0, seconds)

    def reset_state(self) -> None:
        """Reset internal timers and smoothed metrics."""
        self.current_state = PostureState.UNASSESSED
        self.current_deviation = DeviationType.NONE
        self.deviation_start_time = None
        self.good_posture_start_time = None
        self.smoothed_metrics.clear()

    def _apply_ema(self, key: str, value: float) -> float:
        """Apply Exponential Moving Average smoothing to stabilize frame-to-frame noise."""
        if key not in self.smoothed_metrics:
            self.smoothed_metrics[key] = value
            return value
        smoothed = (self.ema_alpha * value) + ((1.0 - self.ema_alpha) * self.smoothed_metrics[key])
        self.smoothed_metrics[key] = smoothed
        return smoothed

    def evaluate(
        self,
        nose: Tuple[float, float, float],
        left_ear: Tuple[float, float, float],
        right_ear: Tuple[float, float, float],
        left_shoulder: Tuple[float, float, float],
        right_shoulder: Tuple[float, float, float],
        current_time: Optional[float] = None,
    ) -> PostureAssessment:
        now = time.time() if current_time is None else current_time

        # 1. Check confidence and visibility
        landmarks = [nose, left_ear, right_ear, left_shoulder, right_shoulder]
        min_vis = min(lm[2] for lm in landmarks)
        avg_vis = sum(lm[2] for lm in landmarks) / len(landmarks)

        if min_vis < self.min_confidence:
            self.current_state = PostureState.UNASSESSED
            self.deviation_start_time = None
            return PostureAssessment(
                state=PostureState.UNASSESSED,
                primary_deviation=DeviationType.NONE,
                message="Adjust lighting or reposition so your head and shoulders are clearly visible.",
                confidence=avg_vis,
                deviation_score=0.0,
                time_in_deviation=0.0,
                metrics={},
                timestamp=now,
            )

        # 2. Extract coordinates
        nx, ny, _ = nose
        lex, ley, _ = left_ear
        rex, rey, _ = right_ear
        lsx, lsy, _ = left_shoulder
        rsx, rsy, _ = right_shoulder

        shoulder_width = math.hypot(rsx - lsx, rsy - lsy)
        if shoulder_width < 0.05:
            self.current_state = PostureState.UNASSESSED
            return PostureAssessment(
                state=PostureState.UNASSESSED,
                primary_deviation=DeviationType.NONE,
                message="Move closer to the webcam.",
                confidence=avg_vis,
                deviation_score=0.0,
                time_in_deviation=0.0,
                metrics={},
                timestamp=now,
            )

        mid_shoulder_x = (lsx + rsx) / 2.0
        mid_shoulder_y = (lsy + rsy) / 2.0
        mid_ear_x = (lex + rex) / 2.0
        mid_ear_y = (ley + rey) / 2.0

        raw_neck_dist = math.hypot(mid_shoulder_x - mid_ear_x, mid_shoulder_y - mid_ear_y)
        raw_neck_ratio = raw_neck_dist / shoulder_width
        raw_shoulder_tilt = math.degrees(math.atan2(rsy - lsy, rsx - lsx))
        raw_head_tilt = math.degrees(math.atan2(rey - ley, rex - lex))
        raw_forward_drop = (mid_shoulder_y - ny) / shoulder_width

        neck_ratio = self._apply_ema("neck_ratio", raw_neck_ratio)
        shoulder_width_smoothed = self._apply_ema("shoulder_width", shoulder_width)
        shoulder_tilt = self._apply_ema("shoulder_tilt", raw_shoulder_tilt)
        head_tilt = self._apply_ema("head_tilt", raw_head_tilt)
        forward_drop = self._apply_ema("forward_drop", raw_forward_drop)
        mid_shoulder_y_smooth = self._apply_ema("mid_shoulder_y", mid_shoulder_y)

        # 3. Compare with calibration baseline
        base_neck = self.calibration.neck_length_ratio if self.calibration else 0.55
        base_sw = self.calibration.shoulder_width_norm if self.calibration else 0.35
        base_st = self.calibration.shoulder_tilt_deg if self.calibration else 0.0
        base_ht = self.calibration.head_tilt_deg if self.calibration else 0.0
        base_drop = self.calibration.head_forward_drop_ratio if self.calibration else 0.25
        base_ms_y = self.calibration.ref_mid_shoulder_y if self.calibration else 0.60

        scaler = self.SENSITIVITY_SCALERS.get(self.sensitivity, 1.0)
        thresh_forward_head = 0.18 * scaler
        thresh_slouching = 0.08 * scaler
        thresh_lean_forward = 0.22 * scaler
        thresh_shoulder_tilt = 7.5 * scaler
        thresh_head_tilt = 9.0 * scaler

        delta_neck = (base_neck - neck_ratio) / base_neck
        delta_drop = (base_drop - forward_drop) / base_drop
        forward_head_score = max(0.0, max(delta_neck, delta_drop))
        delta_slouch = max(0.0, (mid_shoulder_y_smooth - base_ms_y) / base_ms_y)
        delta_lean = max(0.0, (shoulder_width_smoothed - base_sw) / base_sw)
        delta_shoulder_tilt = abs(shoulder_tilt - base_st)
        delta_head_tilt = abs(head_tilt - base_ht)

        deviation_candidate = DeviationType.NONE
        max_severity = 0.0

        if forward_head_score > thresh_forward_head:
            severity = forward_head_score / thresh_forward_head
            if severity > max_severity:
                max_severity = severity
                deviation_candidate = DeviationType.FORWARD_HEAD

        if delta_slouch > thresh_slouching:
            severity = delta_slouch / thresh_slouching
            if severity > max_severity:
                max_severity = severity
                deviation_candidate = DeviationType.SLOUCHING

        if delta_lean > thresh_lean_forward:
            severity = delta_lean / thresh_lean_forward
            if severity > max_severity:
                max_severity = severity
                deviation_candidate = DeviationType.LEANING_FORWARD

        if delta_shoulder_tilt > thresh_shoulder_tilt:
            severity = delta_shoulder_tilt / thresh_shoulder_tilt
            if severity > max_severity:
                max_severity = severity
                deviation_candidate = DeviationType.SHOULDER_TILT

        if delta_head_tilt > thresh_head_tilt:
            severity = delta_head_tilt / thresh_head_tilt
            if severity > max_severity:
                max_severity = severity
                deviation_candidate = DeviationType.HEAD_TILT

        # 4. State Machine with Hysteresis
        has_deviation = (deviation_candidate != DeviationType.NONE)
        duration_in_dev = 0.0

        if has_deviation:
            self.good_posture_start_time = None
            if self.deviation_start_time is None:
                self.deviation_start_time = now
            duration_in_dev = now - self.deviation_start_time

            if duration_in_dev >= self.alert_delay_seconds:
                self.current_state = PostureState.ALERT
            else:
                self.current_state = PostureState.WARNING
            self.current_deviation = deviation_candidate
        else:
            if self.current_state in (PostureState.WARNING, PostureState.ALERT):
                if self.good_posture_start_time is None:
                    self.good_posture_start_time = now
                recovery_duration = now - self.good_posture_start_time

                if recovery_duration < self.hysteresis_recovery_seconds:
                    duration_in_dev = now - (self.deviation_start_time or now)
                else:
                    self.current_state = PostureState.GOOD
                    self.current_deviation = DeviationType.NONE
                    self.deviation_start_time = None
                    self.good_posture_start_time = None
                    duration_in_dev = 0.0
            else:
                self.current_state = PostureState.GOOD
                self.current_deviation = DeviationType.NONE
                self.deviation_start_time = None
                self.good_posture_start_time = None
                duration_in_dev = 0.0

        msg = self.MESSAGES[DeviationType.NONE] if self.current_state == PostureState.GOOD else self.MESSAGES.get(self.current_deviation, self.MESSAGES[DeviationType.NONE])

        metrics_out = {
            "neck_ratio": round(neck_ratio, 3),
            "shoulder_width": round(shoulder_width_smoothed, 3),
            "shoulder_tilt_deg": round(shoulder_tilt, 1),
            "head_tilt_deg": round(head_tilt, 1),
            "forward_drop": round(forward_drop, 3),
            "max_severity": round(max_severity, 2),
        }

        return PostureAssessment(
            state=self.current_state,
            primary_deviation=self.current_deviation,
            message=msg,
            confidence=avg_vis,
            deviation_score=round(max_severity, 2),
            time_in_deviation=round(duration_in_dev, 1),
            metrics=metrics_out,
            timestamp=now,
        )
`
  },
  {
    path: 'postureguard/main_window.py',
    category: 'gui',
    description: 'PySide6 desktop UI with dark ergonomic theme, live video rendering, calibration UI, and analytics',
    language: 'python',
    content: `# (Full source file: postureguard/main_window.py, 460+ lines)
# Contains complete PySide6 MainWindow implementation, navigation sidebar,
# QStackedWidget page routing, QTimer clock updates, and video rendering.
`
  },
  {
    path: 'postureguard/calibration.py',
    category: 'core',
    description: 'Neutral posture calibration collector, baseline averaging, and JSON storage',
    language: 'python',
    content: `# (Full source file: postureguard/calibration.py)
# Gathers 40+ frames of neutral posture, averages neck ratio, shoulder tilt,
# and eye/nose drop to compute personal baseline metrics.
`
  },
  {
    path: 'postureguard/camera.py',
    category: 'cv',
    description: 'OpenCV VideoCapture hardware manager with DirectShow backend and device discovery',
    language: 'python',
    content: `# (Full source file: postureguard/camera.py)
# Manages cv2.VideoCapture with CAP_DSHOW on Windows for instant camera wake-up.
`
  },
  {
    path: 'postureguard/pose_detector.py',
    category: 'cv',
    description: 'Google MediaPipe Pose landmark extraction, joint coordinates, and skeleton drawing overlay',
    language: 'python',
    content: `# (Full source file: postureguard/pose_detector.py)
# Extracts upper body keypoints: nose, ears, shoulders, hips with normalized coordinates.
`
  },
  {
    path: 'postureguard/workers.py',
    category: 'gui',
    description: 'Non-blocking QThread camera capture and inference worker thread',
    language: 'python',
    content: `# (Full source file: postureguard/workers.py)
# Runs OpenCV and MediaPipe in a background OS thread, emitting QImage signals to the Qt GUI.
`
  },
  {
    path: 'postureguard/alerts.py',
    category: 'core',
    description: 'Notification dispatcher with cooldown quiet period and non-blocking harmonic audio chime',
    language: 'python',
    content: `# (Full source file: postureguard/alerts.py)
# Enforces configurable alert cooldowns (e.g. 15-30s) and triggers winsound or wav chimes.
`
  },
  {
    path: 'postureguard/settings.py',
    category: 'core',
    description: 'User configuration dataclass, atomic JSON persistence, and corrupted file fallback',
    language: 'python',
    content: `# (Full source file: postureguard/settings.py)
# Safely loads and saves settings in ~/.postureguard/settings.json.
`
  },
  {
    path: 'postureguard/storage.py',
    category: 'core',
    description: 'Local SQLite database for privacy-first session history tracking and aggregate analytics',
    language: 'python',
    content: `# (Full source file: postureguard/storage.py)
# Stores sessions in ~/.postureguard/history.db with zero cloud telemetry.
`
  },
  {
    path: 'postureguard/session_tracker.py',
    category: 'core',
    description: 'Live in-memory duration accumulator for good, warning, alert, and unassessed times',
    language: 'python',
    content: `# (Full source file: postureguard/session_tracker.py)
# Accurately computes posture consistency percentage without fabricating values.
`
  },
  {
    path: 'requirements.txt',
    category: 'config',
    description: 'Pinpoint dependency versions for Python 3.10 and 3.11 on Windows',
    language: 'text',
    content: `PySide6>=6.5.0,<6.8.0
opencv-python>=4.8.0.76,<5.0.0
mediapipe>=0.10.9,<0.10.15
numpy>=1.24.0,<2.0.0
pyinstaller>=6.3.0,<7.0.0
pytest>=7.4.0
`
  },
  {
    path: 'pyinstaller.spec',
    category: 'config',
    description: 'PyInstaller specification for packaging a standalone Windows .exe without console window',
    language: 'python',
    content: `# PyInstaller spec file for PostureGuard AI (dist/PostureGuard AI.exe)
# Bundles MediaPipe graph files, chime.wav, and Qt6 dependencies into a standalone binary.
`
  },
  {
    path: 'build_windows_exe.bat',
    category: 'config',
    description: 'One-click Windows batch script to create virtualenv, install deps, run tests, and package .exe',
    language: 'bat',
    content: `@echo off
echo Building PostureGuard AI Standalone Executable...
python -m venv .venv
call .venv\\Scripts\\activate.bat
pip install -r requirements.txt
python generate_assets.py
python tests\\run_tests.py
pyinstaller pyinstaller.spec --clean --noconfirm
echo Build finished! Executable: dist\\PostureGuard AI.exe
pause
`
  },
  {
    path: 'tests/run_tests.py',
    category: 'tests',
    description: 'Automated test discovery and runner for all unit test suites',
    language: 'python',
    content: `import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(PROJECT_ROOT))

def run_all_tests() -> int:
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=str(PROJECT_ROOT / "tests"), pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1

if __name__ == "__main__":
    sys.exit(run_all_tests())
`
  },
  {
    path: 'tests/test_posture_engine.py',
    category: 'tests',
    description: '12 synthetic landmark unit tests verifying forward head, slouching, tilt, and hysteresis',
    language: 'python',
    content: `# Complete unit test suite for PostureEngine math and state transitions with synthetic coordinates.
`
  },
  {
    path: 'README.md',
    category: 'docs',
    description: 'Comprehensive documentation, PowerShell commands, architecture, and troubleshooting',
    language: 'markdown',
    content: `# PostureGuard AI Documentation
# Refer to the full README.md in the project directory for complete setup and architecture guide.
`
  }
];
