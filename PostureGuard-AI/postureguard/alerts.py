"""
Alert and notification dispatcher for PostureGuard AI.
Manages audio chime playback, cooldown timing, visual notification events,
and prevents notification spamming while monitoring posture.
"""

from __future__ import annotations

import logging
import platform
import threading
import time
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# Sound playing implementations
_HAS_WINSOUND = False
if platform.system() == "Windows":
    try:
        import winsound
        _HAS_WINSOUND = True
    except ImportError:
        pass


class AlertManager:
    """
    Coordinates audio reminders and cooldown periods.
    Ensures gentle, spaced feedback without overwhelming the user.
    """

    def __init__(
        self,
        sound_enabled: bool = True,
        sound_volume: int = 80,
        cooldown_seconds: float = 15.0,
        sound_file_path: Optional[Path] = None,
    ) -> None:
        self.sound_enabled = sound_enabled
        self.sound_volume = sound_volume
        self.cooldown_seconds = cooldown_seconds
        self.sound_file_path = sound_file_path

        # State
        self.last_alert_time: float = 0.0
        self.total_alerts_triggered: int = 0
        self.is_monitoring: bool = False
        
        # Optional callback for GUI status update
        self.on_alert_triggered: Optional[Callable[[str], None]] = None

    def set_monitoring_active(self, active: bool) -> None:
        """Update monitoring state. Alerts will never fire when monitoring is inactive."""
        self.is_monitoring = active
        if not active:
            # Reset active alert timings on stop
            pass

    def can_trigger_alert(self, current_time: Optional[float] = None) -> bool:
        """Check whether enough time has elapsed since the last alert."""
        if not self.is_monitoring:
            return False
        now = time.time() if current_time is None else current_time
        return (now - self.last_alert_time) >= self.cooldown_seconds

    def trigger_alert(self, message: str, current_time: Optional[float] = None) -> bool:
        """
        Dispatches an alert if permitted by cooldown and monitoring status.
        Returns True if the alert was actually dispatched, False if suppressed by cooldown.
        """
        now = time.time() if current_time is None else current_time

        if not self.can_trigger_alert(now):
            return False

        self.last_alert_time = now
        self.total_alerts_triggered += 1

        logger.info("Posture Alert #%d triggered: %s", self.total_alerts_triggered, message)

        # Notify visual listener
        if self.on_alert_triggered:
            try:
                self.on_alert_triggered(message)
            except Exception as e:
                logger.error("Error in on_alert_triggered callback: %s", e)

        # Play audio notification in non-blocking thread
        if self.sound_enabled and self.sound_volume > 0:
            threading.Thread(target=self._play_sound_async, daemon=True).start()

        return True

    def _play_sound_async(self) -> None:
        """Plays gentle alert chime without blocking GUI thread."""
        try:
            if self.sound_file_path and self.sound_file_path.exists() and _HAS_WINSOUND:
                # Play WAV file on Windows
                winsound.PlaySound(
                    str(self.sound_file_path),
                    winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_NODEFAULT
                )
            elif _HAS_WINSOUND:
                # Fallback to a gentle system sound or gentle frequency beep
                # 587 Hz (D5) for 250ms is very soft and pleasant
                winsound.Beep(587, 280)
            else:
                # Linux/macOS dev environment or terminal bell
                print("\a", end="", flush=True)
        except Exception as e:
            logger.debug("Audio playback skipped: %s", e)

    def reset_cooldown(self) -> None:
        """Force reset cooldown timer."""
        self.last_alert_time = 0.0
