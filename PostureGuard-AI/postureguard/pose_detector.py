"""
Pose detection and landmark extraction module using Google MediaPipe.
Extracts upper body skeletal joints and renders real-time visual skeleton overlays.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

try:
    import cv2
    import mediapipe as mp
    _HAS_CV2_AND_MP = True
except ImportError:
    cv2 = None
    mp = None
    _HAS_CV2_AND_MP = False


@dataclass
class PoseLandmarkResult:
    """Extracted normalized landmark coordinates and detection status."""
    has_landmarks: bool
    nose: Tuple[float, float, float]  # (x, y, visibility)
    left_ear: Tuple[float, float, float]
    right_ear: Tuple[float, float, float]
    left_shoulder: Tuple[float, float, float]
    right_shoulder: Tuple[float, float, float]
    left_hip: Tuple[float, float, float]
    right_hip: Tuple[float, float, float]
    average_confidence: float


class PoseDetector:
    """
    Wraps Google MediaPipe Pose solution for real-time upper-body tracking.
    """

    # Landmark indices according to MediaPipe Pose specification
    LM_NOSE = 0
    LM_LEFT_EYE = 2
    LM_RIGHT_EYE = 5
    LM_LEFT_EAR = 7
    LM_RIGHT_EAR = 8
    LM_LEFT_SHOULDER = 11
    LM_RIGHT_SHOULDER = 12
    LM_LEFT_HIP = 23
    LM_RIGHT_HIP = 24

    # Color palette (BGR for OpenCV)
    COLOR_GOOD = (76, 217, 100)       # Emerald / Green
    COLOR_WARNING = (38, 172, 255)    # Amber / Orange
    COLOR_ALERT = (50, 50, 240)       # Crimson / Red
    COLOR_UNASSESSED = (160, 160, 160) # Muted Slate
    COLOR_JOINT = (255, 255, 255)     # White landmark dots

    def __init__(
        self,
        min_detection_confidence: float = 0.55,
        min_tracking_confidence: float = 0.55,
        model_complexity: int = 1,  # 0=fastest, 1=balanced, 2=accurate
    ) -> None:
        self.min_detection_confidence = min_detection_confidence
        self.min_tracking_confidence = min_tracking_confidence
        self.model_complexity = model_complexity
        self._pose_engine = None

        if _HAS_CV2_AND_MP:
            self._init_mediapipe()

    def _init_mediapipe(self) -> None:
        """Initialize the MediaPipe Pose graph."""
        try:
            self._mp_pose = mp.solutions.pose
            self._pose_engine = self._mp_pose.Pose(
                static_image_mode=False,
                model_complexity=self.model_complexity,
                smooth_landmarks=True,
                enable_segmentation=False,
                min_detection_confidence=self.min_detection_confidence,
                min_tracking_confidence=self.min_tracking_confidence,
            )
            logger.info("MediaPipe Pose initialized successfully (complexity=%d).", self.model_complexity)
        except Exception as e:
            logger.error("Failed to initialize MediaPipe Pose: %s", e)
            self._pose_engine = None

    def process_frame(self, frame_bgr: any) -> Tuple[PoseLandmarkResult, any]:
        """
        Process a BGR frame from OpenCV.
        Returns:
            PoseLandmarkResult containing detected landmarks.
            Processed frame (with converted color or ready for drawing).
        """
        if not _HAS_CV2_AND_MP or self._pose_engine is None or frame_bgr is None:
            return self._empty_result(), frame_bgr

        try:
            # MediaPipe expects RGB
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            frame_rgb.flags.writeable = False
            results = self._pose_engine.process(frame_rgb)
            frame_rgb.flags.writeable = True

            if not results.pose_landmarks:
                return self._empty_result(), frame_bgr

            lms = results.pose_landmarks.landmark

            def get_lm(idx: int) -> Tuple[float, float, float]:
                lm = lms[idx]
                return (lm.x, lm.y, lm.visibility)

            nose = get_lm(self.LM_NOSE)
            left_ear = get_lm(self.LM_LEFT_EAR)
            right_ear = get_lm(self.LM_RIGHT_EAR)
            left_shoulder = get_lm(self.LM_LEFT_SHOULDER)
            right_shoulder = get_lm(self.LM_RIGHT_SHOULDER)
            left_hip = get_lm(self.LM_LEFT_HIP)
            right_hip = get_lm(self.LM_RIGHT_HIP)

            key_landmarks = [nose, left_ear, right_ear, left_shoulder, right_shoulder]
            avg_conf = sum(lm[2] for lm in key_landmarks) / len(key_landmarks)

            result = PoseLandmarkResult(
                has_landmarks=True,
                nose=nose,
                left_ear=left_ear,
                right_ear=right_ear,
                left_shoulder=left_shoulder,
                right_shoulder=right_shoulder,
                left_hip=left_hip,
                right_hip=right_hip,
                average_confidence=avg_conf,
            )
            return result, frame_bgr
        except Exception as e:
            logger.warning("Error during pose detection: %s", e)
            return self._empty_result(), frame_bgr

    def draw_skeleton(
        self,
        frame_bgr: any,
        result: PoseLandmarkResult,
        status_color: str = "good",
    ) -> any:
        """
        Draw a sleek visual skeleton overlay over the video frame.
        Colors are customized based on the posture state.
        """
        if not _HAS_CV2_AND_MP or frame_bgr is None or not result.has_landmarks:
            return frame_bgr

        color_map = {
            "good": self.COLOR_GOOD,
            "warning": self.COLOR_WARNING,
            "alert": self.COLOR_ALERT,
            "unassessed": self.COLOR_UNASSESSED,
        }
        bone_color = color_map.get(status_color.lower(), self.COLOR_GOOD)

        h, w = frame_bgr.shape[:2]

        def to_px(pt: Tuple[float, float, float]) -> Tuple[int, int]:
            return (int(pt[0] * w), int(pt[1] * h))

        # Check landmark coordinates are in valid range
        p_nose = to_px(result.nose)
        p_lear = to_px(result.left_ear)
        p_rear = to_px(result.right_ear)
        p_lshoulder = to_px(result.left_shoulder)
        p_rshoulder = to_px(result.right_shoulder)
        p_lhip = to_px(result.left_hip)
        p_rhip = to_px(result.right_hip)

        # Draw Face Bounding Box around head
        ear_dist = max(40, int(abs(p_rear[0] - p_lear[0]) * 1.45))
        box_x1 = max(5, p_nose[0] - ear_dist // 2)
        box_y1 = max(5, p_nose[1] - int(ear_dist * 0.55))
        box_x2 = min(w - 5, p_nose[0] + ear_dist // 2)
        box_y2 = min(h - 5, p_nose[1] + int(ear_dist * 0.55))
        cv2.rectangle(frame_bgr, (box_x1, box_y1), (box_x2, box_y2), bone_color, 2, cv2.LINE_AA)
        cv2.putText(
            frame_bgr,
            f"FACE & POSTURE: {status_color.upper()}",
            (box_x1, max(20, box_y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            bone_color,
            2,
            cv2.LINE_AA,
        )

        # Draw bones (connections) with anti-aliasing
        connections = [
            (p_lear, p_nose),
            (p_rear, p_nose),
            (p_lear, p_lshoulder),
            (p_rear, p_rshoulder),
            (p_lshoulder, p_rshoulder),
            (p_lshoulder, p_lhip),
            (p_rshoulder, p_rhip),
            (p_lhip, p_rhip),
        ]

        for p1, p2 in connections:
            cv2.line(frame_bgr, p1, p2, bone_color, 2, cv2.LINE_AA)

        # Draw joints
        joints = [p_nose, p_lear, p_rear, p_lshoulder, p_rshoulder, p_lhip, p_rhip]
        for pt in joints:
            # Outer halo
            cv2.circle(frame_bgr, pt, 5, bone_color, -1, cv2.LINE_AA)
            # Inner dot
            cv2.circle(frame_bgr, pt, 2, self.COLOR_JOINT, -1, cv2.LINE_AA)

        return frame_bgr

    def _empty_result(self) -> PoseLandmarkResult:
        empty = (0.0, 0.0, 0.0)
        return PoseLandmarkResult(
            has_landmarks=False,
            nose=empty,
            left_ear=empty,
            right_ear=empty,
            left_shoulder=empty,
            right_shoulder=empty,
            left_hip=empty,
            right_hip=empty,
            average_confidence=0.0,
        )

    def close(self) -> None:
        """Release MediaPipe resources."""
        if self._pose_engine:
            try:
                self._pose_engine.close()
            except Exception:
                pass
            self._pose_engine = None
