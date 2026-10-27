# PostureGuard AI

> **A native Windows desktop application for intelligent, on-device posture monitoring, calibration, and gentle ergonomic alerts using PySide6, OpenCV, and MediaPipe.**

![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011-blue)
![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11-brightgreen)
![Framework](https://img.shields.io/badge/GUI-PySide6%20(Qt6)-purple)
![Computer Vision](https://img.shields.io/badge/CV-OpenCV%20%2B%20MediaPipe-orange)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20On--Device-green)
![License](https://img.shields.io/badge/License-Apache%202.0-blue)

---

## 1. Overview & Problem Statement

When people work, code, study, or game on laptops for hours, they frequently develop harmful posture habits:
- **Forward Head Posture ("Text Neck")**: The head extends forward toward the screen, placing massive strain on cervical vertebrae.
- **Slouching / Spinal Compression**: The upper back rounds, collapsing shoulders downward.
- **Shoulder Asymmetry**: Leaning unevenly on one armrest or leaning sideways.
- **Excessive Forward Lean**: Creeping closer to the screen as eye fatigue increases.

**PostureGuard AI** solves this by actively monitoring upper-body alignment via your laptop's standard built-in webcam. When poor posture persists longer than a configurable threshold (e.g., 5 seconds), it delivers gentle visual reminders and pleasant audio chimes to help you naturally reset your sitting position.

> **Ergonomic Disclaimer**: PostureGuard AI guides ergonomic mindfulness relative to your calibrated baseline. It does not diagnose spinal curvature, claim medical-grade accuracy, or substitute for professional medical care.

---

## 2. Key Architecture & Features

### 🖥️ Native PySide6 (Qt 6) Desktop GUI
- Clean dark navy/charcoal ergonomic theme designed for extended working hours.
- Live video stream display with real-time skeletal joint overlay.
- Visual status cards for **Normal Posture**, **Possible Deviation**, **Sustained Deviation**, and **Unassessed**.
- Action controls: Start, Pause, Resume, Stop Monitoring, and Calibrate.

### 📐 Calibrated Personal Baseline
- Rather than enforcing one rigid textbook posture, the user establishes a personal neutral baseline through a 3–5 second calibration capture.
- Analyzes normalized ratios (ear-to-shoulder vector, neck-to-shoulder ratio, lateral tilt, and nose-to-shoulder vertical drop).
- Rejects noisy calibrations if lighting is dim or landmarks lack confidence.

### 🧠 Posture Engine & Hysteresis Protection
- **No Single-Frame False Positives**: Requires sustained deviation over a configurable window (e.g. 5.0 seconds) before triggering an alert.
- **Exponential Moving Average (EMA)** smoothing eliminates frame-to-frame landmark jitter.
- **Hysteresis Recovery Window**: Requires 1.2+ seconds of sustained upright posture to recover, preventing state flickering.
- **Sensitivities**: Low (relaxed), Medium (standard), High (strict).

### 🔔 Gentle Audio & Visual Alerts
- Harmonic multi-tone chime synthesized in `.wav` format.
- Cooldown quiet period (15–30s) prevents notification fatigue.
- Alerts are strictly silenced whenever monitoring is paused, stopped, or landmarks are unavailable.

### 📊 Local SQLite Session Tracking
- Tracks time spent in Good, Warning, and Alert states.
- Calculates an objective consistency percentage (good posture seconds / assessed seconds).
- Complete history records stored locally in SQLite (`~/.postureguard/history.db`).
- Privacy feature: One-click "Clear History Records".

### 🔒 100% Privacy & Local Compute
- All OpenCV frames are processed in system RAM and immediately discarded.
- No webcam imagery, video, or biometric data is ever stored, uploaded, or transmitted across a network.
- Camera hardware LED turns on ONLY when the user clicks **Start Monitoring** and turns off immediately on **Stop**.

---

## 3. Project Structure

```text
PostureGuard-AI/
├── main.py                     # Desktop application entry point
├── requirements.txt            # Python dependencies (PySide6, OpenCV, MediaPipe, NumPy)
├── pyinstaller.spec            # Windows PyInstaller bundling specification
├── build_windows_exe.bat       # 1-click Windows packaging script
├── generate_assets.py          # Synthesizes harmonic audio chime & icons
├── README.md                   # Complete documentation
├── postureguard/
│   ├── __init__.py             # Package descriptor
│   ├── main_window.py          # PySide6 desktop GUI and dashboard
│   ├── camera.py               # OpenCV VideoCapture hardware abstraction
│   ├── pose_detector.py        # MediaPipe Pose landmark extraction & skeleton overlay
│   ├── posture_engine.py       # Biomechanical geometry, EMA, and state machine
│   ├── calibration.py          # 3-5s baseline calibration collector & manager
│   ├── alerts.py               # Audio chime dispatcher & cooldown timing
│   ├── settings.py             # User preferences & JSON persistence
│   ├── session_tracker.py      # Live duration & consistency accounting
│   ├── storage.py              # SQLite historical session database
│   └── workers.py              # Non-blocking QThread camera & inference loop
├── assets/
│   ├── icons/                  # Application desktop icons
│   └── sounds/                 # Notification audio (chime.wav)
└── tests/
    ├── test_posture_engine.py  # Synthetic landmark unit tests for posture math
    ├── test_settings.py        # Settings validation & corrupted JSON recovery tests
    ├── test_storage_and_tracker.py # Session metrics and SQLite unit tests
    └── run_tests.py            # Automated test runner script
```

---

## 4. Setup & Installation (Windows 10 / 11)

### Step 1: Open PowerShell
Open Windows PowerShell or Windows Terminal in the project directory:

```powershell
cd PostureGuard-AI
```

### Step 2: Create and Activate a Virtual Environment
```powershell
# Create virtual environment with Python 3.10 or 3.11
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1
```

*(If script execution is disabled on your system, run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`)*

### Step 3: Install Required Dependencies
```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Step 4: Generate Audio Assets
Synthesize the notification chime sound file (`assets/sounds/chime.wav`):
```powershell
python generate_assets.py
```

---

## 5. Running the Application

Launch the native desktop interface:
```powershell
python main.py
```

### Recommended First-Time Workflow:
1. Ensure your laptop webcam is uncovered and lighting is adequate.
2. Click **Start Monitoring** on the dashboard. The camera preview and skeleton overlay will appear.
3. Sit comfortably in your normal, upright working position.
4. Click **Calibrate Posture** and hold steady for 3 seconds while the calibration bar reaches 100%.
5. Work normally! If you slouch, tilt, or crane your neck forward for more than 5 seconds, PostureGuard AI will display guidance and play a gentle chime.

---

## 6. Running Automated Tests

Run the complete offline test suite (12 tests) using Python's built-in `unittest`:

```powershell
python tests\run_tests.py
```

All calculations, angle geometry, hysteresis transitions, and settings validation are verified using synthetic coordinate frames without needing an active webcam.

---

## 7. Packaging into a Standalone Windows Executable (.exe)

You can package PostureGuard AI into a single-click executable that does not require Python on the target machine:

### Option A: Using the 1-Click Batch File
Double-click `build_windows_exe.bat` in Windows Explorer or run:
```cmd
.\build_windows_exe.bat
```

### Option B: Using PyInstaller Directly
```powershell
pyinstaller pyinstaller.spec --clean --noconfirm
```

The resulting standalone executable will be located at:
```text
dist\PostureGuard AI.exe
```

---

## 8. Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Could not open webcam device #0"** | Camera is in use by Zoom/Teams or camera permissions are disabled in Windows. | Close other apps using the webcam. In Windows Settings > Privacy & Security > Camera, ensure "Let desktop apps access your camera" is **On**. |
| **"State remains UNASSESSED"** | Face or shoulders are cut off from the frame, or lighting is too dark. | Center yourself in the camera view and adjust ambient room lighting. |
| **"PySide6 DLL load failed"** | Missing Microsoft Visual C++ Redistributable. | Install the [latest Microsoft Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe). |
| **Alerts trigger too frequently** | Sensitivity is set to High or alert delay is too short. | Open **Settings**, change Sensitivity to **Low** or **Medium**, and increase **Alert Delay** to 8–10 seconds. |

---

## 9. License

Distributed under the Apache 2.0 License. Open source and suitable for student research, open-source contribution, and personal ergonomic improvement.
