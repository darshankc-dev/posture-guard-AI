"""
Camera management and acquisition module using OpenCV.
Handles hardware webcam initialization, frame grabbing, device enumeration,
and clean resource disposal.
"""

from __future__ import annotations

import logging
import platform
import time
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

try:
    import cv2
    _HAS_CV2 = True
except ImportError:
    cv2 = None
    _HAS_CV2 = False


class CameraDevice:
    """Wrapper around cv2.VideoCapture with robust error handling."""

    def __init__(
        self,
        camera_index: int = 0,
        width: int = 640,
        height: int = 480,
        fps_target: int = 24,
    ) -> None:
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self.fps_target = fps_target
        self.cap: Optional["cv2.VideoCapture"] = None
        self.is_open: bool = False

    def open(self) -> bool:
        """
        Open the webcam device.
        Uses CAP_DSHOW on Windows for fast, reliable DirectShow startup.
        """
        if not _HAS_CV2:
            logger.error("OpenCV (cv2) is not installed.")
            return False

        self.release()

        try:
            # Use DirectShow backend on Windows to prevent long camera startup delays
            if platform.system() == "Windows":
                backend = cv2.CAP_DSHOW
                self.cap = cv2.VideoCapture(self.camera_index, backend)
            else:
                self.cap = cv2.VideoCapture(self.camera_index)

            if not self.cap.isOpened():
                # Fallback to default backend
                self.cap = cv2.VideoCapture(self.camera_index)

            if not self.cap or not self.cap.isOpened():
                logger.error("Unable to open camera index %d", self.camera_index)
                self.is_open = False
                return False

            # Set requested dimensions and capture parameters
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self.cap.set(cv2.CAP_PROP_FPS, self.fps_target)

            self.is_open = True
            logger.info("Successfully opened camera %d (%dx%d @ %d FPS)",
                        self.camera_index, self.width, self.height, self.fps_target)
            return True
        except Exception as e:
            logger.error("Exception opening camera %d: %s", self.camera_index, e)
            self.release()
            return False

    def read_frame(self) -> Tuple[bool, Optional[any]]:
        """
        Grab and decode the next frame from the camera stream.
        Returns (success, frame_bgr).
        """
        if not self.is_open or self.cap is None:
            return False, None

        try:
            ret, frame = self.cap.read()
            if not ret or frame is None:
                return False, None
            return True, frame
        except Exception as e:
            logger.warning("Error reading frame from camera: %s", e)
            return False, None

    def release(self) -> None:
        """Safely release webcam hardware resource."""
        self.is_open = False
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception as e:
                logger.debug("Error releasing camera: %s", e)
            finally:
                self.cap = None
        logger.info("Camera %d released.", self.camera_index)

    @staticmethod
    def list_available_cameras(max_tested: int = 4) -> List[int]:
        """
        Test camera indices 0 through max_tested-1 to detect attached webcams.
        """
        if not _HAS_CV2:
            return [0]

        available: List[int] = []
        for index in range(max_tested):
            backend = cv2.CAP_DSHOW if platform.system() == "Windows" else cv2.CAP_ANY
            cap = cv2.VideoCapture(index, backend)
            if cap.isOpened():
                ret, _ = cap.read()
                if ret:
                    available.append(index)
                cap.release()
        return available if available else [0]
