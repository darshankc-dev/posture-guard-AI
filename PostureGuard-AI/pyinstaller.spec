# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller specification file for PostureGuard AI Windows Desktop Executable.
Build command: pyinstaller pyinstaller.spec --clean
"""

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None
project_root = Path.cwd().resolve()

# Collect MediaPipe data files (pose landmark models and graph configs)
mediapipe_datas = collect_data_files('mediapipe')

# Project assets
extra_datas = [
    ('assets/sounds/chime.wav', 'assets/sounds'),
] + mediapipe_datas

# Hidden imports that dynamic loaders might miss
hidden_imports = [
    'PySide6.QtCore',
    'PySide6.QtGui',
    'PySide6.QtWidgets',
    'cv2',
    'mediapipe',
    'numpy',
    'sqlite3',
    'postureguard',
    'postureguard.camera',
    'postureguard.pose_detector',
    'postureguard.posture_engine',
    'postureguard.calibration',
    'postureguard.alerts',
    'postureguard.settings',
    'postureguard.session_tracker',
    'postureguard.storage',
    'postureguard.workers',
    'postureguard.main_window',
] + collect_submodules('mediapipe')

a = Analysis(
    ['main.py'],
    pathex=[str(project_root)],
    binaries=[],
    datas=extra_datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'scipy', 'torch'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='PostureGuard AI',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Windowed GUI application (no black console box)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
