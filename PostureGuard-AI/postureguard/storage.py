"""
SQLite database storage for PostureGuard AI session history.
Stores daily aggregated statistics and session summaries completely locally.
"""

from __future__ import annotations

import logging
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class SessionRecord:
    """Historical session summary data record."""
    id: Optional[int]
    start_time: str
    end_time: str
    duration_seconds: float
    good_seconds: float
    warning_seconds: float
    alert_seconds: float
    unassessed_seconds: float
    reminders_count: int
    consistency_percentage: float


class HistoryStorage:
    """Local SQLite database manager for tracking posture trends over time."""

    def __init__(self, db_dir: Path | None = None) -> None:
        if db_dir is None:
            home = Path.home()
            self.db_dir = home / ".postureguard"
        else:
            self.db_dir = Path(db_dir)

        self.db_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.db_dir / "history.db"
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Create tables and indexes if they do not exist."""
        try:
            with self._get_connection() as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        start_time TEXT NOT NULL,
                        end_time TEXT NOT NULL,
                        duration_seconds REAL NOT NULL,
                        good_seconds REAL NOT NULL,
                        warning_seconds REAL NOT NULL,
                        alert_seconds REAL NOT NULL,
                        unassessed_seconds REAL NOT NULL,
                        reminders_count INTEGER NOT NULL,
                        consistency_percentage REAL NOT NULL
                    )
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_sessions_start 
                    ON sessions(start_time)
                """)
                conn.commit()
        except Exception as e:
            logger.error("Failed to initialize database: %s", e)

    def save_session(self, record: SessionRecord) -> Optional[int]:
        """Save a completed session to SQLite."""
        try:
            with self._get_connection() as conn:
                cur = conn.execute("""
                    INSERT INTO sessions (
                        start_time, end_time, duration_seconds,
                        good_seconds, warning_seconds, alert_seconds,
                        unassessed_seconds, reminders_count, consistency_percentage
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    record.start_time,
                    record.end_time,
                    round(record.duration_seconds, 1),
                    round(record.good_seconds, 1),
                    round(record.warning_seconds, 1),
                    round(record.alert_seconds, 1),
                    round(record.unassessed_seconds, 1),
                    record.reminders_count,
                    round(record.consistency_percentage, 1),
                ))
                conn.commit()
                return cur.lastrowid
        except Exception as e:
            logger.error("Error saving session record: %s", e)
            return None

    def get_recent_sessions(self, limit: int = 20) -> List[SessionRecord]:
        """Retrieve recent session history."""
        records: List[SessionRecord] = []
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT * FROM sessions
                    ORDER BY id DESC
                    LIMIT ?
                """, (limit,))
                for row in cursor.fetchall():
                    records.append(SessionRecord(
                        id=row["id"],
                        start_time=row["start_time"],
                        end_time=row["end_time"],
                        duration_seconds=row["duration_seconds"],
                        good_seconds=row["good_seconds"],
                        warning_seconds=row["warning_seconds"],
                        alert_seconds=row["alert_seconds"],
                        unassessed_seconds=row["unassessed_seconds"],
                        reminders_count=row["reminders_count"],
                        consistency_percentage=row["consistency_percentage"],
                    ))
        except Exception as e:
            logger.error("Error reading recent sessions: %s", e)
        return records

    def get_aggregate_stats(self) -> Dict[str, float]:
        """Compute all-time cumulative metrics."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT 
                        COUNT(id) as total_sessions,
                        SUM(duration_seconds) as total_seconds,
                        SUM(reminders_count) as total_reminders,
                        AVG(consistency_percentage) as avg_consistency
                    FROM sessions
                """)
                row = cursor.fetchone()
                if row and row["total_sessions"]:
                    return {
                        "total_sessions": row["total_sessions"] or 0,
                        "total_hours": round((row["total_seconds"] or 0.0) / 3600.0, 1),
                        "total_reminders": row["total_reminders"] or 0,
                        "avg_consistency": round(row["avg_consistency"] or 0.0, 1),
                    }
        except Exception as e:
            logger.error("Error reading aggregate stats: %s", e)

        return {
            "total_sessions": 0,
            "total_hours": 0.0,
            "total_reminders": 0,
            "avg_consistency": 0.0,
        }

    def clear_all(self) -> bool:
        """Erase all session history (Privacy action)."""
        try:
            with self._get_connection() as conn:
                conn.execute("DELETE FROM sessions")
                conn.commit()
            return True
        except Exception as e:
            logger.error("Failed to clear session history: %s", e)
            return False
