"""
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
            "PySide6 is not installed.\n"
            "Please install the required dependencies with:\n"
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
