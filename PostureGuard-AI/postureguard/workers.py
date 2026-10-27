"""
Background worker thread using PySide6 QThread.
Separates real-time OpenCV webcam capture, MediaPipe inference, and posture
analysis from the main Qt GUI event loop.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from PySide6.QtCore import QObject, QThread, Signal
    from PySide6.QtGui import QImage
    _HAS_PYSIDE6 = True
except ImportError:
    # Minimal fallback dummy classes if running in headless test environment
    _HAS_PYSIDE6 = False
    class QObject: pass
    class QThread: pass
    def Signal(*args, **kwargs):
        class _DummySignal:
            def emit(self, *a, **k): pass
            def connect(self, *a, **k): pass
        return _DummySignal()
    class QImage: pass

try:
    import cv2
    _HAS_CV2 = True
except ImportError:
    cv2 = None
    _HAS_CV2 = False

from postureguard.alerts import AlertManager
from postureguard.calibration import CalibrationCollector, CalibrationManager, CalibrationProfile
from postureguard.camera import CameraDevice
from postureguard.pose_detector import PoseDetector
from postureguard.posture_engine import PostureAssessment, PostureEngine, PostureState
from postureguard.session_tracker import SessionTracker
from postureguard.settings import AppSettings


class PostureWorker(QThread if _HAS_PYSIDE6 else object):
    """
    QThread background worker for camera capture and continuous posture analysis.
    """

    # Qt Signals for UI communication
    frame_ready = Signal(object)              # Emits QImage for QPainter display
    assessment_ready = Signal(object)         # Emits PostureAssessment
    calibration_progress = Signal(float, int, int)  # fraction, collected, target
    calibration_finished = Signal(bool, str)  # success, message
    camera_error = Signal(str)                # error message
    fps_updated = Signal(float)               # current processing FPS

    def __init__(
        self,
        settings: AppSettings,
        calibration_manager: CalibrationManager,
        session_tracker: SessionTracker,
        alert_manager: AlertManager,
        parent: Optional[QObject] = None,
    ) -> None:
        if _HAS_PYSIDE6:
            super().__init__(parent)
            
        self.settings = settings
        self.calibration_manager = calibration_manager
        self.session_tracker = session_tracker
        self.alert_manager = alert_manager

        # Modules
        self.camera: Optional[CameraDevice] = None
        self.pose_detector: Optional[PoseDetector] = None
        self.posture_engine: Optional[PostureEngine] = None
        self.calibration_collector = CalibrationCollector(
            target_samples=40,
            min_confidence=self.settings.min_landmark_confidence
        )

        # Thread flow control flags
        self._running: bool = False
        self._paused: bool = False
        self._is_calibrating: bool = False

    def start_monitoring(self) -> None:
        """Initiate background thread and start monitoring."""
        self._running = True
        self._paused = False
        self.session_tracker.start_session()
        self.alert_manager.set_monitoring_active(True)
        if _HAS_PYSIDE6:
            self.start()

    def pause_monitoring(self) -> None:
        """Pause analysis while keeping camera stream warm."""
        self._paused = True
        self.alert_manager.set_monitoring_active(False)

    def resume_monitoring(self) -> None:
        """Resume active posture monitoring."""
        self._paused = False
        self.alert_manager.set_monitoring_active(True)

    def stop_monitoring(self) -> None:
        """Signal worker to stop, release camera, and terminate thread."""
        self._running = False
        self._paused = False
        self._is_calibrating = False
        self.alert_manager.set_monitoring_active(False)
        self.session_tracker.stop_session()
        if _HAS_PYSIDE6 and self.isRunning():
            self.wait(1500)

    def start_calibration(self) -> None:
        """Switch into calibration mode to capture baseline neutral posture."""
        self._is_calibrating = True
        self.calibration_collector.start()

    def cancel_calibration(self) -> None:
        """Abort current calibration."""
        self._is_calibrating = False
        self.calibration_collector.cancel()

    def run(self) -> None:
        """Worker main loop running on separate OS thread."""
        logger.info("PostureWorker thread started.")

        # 1. Initialize Camera
        self.camera = CameraDevice(
            camera_index=self.settings.camera_index,
            width=self.settings.camera_resolution_width,
            height=self.settings.camera_resolution_height,
            fps_target=self.settings.camera_fps_limit,
        )

        if not self.camera.open():
            self.camera_error.emit(
                f"Could not open webcam (device #{self.settings.camera_index}). "
                "Please check camera permissions or select another camera."
            )
            self._running = False
            return

        # 2. Initialize Pose Detector
        self.pose_detector = PoseDetector(
            min_detection_confidence=self.settings.min_landmark_confidence,
            min_tracking_confidence=self.settings.min_landmark_confidence,
        )

        # 3. Initialize Posture Engine
        self.posture_engine = PostureEngine(
            calibration=self.calibration_manager.profile,
            sensitivity=self.settings.sensitivity,
            alert_delay_seconds=self.settings.alert_delay_seconds,
            min_confidence=self.settings.min_landmark_confidence,
        )

        frame_count = 0
        fps_start = time.time()
        target_frame_time = 1.0 / max(10, self.settings.camera_fps_limit)

        while self._running:
            loop_start = time.time()

            # Read next frame
            ret, frame = self.camera.read_frame()
            if not ret or frame is None:
                # Camera read dropped or disconnected
                time.sleep(0.05)
                continue

            frame_count += 1
            if frame_count >= 20:
                elapsed = time.time() - fps_start
                if elapsed > 0:
                    current_fps = round(frame_count / elapsed, 1)
                    self.fps_updated.emit(current_fps)
                frame_count = 0
                fps_start = time.time()

            # Process pose
            pose_result, _ = self.pose_detector.process_frame(frame)

            state_str = "unassessed"
            assessment: Optional[PostureAssessment] = None

            # Handle Calibration Mode
            if self._is_calibrating:
                if pose_result.has_landmarks:
                    accepted = self.calibration_collector.add_frame(
                        nose=pose_result.nose,
                        left_ear=pose_result.left_ear,
                        right_ear=pose_result.right_ear,
                        left_shoulder=pose_result.left_shoulder,
                        right_shoulder=pose_result.right_shoulder,
                    )
                    
                    prog = self.calibration_collector.progress_fraction
                    collected = len(self.calibration_collector.samples)
                    target = self.calibration_collector.target_samples
                    self.calibration_progress.emit(prog, collected, target)

                    if not self.calibration_collector.is_collecting:
                        # Finished collecting
                        profile = self.calibration_collector.compute_profile()
                        if profile and profile.is_valid:
                            self.calibration_manager.save(profile)
                            self.posture_engine.set_calibration(profile)
                            self.calibration_finished.emit(True, "Calibration successful! Reference baseline saved.")
                        else:
                            self.calibration_finished.emit(
                                False, "Calibration failed: Please sit upright and ensure full visibility."
                            )
                        self._is_calibrating = False
                state_str = "good" if pose_result.has_landmarks else "unassessed"

            # Handle Active Posture Monitoring
            elif not self._paused:
                if pose_result.has_landmarks:
                    assessment = self.posture_engine.evaluate(
                        nose=pose_result.nose,
                        left_ear=pose_result.left_ear,
                        right_ear=pose_result.right_ear,
                        left_shoulder=pose_result.left_shoulder,
                        right_shoulder=pose_result.right_shoulder,
                        current_time=loop_start,
                    )
                    state_str = assessment.state.value.lower()
                    self.session_tracker.update_state(assessment.state, loop_start)

                    # Trigger alert if in ALERT state
                    if assessment.state == PostureState.ALERT:
                        alert_fired = self.alert_manager.trigger_alert(
                            assessment.message, current_time=loop_start
                        )
                        if alert_fired:
                            self.session_tracker.increment_reminder()

                    self.assessment_ready.emit(assessment)
                else:
                    self.session_tracker.update_state(PostureState.UNASSESSED, loop_start)

            # Draw skeleton overlay if configured
            if self.settings.show_skeleton and pose_result.has_landmarks:
                frame = self.pose_detector.draw_skeleton(frame, pose_result, status_color=state_str)

            # Convert BGR OpenCV frame to Qt QImage
            if _HAS_PYSIDE6 and _HAS_CV2:
                q_img = self._cv2_to_qimage(frame)
                self.frame_ready.emit(q_img)

            # Throttle loop to target FPS
            loop_duration = time.time() - loop_start
            sleep_needed = target_frame_time - loop_duration
            if sleep_needed > 0.002:
                time.sleep(sleep_needed)

        # Cleanup when thread finishes
        logger.info("Cleaning up PostureWorker resources.")
        if self.camera:
            self.camera.release()
            self.camera = None
        if self.pose_detector:
            self.pose_detector.close()
            self.pose_detector = None

    def _cv2_to_qimage(self, frame_bgr: any) -> Optional[QImage]:
        """Convert OpenCV BGR image matrix to PySide6 QImage without memory copies."""
        if frame_bgr is None:
            return None
        rgb_frame = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        h, w, ch = rgb_frame.shape
        bytes_per_line = ch * w
        q_img = QImage(rgb_frame.data, w, h, bytes_per_line, QImage.Format_RGB888)
        # Keep copy so buffer persists beyond frame scope
        return q_img.copy()
