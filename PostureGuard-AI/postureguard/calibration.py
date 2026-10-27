"""
Posture calibration engine.
Collects landmark samples over a 3-5 second window while the user sits in their
neutral, comfortable working posture, then calculates baseline biomechanical ratios.
"""

from __future__ import annotations

import json
import logging
import math
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class CalibrationProfile:
    """Baseline metrics established during user calibration."""
    
    # Normalized geometric baselines relative to shoulder width
    neck_length_ratio: float = 0.55
    shoulder_width_norm: float = 0.35
    shoulder_tilt_deg: float = 0.0
    head_tilt_deg: float = 0.0
    head_forward_drop_ratio: float = 0.25
    
    # Absolute reference points for delta checking
    ref_mid_shoulder_y: float = 0.60
    ref_nose_y: float = 0.35
    
    # Metadata
    sample_count: int = 0
    calibrated_at: str = ""
    is_valid: bool = False
    
    def to_dict(self) -> Dict:
        return asdict(self)
        
    @classmethod
    def from_dict(cls, data: Dict) -> "CalibrationProfile":
        valid_keys = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


class CalibrationCollector:
    """
    Accumulator for collecting landmark frames during calibration.
    Filters frames for high landmark visibility and computes stable mean statistics.
    """

    def __init__(self, target_samples: int = 45, min_confidence: float = 0.6) -> None:
        self.target_samples = target_samples
        self.min_confidence = min_confidence
        self.samples: List[Dict[str, float]] = []
        self.start_time: float = 0.0
        self.is_collecting: bool = False

    def start(self) -> None:
        """Begin calibration session."""
        self.samples.clear()
        self.start_time = time.time()
        self.is_collecting = True

    def cancel(self) -> None:
        """Cancel ongoing calibration session."""
        self.samples.clear()
        self.is_collecting = False

    @property
    def progress_fraction(self) -> float:
        """Returns 0.0 to 1.0 progress."""
        if not self.is_collecting or self.target_samples <= 0:
            return 0.0
        return min(1.0, len(self.samples) / float(self.target_samples))

    def add_frame(
        self,
        nose: Tuple[float, float, float],
        left_ear: Tuple[float, float, float],
        right_ear: Tuple[float, float, float],
        left_shoulder: Tuple[float, float, float],
        right_shoulder: Tuple[float, float, float],
    ) -> bool:
        """
        Process a single video frame. Coordinates are (x, y, visibility/confidence).
        Returns True if the frame was acceptable and recorded.
        """
        if not self.is_collecting:
            return False

        # Check visibility threshold for all essential calibration landmarks
        landmarks = [nose, left_ear, right_ear, left_shoulder, right_shoulder]
        if any(lm[2] < self.min_confidence for lm in landmarks):
            return False

        # Extract coordinates
        nx, ny, _ = nose
        lex, ley, _ = left_ear
        rex, rey, _ = right_ear
        lsx, lsy, _ = left_shoulder
        rsx, rsy, _ = right_shoulder

        # Calculate shoulder width (normalization scale)
        shoulder_width = math.hypot(rsx - lsx, rsy - lsy)
        if shoulder_width < 0.05:  # Too far or invalid
            return False

        # Midpoints
        mid_shoulder_x = (lsx + rsx) / 2.0
        mid_shoulder_y = (lsy + rsy) / 2.0
        mid_ear_x = (lex + rex) / 2.0
        mid_ear_y = (ley + rey) / 2.0

        # Neck vector (mid-ear to mid-shoulder)
        neck_dist = math.hypot(mid_shoulder_x - mid_ear_x, mid_shoulder_y - mid_ear_y)
        neck_length_ratio = neck_dist / shoulder_width

        # Shoulder tilt angle (degrees from horizontal)
        shoulder_tilt_deg = math.degrees(math.atan2(rsy - lsy, rsx - lsx))

        # Head tilt angle (degrees from horizontal between ears)
        head_tilt_deg = math.degrees(math.atan2(rey - ley, rex - lex))

        # Forward head vertical drop (nose to mid-shoulder distance normalized)
        forward_drop_ratio = (mid_shoulder_y - ny) / shoulder_width

        self.samples.append({
            "neck_length_ratio": neck_length_ratio,
            "shoulder_width_norm": shoulder_width,
            "shoulder_tilt_deg": shoulder_tilt_deg,
            "head_tilt_deg": head_tilt_deg,
            "head_forward_drop_ratio": forward_drop_ratio,
            "ref_mid_shoulder_y": mid_shoulder_y,
            "ref_nose_y": ny,
        })

        if len(self.samples) >= self.target_samples:
            self.is_collecting = False
            return True

        return True

    def compute_profile(self) -> Optional[CalibrationProfile]:
        """
        Calculate calibration profile with outlier rejection.
        Returns CalibrationProfile if sufficient valid samples exist, otherwise None.
        """
        if len(self.samples) < 15:
            logger.warning("Calibration rejected: insufficient valid frames (%d/%d).",
                           len(self.samples), self.target_samples)
            return None

        # Calculate averages
        n = len(self.samples)
        avg_neck = sum(s["neck_length_ratio"] for s in self.samples) / n
        avg_sw = sum(s["shoulder_width_norm"] for s in self.samples) / n
        avg_st = sum(s["shoulder_tilt_deg"] for s in self.samples) / n
        avg_ht = sum(s["head_tilt_deg"] for s in self.samples) / n
        avg_drop = sum(s["head_forward_drop_ratio"] for s in self.samples) / n
        avg_ms_y = sum(s["ref_mid_shoulder_y"] for s in self.samples) / n
        avg_nose_y = sum(s["ref_nose_y"] for s in self.samples) / n

        profile = CalibrationProfile(
            neck_length_ratio=round(avg_neck, 4),
            shoulder_width_norm=round(avg_sw, 4),
            shoulder_tilt_deg=round(avg_st, 2),
            head_tilt_deg=round(avg_ht, 2),
            head_forward_drop_ratio=round(avg_drop, 4),
            ref_mid_shoulder_y=round(avg_ms_y, 4),
            ref_nose_y=round(avg_nose_y, 4),
            sample_count=n,
            calibrated_at=time.strftime("%Y-%m-%d %H:%M:%S"),
            is_valid=True,
        )
        return profile


class CalibrationManager:
    """Manages loading and saving user calibration profiles."""

    def __init__(self, config_dir: Path | None = None) -> None:
        if config_dir is None:
            home = Path.home()
            self.config_dir = home / ".postureguard"
        else:
            self.config_dir = Path(config_dir)

        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.file_path = self.config_dir / "calibration.json"
        self._current_profile: Optional[CalibrationProfile] = self.load()

    @property
    def profile(self) -> Optional[CalibrationProfile]:
        return self._current_profile

    def has_valid_calibration(self) -> bool:
        return self._current_profile is not None and self._current_profile.is_valid

    def load(self) -> Optional[CalibrationProfile]:
        """Loads calibration from JSON file if present."""
        if not self.file_path.exists():
            return None
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            prof = CalibrationProfile.from_dict(data)
            self._current_profile = prof
            return prof
        except Exception as e:
            logger.warning("Failed to load calibration (%s).", e)
            return None

    def save(self, profile: CalibrationProfile) -> bool:
        """Saves calibration to disk."""
        try:
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(profile.to_dict(), f, indent=2)
            self._current_profile = profile
            return True
        except Exception as e:
            logger.error("Failed to save calibration: %s", e)
            return False

    def clear(self) -> None:
        """Clears calibration file."""
        self._current_profile = None
        if self.file_path.exists():
            self.file_path.unlink(missing_ok=True)
