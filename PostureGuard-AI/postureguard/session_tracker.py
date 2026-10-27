"""
Live session metrics tracker for PostureGuard AI.
Maintains continuous duration accounting per posture state and generates
accurate session analytics without inflating or fabricating metrics.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

from postureguard.posture_engine import PostureState
from postureguard.storage import HistoryStorage, SessionRecord


@dataclass
class SessionSnapshot:
    """Current live summary of an ongoing monitoring session."""
    elapsed_seconds: float
    good_seconds: float
    warning_seconds: float
    alert_seconds: float
    unassessed_seconds: float
    reminders_count: int
    consistency_percentage: float  # Good time / (Good + Warning + Alert)
    break_timer_seconds: float


class SessionTracker:
    """
    Accumulates time spent across each posture state during an active session.
    """

    def __init__(self, storage: Optional[HistoryStorage] = None) -> None:
        self.storage = storage
        self.is_active: bool = False
        self.session_start_time: float = 0.0
        self.session_end_time: float = 0.0
        self.last_update_time: float = 0.0

        # Accumulated seconds per state
        self.good_seconds: float = 0.0
        self.warning_seconds: float = 0.0
        self.alert_seconds: float = 0.0
        self.unassessed_seconds: float = 0.0

        self.reminders_count: int = 0
        self.break_timer_seconds: float = 0.0
        self.current_state: PostureState = PostureState.UNASSESSED

    def start_session(self) -> None:
        """Initialize and start a fresh monitoring session."""
        now = time.time()
        self.is_active = True
        self.session_start_time = now
        self.last_update_time = now
        self.good_seconds = 0.0
        self.warning_seconds = 0.0
        self.alert_seconds = 0.0
        self.unassessed_seconds = 0.0
        self.reminders_count = 0
        self.break_timer_seconds = 0.0
        self.current_state = PostureState.UNASSESSED

    def stop_session(self) -> Optional[SessionRecord]:
        """
        Conclude monitoring session and persist to history if storage is configured.
        Returns the finalized SessionRecord.
        """
        if not self.is_active:
            return None

        self.update_state(self.current_state)
        self.is_active = False
        self.session_end_time = time.time()

        duration = max(0.0, self.session_end_time - self.session_start_time)
        assessed_time = self.good_seconds + self.warning_seconds + self.alert_seconds
        
        # Calculate consistency: fraction of assessed time spent in good posture
        if assessed_time > 0.0:
            consistency = (self.good_seconds / assessed_time) * 100.0
        else:
            consistency = 0.0

        record = SessionRecord(
            id=None,
            start_time=time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.session_start_time)),
            end_time=time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.session_end_time)),
            duration_seconds=duration,
            good_seconds=self.good_seconds,
            warning_seconds=self.warning_seconds,
            alert_seconds=self.alert_seconds,
            unassessed_seconds=self.unassessed_seconds,
            reminders_count=self.reminders_count,
            consistency_percentage=round(consistency, 1),
        )

        if self.storage and duration >= 10.0:  # Only save meaningful sessions >10s
            saved_id = self.storage.save_session(record)
            record.id = saved_id

        return record

    def increment_reminder(self) -> None:
        """Increment count of posture reminders issued."""
        if self.is_active:
            self.reminders_count += 1

    def update_state(self, new_state: PostureState, current_time: Optional[float] = None) -> None:
        """Accumulate delta time into current state bucket and update state."""
        now = time.time() if current_time is None else current_time
        if not self.is_active:
            return

        dt = max(0.0, now - self.last_update_time)
        self.last_update_time = now

        # Add to break timer
        self.break_timer_seconds += dt

        # Bucket into corresponding state
        if self.current_state == PostureState.GOOD:
            self.good_seconds += dt
        elif self.current_state == PostureState.WARNING:
            self.warning_seconds += dt
        elif self.current_state == PostureState.ALERT:
            self.alert_seconds += dt
        else:
            self.unassessed_seconds += dt

        self.current_state = new_state

    def get_snapshot(self, current_time: Optional[float] = None) -> SessionSnapshot:
        """Get live metrics snapshot for GUI display."""
        now = time.time() if current_time is None else current_time
        if not self.is_active:
            return SessionSnapshot(
                elapsed_seconds=0.0,
                good_seconds=self.good_seconds,
                warning_seconds=self.warning_seconds,
                alert_seconds=self.alert_seconds,
                unassessed_seconds=self.unassessed_seconds,
                reminders_count=self.reminders_count,
                consistency_percentage=0.0,
                break_timer_seconds=0.0,
            )

        elapsed = max(0.0, now - self.session_start_time)
        assessed = self.good_seconds + self.warning_seconds + self.alert_seconds
        consistency = (self.good_seconds / assessed * 100.0) if assessed > 0 else 100.0

        return SessionSnapshot(
            elapsed_seconds=round(elapsed, 1),
            good_seconds=round(self.good_seconds, 1),
            warning_seconds=round(self.warning_seconds, 1),
            alert_seconds=round(self.alert_seconds, 1),
            unassessed_seconds=round(self.unassessed_seconds, 1),
            reminders_count=self.reminders_count,
            consistency_percentage=round(min(100.0, max(0.0, consistency)), 1),
            break_timer_seconds=round(self.break_timer_seconds, 1),
        )
