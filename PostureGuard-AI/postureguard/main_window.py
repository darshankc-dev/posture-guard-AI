"""
Main desktop window for PostureGuard AI built with PySide6.
Features a modern dark navy/charcoal ergonomic dashboard, live camera preview,
calibration wizard, real-time posture cards, session analytics, and user settings.
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from PySide6.QtCore import QSize, Qt, QTimer
    from PySide6.QtGui import QAction, QColor, QFont, QIcon, QImage, QPainter, QPixmap
    from PySide6.QtWidgets import (
        QApplication,
        QCheckBox,
        QComboBox,
        QDialog,
        QFormLayout,
        QFrame,
        QGridLayout,
        QGroupBox,
        QHBoxLayout,
        QHeaderView,
        QLabel,
        QLineEdit,
        QMainWindow,
        QMessageBox,
        QProgressBar,
        QPushButton,
        QScrollArea,
        QSlider,
        QSpinBox,
        QSplitter,
        QStackedWidget,
        QTableWidget,
        QTableWidgetItem,
        QTabWidget,
        QTextEdit,
        QVBoxLayout,
        QWidget,
    )
    _HAS_PYSIDE6 = True
except ImportError:
    _HAS_PYSIDE6 = False
    # Placeholder classes for non-Qt headless import checks
    class QMainWindow: pass
    class QWidget: pass

from postureguard.alerts import AlertManager
from postureguard.calibration import CalibrationManager
from postureguard.camera import CameraDevice
from postureguard.posture_engine import PostureAssessment, PostureState
from postureguard.session_tracker import SessionTracker
from postureguard.settings import AppSettings, SettingsManager
from postureguard.storage import HistoryStorage
from postureguard.workers import PostureWorker


# Modern Dark Navy & Charcoal Styling
MODERN_STYLESHEET = """
QMainWindow, QWidget {
    background-color: #0B0F19;
    color: #F3F4F6;
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    font-size: 13px;
}

QFrame.card {
    background-color: #111827;
    border: 1px solid #1F2937;
    border-radius: 12px;
}

QFrame.sidebar {
    background-color: #0F172A;
    border-right: 1px solid #1E293B;
}

QPushButton {
    background-color: #1F2937;
    color: #F9FAFB;
    border: 1px solid #374151;
    border-radius: 8px;
    padding: 8px 16px;
    font-weight: 600;
}

QPushButton:hover {
    background-color: #374151;
    border-color: #4B5563;
}

QPushButton:pressed {
    background-color: #111827;
}

QPushButton.primary {
    background-color: #2563EB;
    color: #FFFFFF;
    border: 1px solid #3B82F6;
}

QPushButton.primary:hover {
    background-color: #1D4ED8;
}

QPushButton.danger {
    background-color: #991B1B;
    color: #FFFFFF;
    border: 1px solid #DC2626;
}

QPushButton.danger:hover {
    background-color: #B91C1C;
}

QPushButton.nav-btn {
    text-align: left;
    padding: 12px 16px;
    border: none;
    border-radius: 8px;
    background-color: transparent;
    color: #9CA3AF;
    font-size: 13px;
    font-weight: 500;
}

QPushButton.nav-btn:hover {
    background-color: #1E293B;
    color: #F9FAFB;
}

QPushButton.nav-btn.active {
    background-color: #1E293B;
    color: #38BDF8;
    border-left: 3px solid #38BDF8;
    font-weight: 600;
}

QLabel {
    color: #E5E7EB;
}

QLabel.title {
    font-size: 18px;
    font-weight: 700;
    color: #FFFFFF;
}

QLabel.subtitle {
    font-size: 12px;
    color: #9CA3AF;
}

QProgressBar {
    background-color: #1F2937;
    border: 1px solid #374151;
    border-radius: 6px;
    text-align: center;
    color: #FFFFFF;
    font-size: 11px;
}

QProgressBar::chunk {
    background-color: #10B981;
    border-radius: 5px;
}

QSlider::groove:horizontal {
    height: 6px;
    background: #1F2937;
    border-radius: 3px;
}

QSlider::sub-page:horizontal {
    background: #3B82F6;
    border-radius: 3px;
}

QSlider::handle:horizontal {
    background: #60A5FA;
    border: 1px solid #2563EB;
    width: 16px;
    margin-top: -5px;
    margin-bottom: -5px;
    border-radius: 8px;
}

QComboBox, QSpinBox {
    background-color: #1F2937;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 6px 12px;
    color: #F9FAFB;
}

QTableWidget {
    background-color: #111827;
    gridline-color: #1F2937;
    border: 1px solid #1F2937;
    border-radius: 8px;
}

QHeaderView::section {
    background-color: #1F2937;
    color: #9CA3AF;
    padding: 6px;
    border: none;
    font-weight: 600;
}
"""


class MainWindow(QMainWindow if _HAS_PYSIDE6 else object):
    """
    Main application window and controller for PostureGuard AI.
    """

    def __init__(
        self,
        settings_manager: SettingsManager,
        calibration_manager: CalibrationManager,
        storage: HistoryStorage,
    ) -> None:
        if not _HAS_PYSIDE6:
            raise RuntimeError("PySide6 is required to run the PostureGuard AI desktop window.")
        super().__init__()

        self.settings_manager = settings_manager
        self.calibration_manager = calibration_manager
        self.storage = storage

        # Sound assets path
        sound_path = Path(__file__).parent.parent / "assets" / "sounds" / "chime.wav"
        self.alert_manager = AlertManager(
            sound_enabled=self.settings_manager.current.sound_enabled,
            sound_volume=self.settings_manager.current.sound_volume,
            cooldown_seconds=self.settings_manager.current.alert_cooldown_seconds,
            sound_file_path=sound_path if sound_path.exists() else None,
        )

        self.session_tracker = SessionTracker(
            storage=self.storage if self.settings_manager.current.save_session_history else None
        )

        # Worker thread
        self.worker: Optional[PostureWorker] = None

        # Setup GUI
        self.setWindowTitle("PostureGuard AI - Desktop Posture Monitor")
        self.resize(1100, 720)
        self.setMinimumSize(900, 600)
        self.setStyleSheet(MODERN_STYLESHEET)

        # UI update timer (updates session clock every second)
        self.clock_timer = QTimer(self)
        self.clock_timer.timeout.connect(self._update_session_clock)
        self.clock_timer.start(1000)

        self._build_ui()
        self._refresh_calibration_badge()

    def _build_ui(self) -> None:
        """Construct the sidebar and multi-page stacked view."""
        root_widget = QWidget()
        root_layout = QHBoxLayout(root_widget)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(0)
        self.setCentralWidget(root_widget)

        # 1. Sidebar Navigation
        sidebar = self._build_sidebar()
        root_layout.addWidget(sidebar)

        # 2. Main Content Area (QStackedWidget)
        self.stack = QStackedWidget()
        
        # Pages
        self.page_dashboard = self._build_dashboard_page()
        self.page_history = self._build_history_page()
        self.page_settings = self._build_settings_page()
        self.page_about = self._build_about_page()

        self.stack.addWidget(self.page_dashboard)
        self.stack.addWidget(self.page_history)
        self.stack.addWidget(self.page_settings)
        self.stack.addWidget(self.page_about)

        root_layout.addWidget(self.stack, 1)

    def _build_sidebar(self) -> QWidget:
        """Build modern side navigation panel."""
        sidebar = QFrame()
        sidebar.setProperty("class", "sidebar")
        sidebar.setFixedWidth(230)
        layout = QVBoxLayout(sidebar)
        layout.setContentsMargins(16, 24, 16, 24)
        layout.setSpacing(8)

        # Logo / Brand
        brand_layout = QVBoxLayout()
        logo_title = QLabel("PostureGuard AI")
        logo_title.setProperty("class", "title")
        logo_sub = QLabel("Ergonomic Vision Assistant")
        logo_sub.setProperty("class", "subtitle")
        brand_layout.addWidget(logo_title)
        brand_layout.addWidget(logo_sub)
        layout.addLayout(brand_layout)
        layout.addSpacing(24)

        # Nav Buttons
        self.nav_buttons = []
        self.btn_nav_dash = QPushButton("  Dashboard & Live Camera")
        self.btn_nav_dash.setProperty("class", "nav-btn active")
        self.btn_nav_dash.clicked.connect(lambda: self._switch_page(0))
        layout.addWidget(self.btn_nav_dash)
        self.nav_buttons.append(self.btn_nav_dash)

        self.btn_nav_hist = QPushButton("  Session History")
        self.btn_nav_hist.setProperty("class", "nav-btn")
        self.btn_nav_hist.clicked.connect(lambda: self._switch_page(1))
        layout.addWidget(self.btn_nav_hist)
        self.nav_buttons.append(self.btn_nav_hist)

        self.btn_nav_settings = QPushButton("  Settings")
        self.btn_nav_settings.setProperty("class", "nav-btn")
        self.btn_nav_settings.clicked.connect(lambda: self._switch_page(2))
        layout.addWidget(self.btn_nav_settings)
        self.nav_buttons.append(self.btn_nav_settings)

        self.btn_nav_about = QPushButton("  Privacy & About")
        self.btn_nav_about.setProperty("class", "nav-btn")
        self.btn_nav_about.clicked.connect(lambda: self._switch_page(3))
        layout.addWidget(self.btn_nav_about)
        self.nav_buttons.append(self.btn_nav_about)

        layout.addStretch()

        # Calibration status badge in sidebar
        self.lbl_calib_status = QLabel("Calibration: Missing")
        self.lbl_calib_status.setStyleSheet("color: #F59E0B; font-size: 11px; padding: 4px;")
        layout.addWidget(self.lbl_calib_status)

        # Version tag
        lbl_version = QLabel("v1.0.0 • Local Vision")
        lbl_version.setStyleSheet("color: #6B7280; font-size: 11px;")
        layout.addWidget(lbl_version)

        return sidebar

    def _switch_page(self, index: int) -> None:
        """Switch stacked page and update active navigation button style."""
        self.stack.setCurrentIndex(index)
        for i, btn in enumerate(self.nav_buttons):
            if i == index:
                btn.setProperty("class", "nav-btn active")
            else:
                btn.setProperty("class", "nav-btn")
            btn.style().unpolish(btn)
            btn.style().polish(btn)

        if index == 1:
            self._reload_history_table()

    def _build_dashboard_page(self) -> QWidget:
        """Build main monitoring dashboard with video stream, controls, and status cards."""
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(16)

        # Top Bar: Header + Camera Activity Pill
        header_row = QHBoxLayout()
        header_text = QVBoxLayout()
        lbl_h = QLabel("Live Posture Monitoring")
        lbl_h.setProperty("class", "title")
        lbl_s = QLabel("Monitors head, neck, and shoulder alignment locally using your laptop webcam.")
        lbl_s.setProperty("class", "subtitle")
        header_text.addWidget(lbl_h)
        header_text.addWidget(lbl_s)
        header_row.addLayout(header_text)
        header_row.addStretch()

        # Camera Indicator Pill
        self.pill_cam = QLabel(" ● Camera Inactive ")
        self.pill_cam.setStyleSheet(
            "background-color: #1F2937; color: #9CA3AF; "
            "border-radius: 12px; padding: 6px 14px; font-weight: 600; font-size: 12px;"
        )
        header_row.addWidget(self.pill_cam)
        layout.addLayout(header_row)

        # Main Split Content: Left = Video, Right = Real-time Feedback & Metrics
        content_row = QHBoxLayout()
        content_row.setSpacing(16)

        # LEFT: Video Frame & Calibration Bar
        video_col = QVBoxLayout()
        video_card = QFrame()
        video_card.setProperty("class", "card")
        video_card_layout = QVBoxLayout(video_card)
        video_card_layout.setContentsMargins(12, 12, 12, 12)

        self.video_display = QLabel("Camera preview will appear here when monitoring starts.")
        self.video_display.setAlignment(Qt.AlignCenter)
        self.video_display.setMinimumSize(480, 360)
        self.video_display.setStyleSheet("background-color: #030712; border-radius: 8px; color: #6B7280;")
        video_card_layout.addWidget(self.video_display, 1)

        # Calibration progress bar (shown during calibration)
        self.calib_container = QWidget()
        calib_layout = QVBoxLayout(self.calib_container)
        calib_layout.setContentsMargins(0, 6, 0, 0)
        self.lbl_calib_guide = QLabel("Hold a comfortable, neutral posture. Collecting reference baseline...")
        self.lbl_calib_guide.setStyleSheet("color: #38BDF8; font-size: 12px;")
        self.prog_calib = QProgressBar()
        self.prog_calib.setRange(0, 100)
        self.prog_calib.setValue(0)
        calib_layout.addWidget(self.lbl_calib_guide)
        calib_layout.addWidget(self.prog_calib)
        self.calib_container.setVisible(False)
        video_card_layout.addWidget(self.calib_container)

        video_col.addWidget(video_card, 1)

        # Action Buttons Row
        controls_row = QHBoxLayout()
        self.btn_start = QPushButton("Start Monitoring")
        self.btn_start.setProperty("class", "primary")
        self.btn_start.clicked.connect(self._handle_start_stop)
        controls_row.addWidget(self.btn_start)

        self.btn_pause = QPushButton("Pause")
        self.btn_pause.setEnabled(False)
        self.btn_pause.clicked.connect(self._handle_pause_resume)
        controls_row.addWidget(self.btn_pause)

        self.btn_calibrate = QPushButton("Calibrate Posture")
        self.btn_calibrate.clicked.connect(self._handle_calibrate)
        controls_row.addWidget(self.btn_calibrate)

        video_col.addLayout(controls_row)
        content_row.addLayout(video_col, 3)

        # RIGHT: Posture Status Card & Session Summary
        stats_col = QVBoxLayout()
        stats_col.setSpacing(14)

        # Status Card
        card_status = QFrame()
        card_status.setProperty("class", "card")
        layout_status = QVBoxLayout(card_status)
        layout_status.setContentsMargins(18, 18, 18, 18)
        layout_status.setSpacing(10)

        lbl_status_head = QLabel("POSTURE ASSESSMENT")
        lbl_status_head.setStyleSheet("color: #9CA3AF; font-size: 11px; font-weight: 700; letter-spacing: 1px;")
        layout_status.addWidget(lbl_status_head)

        self.badge_posture = QLabel("UNASSESSED")
        self.badge_posture.setAlignment(Qt.AlignCenter)
        self.badge_posture.setStyleSheet(
            "background-color: #1F2937; color: #9CA3AF; "
            "border-radius: 8px; padding: 10px; font-size: 16px; font-weight: 700;"
        )
        layout_status.addWidget(self.badge_posture)

        self.lbl_guidance = QLabel("Start monitoring to assess your current sitting posture.")
        self.lbl_guidance.setWordWrap(True)
        self.lbl_guidance.setStyleSheet("color: #D1D5DB; font-size: 13px; line-height: 1.4;")
        layout_status.addWidget(self.lbl_guidance)

        # Metrics Breakdown
        grid_metrics = QGridLayout()
        grid_metrics.setSpacing(8)

        lbl_m1 = QLabel("Neck Inclination:")
        lbl_m1.setStyleSheet("color: #9CA3AF; font-size: 11px;")
        self.val_m1 = QLabel("--")
        grid_metrics.addWidget(lbl_m1, 0, 0)
        grid_metrics.addWidget(self.val_m1, 0, 1)

        lbl_m2 = QLabel("Shoulder Tilt:")
        lbl_m2.setStyleSheet("color: #9CA3AF; font-size: 11px;")
        self.val_m2 = QLabel("--")
        grid_metrics.addWidget(lbl_m2, 1, 0)
        grid_metrics.addWidget(self.val_m2, 1, 1)

        lbl_m3 = QLabel("Deviation Timer:")
        lbl_m3.setStyleSheet("color: #9CA3AF; font-size: 11px;")
        self.val_m3 = QLabel("0.0 s")
        grid_metrics.addWidget(lbl_m3, 2, 0)
        grid_metrics.addWidget(self.val_m3, 2, 1)

        layout_status.addLayout(grid_metrics)
        stats_col.addWidget(card_status)

        # Session Metrics Card
        card_session = QFrame()
        card_session.setProperty("class", "card")
        layout_session = QVBoxLayout(card_session)
        layout_session.setContentsMargins(18, 18, 18, 18)
        layout_session.setSpacing(12)

        lbl_sess_head = QLabel("CURRENT SESSION")
        lbl_sess_head.setStyleSheet("color: #9CA3AF; font-size: 11px; font-weight: 700; letter-spacing: 1px;")
        layout_session.addWidget(lbl_sess_head)

        row_timer = QHBoxLayout()
        lbl_t_tag = QLabel("Monitored Time:")
        self.lbl_session_time = QLabel("00:00:00")
        self.lbl_session_time.setStyleSheet("font-size: 18px; font-weight: 700; color: #38BDF8;")
        row_timer.addWidget(lbl_t_tag)
        row_timer.addStretch()
        row_timer.addWidget(self.lbl_session_time)
        layout_session.addLayout(row_timer)

        row_reminders = QHBoxLayout()
        lbl_r_tag = QLabel("Posture Reminders:")
        self.lbl_reminders_count = QLabel("0")
        self.lbl_reminders_count.setStyleSheet("font-size: 16px; font-weight: 700; color: #F59E0B;")
        row_reminders.addWidget(lbl_r_tag)
        row_reminders.addStretch()
        row_reminders.addWidget(self.lbl_reminders_count)
        layout_session.addLayout(row_reminders)

        row_cons = QHBoxLayout()
        lbl_c_tag = QLabel("Good Posture Time:")
        self.lbl_consistency = QLabel("100%")
        self.lbl_consistency.setStyleSheet("font-size: 16px; font-weight: 700; color: #10B981;")
        row_cons.addWidget(lbl_c_tag)
        row_cons.addStretch()
        row_cons.addWidget(self.lbl_consistency)
        layout_session.addLayout(row_cons)

        self.prog_consistency = QProgressBar()
        self.prog_consistency.setRange(0, 100)
        self.prog_consistency.setValue(100)
        layout_session.addWidget(self.prog_consistency)

        stats_col.addWidget(card_session)
        stats_col.addStretch()

        content_row.addLayout(stats_col, 2)
        layout.addLayout(content_row)

        return page

    def _build_history_page(self) -> QWidget:
        """Build historical session table and all-time statistics view."""
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(16)

        lbl_h = QLabel("Session History & Trends")
        lbl_h.setProperty("class", "title")
        lbl_s = QLabel("Local records of past monitoring sessions stored in SQLite database.")
        lbl_s.setProperty("class", "subtitle")
        layout.addWidget(lbl_h)
        layout.addWidget(lbl_s)

        # Aggregate metric cards
        summary_row = QHBoxLayout()
        summary_row.setSpacing(12)

        self.card_total_hours = self._create_metric_pill("TOTAL MONITORED", "0.0 hrs", "#38BDF8")
        self.card_total_reminders = self._create_metric_pill("TOTAL REMINDERS", "0", "#F59E0B")
        self.card_avg_consistency = self._create_metric_pill("AVG CONSISTENCY", "--%", "#10B981")

        summary_row.addWidget(self.card_total_hours)
        summary_row.addWidget(self.card_total_reminders)
        summary_row.addWidget(self.card_avg_consistency)
        layout.addLayout(summary_row)

        # Table of sessions
        self.history_table = QTableWidget()
        self.history_table.setColumnCount(6)
        self.history_table.setHorizontalHeaderLabels([
            "Date & Time", "Duration", "Good Posture", "Warning Time", "Reminders", "Consistency"
        ])
        self.history_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.history_table.verticalHeader().setVisible(False)
        layout.addWidget(self.history_table, 1)

        # Bottom clear history button
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        btn_clear = QPushButton("Clear History Records")
        btn_clear.setProperty("class", "danger")
        btn_clear.clicked.connect(self._handle_clear_history)
        btn_row.addWidget(btn_clear)
        layout.addLayout(btn_row)

        return page

    def _create_metric_pill(self, label: str, value: str, color: str) -> QFrame:
        frame = QFrame()
        frame.setProperty("class", "card")
        flayout = QVBoxLayout(frame)
        flayout.setContentsMargins(16, 12, 16, 12)
        flayout.setSpacing(4)
        lbl_tag = QLabel(label)
        lbl_tag.setStyleSheet("color: #9CA3AF; font-size: 11px; font-weight: 600;")
        lbl_val = QLabel(value)
        lbl_val.setStyleSheet(f"font-size: 20px; font-weight: 700; color: {color};")
        flayout.addWidget(lbl_tag)
        flayout.addWidget(lbl_val)
        return frame

    def _build_settings_page(self) -> QWidget:
        """Build user preferences and configuration panel."""
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(16)

        lbl_h = QLabel("Settings & Preferences")
        lbl_h.setProperty("class", "title")
        lbl_s = QLabel("Configure camera input, alert timings, sensitivity, and sound.")
        lbl_s.setProperty("class", "subtitle")
        layout.addWidget(lbl_h)
        layout.addWidget(lbl_s)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("background: transparent; border: none;")

        scroll_content = QWidget()
        form_layout = QVBoxLayout(scroll_content)
        form_layout.setSpacing(16)

        # 1. Camera Settings Card
        group_cam = QGroupBox("Camera & Display")
        group_cam.setStyleSheet("QGroupBox { font-weight: 700; color: #F3F4F6; margin-top: 10px; }")
        cam_layout = QFormLayout(group_cam)
        cam_layout.setContentsMargins(16, 16, 16, 16)
        cam_layout.setSpacing(12)

        self.combo_camera = QComboBox()
        available_cams = CameraDevice.list_available_cameras()
        for idx in available_cams:
            self.combo_camera.addItem(f"Camera Device #{idx}", idx)
        cam_layout.addRow("Select Webcam:", self.combo_camera)

        self.chk_skeleton = QCheckBox("Draw real-time pose skeleton over video preview")
        self.chk_skeleton.setChecked(self.settings_manager.current.show_skeleton)
        cam_layout.addRow("Skeleton Overlay:", self.chk_skeleton)

        form_layout.addWidget(group_cam)

        # 2. Alert & Sound Card
        group_alert = QGroupBox("Alerts & Feedback")
        group_alert.setStyleSheet("QGroupBox { font-weight: 700; color: #F3F4F6; margin-top: 10px; }")
        alert_layout = QFormLayout(group_alert)
        alert_layout.setContentsMargins(16, 16, 16, 16)
        alert_layout.setSpacing(12)

        self.chk_sound = QCheckBox("Play gentle audio reminder when bad posture persists")
        self.chk_sound.setChecked(self.settings_manager.current.sound_enabled)
        alert_layout.addRow("Audio Reminders:", self.chk_sound)

        self.slider_volume = QSlider(Qt.Horizontal)
        self.slider_volume.setRange(0, 100)
        self.slider_volume.setValue(self.settings_manager.current.sound_volume)
        alert_layout.addRow("Alert Volume:", self.slider_volume)

        self.spin_delay = QSpinBox()
        self.spin_delay.setRange(2, 30)
        self.spin_delay.setValue(int(self.settings_manager.current.alert_delay_seconds))
        self.spin_delay.setSuffix(" seconds")
        alert_layout.addRow("Sustained Alert Delay:", self.spin_delay)

        self.spin_cooldown = QSpinBox()
        self.spin_cooldown.setRange(5, 120)
        self.spin_cooldown.setValue(int(self.settings_manager.current.alert_cooldown_seconds))
        self.spin_cooldown.setSuffix(" seconds")
        alert_layout.addRow("Alert Cooldown Quiet Period:", self.spin_cooldown)

        form_layout.addWidget(group_alert)

        # 3. Detection Sensitivity Card
        group_sens = QGroupBox("Posture Sensitivity")
        group_sens.setStyleSheet("QGroupBox { font-weight: 700; color: #F3F4F6; margin-top: 10px; }")
        sens_layout = QFormLayout(group_sens)
        sens_layout.setContentsMargins(16, 16, 16, 16)
        sens_layout.setSpacing(12)

        self.combo_sensitivity = QComboBox()
        self.combo_sensitivity.addItem("Low (Relaxed tolerance, fewer notifications)", "low")
        self.combo_sensitivity.addItem("Medium (Balanced daily desk work)", "medium")
        self.combo_sensitivity.addItem("High (Strict ergonomic alignment)", "high")
        idx_sens = ["low", "medium", "high"].index(self.settings_manager.current.sensitivity)
        self.combo_sensitivity.setCurrentIndex(idx_sens)
        sens_layout.addRow("Sensitivity Level:", self.combo_sensitivity)

        form_layout.addWidget(group_sens)

        # Save Button
        btn_save = QPushButton("Save Settings")
        btn_save.setProperty("class", "primary")
        btn_save.clicked.connect(self._handle_save_settings)
        form_layout.addWidget(btn_save)

        scroll.setWidget(scroll_content)
        layout.addWidget(scroll)

        return page

    def _build_about_page(self) -> QWidget:
        """Build Privacy Guarantee and About panel."""
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(16)

        lbl_h = QLabel("Privacy Guarantee & Architecture")
        lbl_h.setProperty("class", "title")
        lbl_s = QLabel("PostureGuard AI was built with strict on-device privacy as a foundational principle.")
        lbl_s.setProperty("class", "subtitle")
        layout.addWidget(lbl_h)
        layout.addWidget(lbl_s)

        card_privacy = QFrame()
        card_privacy.setProperty("class", "card")
        p_layout = QVBoxLayout(card_privacy)
        p_layout.setContentsMargins(20, 20, 20, 20)
        p_layout.setSpacing(12)

        txt = (
            "🔒 <b>100% Local Processing:</b> All video frames from your webcam are processed directly in your "
            "laptop's RAM using OpenCV and MediaPipe. No images, video clips, or biometric data are ever uploaded, "
            "stored, or transmitted to any cloud server.<br><br>"
            "🛡️ <b>No Background Snooping:</b> The camera is only accessed when you explicitly click 'Start Monitoring'. "
            "The camera hardware LED remains strictly off whenever monitoring is paused or stopped.<br><br>"
            "⚖️ <b>Ergonomic Guidance, Not Medical Advice:</b> PostureGuard AI establishes a personal reference position "
            "relative to your calibrated baseline. It does not diagnose spinal disorders or claim medical validation."
        )
        lbl_txt = QLabel(txt)
        lbl_txt.setWordWrap(True)
        lbl_txt.setStyleSheet("line-height: 1.6; color: #D1D5DB; font-size: 13px;")
        p_layout.addWidget(lbl_txt)
        layout.addWidget(card_privacy)
        layout.addStretch()

        return page

    # ================= UI Controller Actions =================

    def _handle_start_stop(self) -> None:
        """Start or stop active webcam posture monitoring."""
        if self.worker is None or not self.worker.isRunning():
            # Start monitoring
            self.worker = PostureWorker(
                settings=self.settings_manager.current,
                calibration_manager=self.calibration_manager,
                session_tracker=self.session_tracker,
                alert_manager=self.alert_manager,
            )

            # Connect signals
            self.worker.frame_ready.connect(self._on_frame_ready)
            self.worker.assessment_ready.connect(self._on_assessment_ready)
            self.worker.calibration_progress.connect(self._on_calibration_progress)
            self.worker.calibration_finished.connect(self._on_calibration_finished)
            self.worker.camera_error.connect(self._on_camera_error)

            self.worker.start_monitoring()

            self.btn_start.setText("Stop Monitoring")
            self.btn_start.setProperty("class", "danger")
            self.btn_start.style().unpolish(self.btn_start)
            self.btn_start.style().polish(self.btn_start)

            self.btn_pause.setEnabled(True)
            self.btn_pause.setText("Pause")
            self.pill_cam.setText(" ● Camera Active ")
            self.pill_cam.setStyleSheet(
                "background-color: #064E3B; color: #34D399; "
                "border-radius: 12px; padding: 6px 14px; font-weight: 600; font-size: 12px;"
            )
        else:
            # Stop monitoring
            self.worker.stop_monitoring()
            self.worker = None

            self.btn_start.setText("Start Monitoring")
            self.btn_start.setProperty("class", "primary")
            self.btn_start.style().unpolish(self.btn_start)
            self.btn_start.style().polish(self.btn_start)

            self.btn_pause.setEnabled(False)
            self.pill_cam.setText(" ● Camera Inactive ")
            self.pill_cam.setStyleSheet(
                "background-color: #1F2937; color: #9CA3AF; "
                "border-radius: 12px; padding: 6px 14px; font-weight: 600; font-size: 12px;"
            )
            self.video_display.setText("Monitoring stopped. Camera hardware released.")
            self._reset_dashboard_cards()

    def _handle_pause_resume(self) -> None:
        """Pause or resume active monitoring."""
        if not self.worker:
            return
        if self.worker._paused:
            self.worker.resume_monitoring()
            self.btn_pause.setText("Pause")
            self.pill_cam.setText(" ● Camera Active ")
        else:
            self.worker.pause_monitoring()
            self.btn_pause.setText("Resume")
            self.pill_cam.setText(" ⏸ Paused ")
            self.pill_cam.setStyleSheet(
                "background-color: #78350F; color: #FBBF24; "
                "border-radius: 12px; padding: 6px 14px; font-weight: 600; font-size: 12px;"
            )

    def _handle_calibrate(self) -> None:
        """Initiate calibration sequence."""
        if self.worker is None or not self.worker.isRunning():
            # Prompt user to start monitoring first
            QMessageBox.information(
                self,
                "Start Monitoring First",
                "Please click 'Start Monitoring' so the webcam is active before calibrating your posture."
            )
            return

        self.calib_container.setVisible(True)
        self.prog_calib.setValue(0)
        self.worker.start_calibration()

    def _on_calibration_progress(self, frac: float, collected: int, target: int) -> None:
        val = int(frac * 100)
        self.prog_calib.setValue(val)
        self.lbl_calib_guide.setText(
            f"Hold neutral sitting position... ({collected}/{target} frames captured)"
        )

    def _on_calibration_finished(self, success: bool, msg: str) -> None:
        self.calib_container.setVisible(False)
        self._refresh_calibration_badge()
        if success:
            QMessageBox.information(self, "Calibration Complete", msg)
        else:
            QMessageBox.warning(self, "Calibration Incomplete", msg)

    def _refresh_calibration_badge(self) -> None:
        if self.calibration_manager.has_valid_calibration():
            self.lbl_calib_status.setText("Calibration: Active ✓")
            self.lbl_calib_status.setStyleSheet("color: #10B981; font-size: 11px; padding: 4px;")
        else:
            self.lbl_calib_status.setText("Calibration: Needed ⚠️")
            self.lbl_calib_status.setStyleSheet("color: #F59E0B; font-size: 11px; padding: 4px;")

    def _on_frame_ready(self, q_img: QImage) -> None:
        """Render incoming QImage into video preview QLabel maintaining aspect ratio."""
        if q_img is None or q_img.isNull():
            return
        pix = QPixmap.fromImage(q_img)
        scaled = pix.scaled(self.video_display.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation)
        self.video_display.setPixmap(scaled)

    def _on_assessment_ready(self, assessment: PostureAssessment) -> None:
        """Update posture card, messages, and metrics."""
        state = assessment.state

        if state == PostureState.GOOD:
            self.badge_posture.setText("NORMAL POSTURE")
            self.badge_posture.setStyleSheet(
                "background-color: #064E3B; color: #34D399; "
                "border-radius: 8px; padding: 10px; font-size: 16px; font-weight: 700;"
            )
        elif state == PostureState.WARNING:
            self.badge_posture.setText("POSSIBLE DEVIATION")
            self.badge_posture.setStyleSheet(
                "background-color: #78350F; color: #FBBF24; "
                "border-radius: 8px; padding: 10px; font-size: 16px; font-weight: 700;"
            )
        elif state == PostureState.ALERT:
            self.badge_posture.setText("SUSTAINED DEVIATION")
            self.badge_posture.setStyleSheet(
                "background-color: #7F1D1D; color: #F87171; "
                "border-radius: 8px; padding: 10px; font-size: 16px; font-weight: 700;"
            )
        else:
            self.badge_posture.setText("UNASSESSED")
            self.badge_posture.setStyleSheet(
                "background-color: #1F2937; color: #9CA3AF; "
                "border-radius: 8px; padding: 10px; font-size: 16px; font-weight: 700;"
            )

        self.lbl_guidance.setText(assessment.message)

        # Update metric labels
        m = assessment.metrics
        self.val_m1.setText(f"{m.get('neck_ratio', '--')}")
        self.val_m2.setText(f"{m.get('shoulder_tilt_deg', '--')}°")
        self.val_m3.setText(f"{assessment.time_in_deviation:.1f} s")

    def _on_camera_error(self, err_msg: str) -> None:
        """Display error when webcam cannot be accessed."""
        QMessageBox.critical(self, "Camera Error", err_msg)
        self._handle_start_stop()

    def _update_session_clock(self) -> None:
        """Update live duration and session counters every second."""
        if not self.session_tracker.is_active:
            return
        snap = self.session_tracker.get_snapshot()

        # Format elapsed seconds to HH:MM:SS
        secs = int(snap.elapsed_seconds)
        hours = secs // 3600
        mins = (secs % 3600) // 60
        s = secs % 60
        self.lbl_session_time.setText(f"{hours:02d}:{mins:02d}:{s:02d}")

        self.lbl_reminders_count.setText(str(snap.reminders_count))
        self.lbl_consistency.setText(f"{snap.consistency_percentage:.0f}%")
        self.prog_consistency.setValue(int(snap.consistency_percentage))

    def _reset_dashboard_cards(self) -> None:
        self.badge_posture.setText("IDLE")
        self.badge_posture.setStyleSheet(
            "background-color: #1F2937; color: #9CA3AF; "
            "border-radius: 8px; padding: 10px; font-size: 16px; font-weight: 700;"
        )
        self.lbl_guidance.setText("Monitoring stopped. Click Start Monitoring to begin.")

    def _handle_save_settings(self) -> None:
        """Persist settings to JSON and notify worker."""
        cam_idx = self.combo_camera.currentData()
        show_skel = self.chk_skeleton.isChecked()
        snd_on = self.chk_sound.isChecked()
        vol = self.slider_volume.value()
        delay = float(self.spin_delay.value())
        cd = float(self.spin_cooldown.value())
        sens = self.combo_sensitivity.currentData()

        self.settings_manager.update(
            camera_index=cam_idx,
            show_skeleton=show_skel,
            sound_enabled=snd_on,
            sound_volume=vol,
            alert_delay_seconds=delay,
            alert_cooldown_seconds=cd,
            sensitivity=sens,
        )

        self.alert_manager.sound_enabled = snd_on
        self.alert_manager.sound_volume = vol
        self.alert_manager.cooldown_seconds = cd

        QMessageBox.information(self, "Settings Saved", "Preferences updated and saved.")

    def _reload_history_table(self) -> None:
        """Load SQLite records into table widget."""
        records = self.storage.get_recent_sessions(limit=50)
        stats = self.storage.get_aggregate_stats()

        # Update metric pills
        self.card_total_hours.findChildren(QLabel)[1].setText(f"{stats['total_hours']} hrs")
        self.card_total_reminders.findChildren(QLabel)[1].setText(f"{stats['total_reminders']}")
        self.card_avg_consistency.findChildren(QLabel)[1].setText(f"{stats['avg_consistency']}%")

        self.history_table.setRowCount(len(records))
        for row, rec in enumerate(records):
            mins = int(rec.duration_seconds // 60)
            secs = int(rec.duration_seconds % 60)
            dur_str = f"{mins}m {secs}s"

            self.history_table.setItem(row, 0, QTableWidgetItem(rec.start_time))
            self.history_table.setItem(row, 1, QTableWidgetItem(dur_str))
            self.history_table.setItem(row, 2, QTableWidgetItem(f"{rec.good_seconds:.0f}s"))
            self.history_table.setItem(row, 3, QTableWidgetItem(f"{rec.warning_seconds:.0f}s"))
            self.history_table.setItem(row, 4, QTableWidgetItem(str(rec.reminders_count)))
            self.history_table.setItem(row, 5, QTableWidgetItem(f"{rec.consistency_percentage:.1f}%"))

    def _handle_clear_history(self) -> None:
        """Confirm and clear SQLite history."""
        reply = QMessageBox.question(
            self,
            "Clear History Records",
            "Are you sure you want to delete all saved session statistics? This cannot be undone.",
            QMessageBox.Yes | QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            self.storage.clear_all()
            self._reload_history_table()

    def closeEvent(self, event) -> None:
        """Clean shutdown handler when user closes the window."""
        logger.info("Application closing. Cleaning up resources...")
        if self.worker is not None and self.worker.isRunning():
            self.worker.stop_monitoring()
        event.accept()
