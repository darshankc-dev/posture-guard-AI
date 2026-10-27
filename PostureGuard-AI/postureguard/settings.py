"""
Configuration and settings management for PostureGuard AI.
Handles JSON persistence, validation, safe fallbacks, and user preference updates.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)


@dataclass
class AppSettings:
    """User preferences and operational configuration."""
    
    # Camera configuration
    camera_index: int = 0
    show_skeleton: bool = True
    camera_fps_limit: int = 24
    camera_resolution_width: int = 640
    camera_resolution_height: int = 480
    
    # Audio Alert configuration
    sound_enabled: bool = True
    sound_volume: int = 80  # 0 to 100
    alert_delay_seconds: float = 5.0  # Duration posture deviation must persist before alert
    alert_cooldown_seconds: float = 15.0  # Time between consecutive alerts
    
    # Detection sensitivity: 'low', 'medium', 'high'
    # Affects angle thresholds (high = stricter posture tolerance)
    sensitivity: str = "medium"
    min_landmark_confidence: float = 0.55
    
    # Ergonomic break reminders
    enable_break_reminder: bool = True
    break_interval_minutes: int = 30
    
    # Data & Privacy
    save_session_history: bool = True
    launch_minimized_to_tray: bool = False
    
    def validate(self) -> "AppSettings":
        """Validate and clamp settings to safe operational bounds."""
        if self.camera_index < 0:
            self.camera_index = 0
            
        if self.sound_volume < 0:
            self.sound_volume = 0
        elif self.sound_volume > 100:
            self.sound_volume = 100
            
        if self.alert_delay_seconds < 1.0:
            self.alert_delay_seconds = 1.0
        elif self.alert_delay_seconds > 60.0:
            self.alert_delay_seconds = 60.0
            
        if self.alert_cooldown_seconds < 3.0:
            self.alert_cooldown_seconds = 3.0
        elif self.alert_cooldown_seconds > 300.0:
            self.alert_cooldown_seconds = 300.0
            
        if self.sensitivity.lower() not in ("low", "medium", "high"):
            self.sensitivity = "medium"
        else:
            self.sensitivity = self.sensitivity.lower()
            
        if not (0.1 <= self.min_landmark_confidence <= 0.99):
            self.min_landmark_confidence = 0.55
            
        if self.break_interval_minutes < 5:
            self.break_interval_minutes = 5
        elif self.break_interval_minutes > 180:
            self.break_interval_minutes = 180
            
        return self


class SettingsManager:
    """Manages reading and writing application settings to JSON."""

    def __init__(self, config_dir: Path | None = None) -> None:
        if config_dir is None:
            # Default to standard user profile directory: ~/.postureguard
            home = Path.home()
            self.config_dir = home / ".postureguard"
        else:
            self.config_dir = Path(config_dir)

        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.settings_file = self.config_dir / "settings.json"
        self._current_settings = self.load()

    @property
    def current(self) -> AppSettings:
        return self._current_settings

    def load(self) -> AppSettings:
        """Load settings from JSON file, returning defaults if missing or corrupt."""
        if not self.settings_file.exists():
            logger.info("Settings file does not exist, creating default settings.")
            defaults = AppSettings()
            self.save(defaults)
            return defaults

        try:
            with open(self.settings_file, "r", encoding="utf-8") as f:
                data: Dict[str, Any] = json.load(f)
            
            # Map fields safely, filtering unexpected keys
            valid_keys = {f.name for f in AppSettings.__dataclass_fields__.values()}
            filtered = {k: v for k, v in data.items() if k in valid_keys}
            settings = AppSettings(**filtered).validate()
            self._current_settings = settings
            return settings
        except Exception as e:
            logger.warning("Failed to parse settings JSON (%s). Reverting to defaults.", e)
            fallback = AppSettings()
            self._current_settings = fallback
            return fallback

    def save(self, settings: AppSettings | None = None) -> bool:
        """Save settings object to JSON with atomic write."""
        if settings is not None:
            self._current_settings = settings.validate()

        temp_file = self.settings_file.with_suffix(".tmp")
        try:
            payload = asdict(self._current_settings)
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            temp_file.replace(self.settings_file)
            return True
        except Exception as e:
            logger.error("Failed to save settings: %s", e)
            if temp_file.exists():
                temp_file.unlink(missing_ok=True)
            return False

    def update(self, **kwargs: Any) -> AppSettings:
        """Update individual settings fields and immediately persist."""
        current_dict = asdict(self._current_settings)
        for k, v in kwargs.items():
            if k in current_dict:
                current_dict[k] = v
        self._current_settings = AppSettings(**current_dict).validate()
        self.save(self._current_settings)
        return self._current_settings
