# 🌿 PostureGuard AI

> **Sit Better. Do More.**  
> Real-time, 100% on-device webcam face & upper-body posture monitoring powered by MediaPipe Vision.

[![Live Demo](https://img.shields.io/badge/Live_Demo-PostureGuard_AI-5B4FE9?style=for-the-badge)](https://ais-pre-d6xhkfmmpnvvyqfs6sygai-183813793738.asia-southeast1.run.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Vision_Tasks-0097A7?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![Privacy](https://img.shields.io/badge/Privacy-100%25_On--Device-10B981?style=for-the-badge)](#privacy--security)

---

## 🔗 Live Deployed Application

- **Live Deployed App:** https://postureguard-ai-desktop-posture-monitor.ai.studio

---

## ✨ Overview

When working, studying, or coding on a laptop for extended periods, it is easy to unconsciously lean forward, tilt the head downward, or round the shoulders. **PostureGuard AI** uses your built-in webcam and on-device computer vision to track facial and upper-body landmarks in real time, evaluate posture relative to your personalized sitting baseline, and deliver gentle visual and audio reminders when sustained posture deviations occur.

> **Disclaimer:** PostureGuard AI is a wellness and ergonomic awareness tool. It does not provide medical diagnoses or physical therapy advice.

---

## 🚀 Key Features

- **Real-Time Face & Pose Detection:** Runs MediaPipe `FaceDetector` (BlazeFace Short-Range) and `PoseLandmarker` directly in the browser via WebAssembly and WebGL.
- **Smart Physical Webcam Selection:** Automatically detects and skips disconnected virtual or phone-link cameras (such as Windows Virtual Camera / Phone Link / OBS) to open your laptop's physical built-in or USB webcam.
- **Live Skeleton & Face Bracket Overlay:** Draws a toggleable, color-coded facial bounding bracket and upper-body shoulder skeleton over your live mirrored video feed (`Good`, `Warning`, `Alert`).
- **One-Click Posture Calibration:** Auto-calibrates after stable initial frames or lets you manually calibrate your neutral sitting position at any time with **Calibrate Posture**.
- **Live Ergonomic Indicators:** Tracks **Head Position**, **Shoulder Alignment**, and **Back Posture** in real time with exponential moving average (EMA) smoothing and hysteresis filtering to prevent flickering.
- **Gentle Audio & Visual Reminders:** Synthesizes a soft harmonic D5/A5 chime using the Web Audio API with configurable cooldown intervals when poor posture persists.
- **Snapshot Capture & Activity Timeline:** Capture annotated posture snapshots manually or automatically on posture alerts, and review your **Session Overview** (`Session Duration`, `Reminders`, `Good Posture Time`) and **Recent Activity** log.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend UI** | React 19, TypeScript, Tailwind CSS 4, Lucide Icons |
| **Computer Vision** | `@mediapipe/tasks-vision` (`FaceDetector` + `PoseLandmarker`) |
| **Posture Geometry Engine** | Custom EMA-smoothed geometric evaluator (`src/utils/postureEngine.ts`) |
| **Audio Synthesis** | Web Audio API (Harmonic D5/A5 sine-wave chime) |
| **Build & Tooling** | Vite, Node Test Runner (`tsx --test`) |

---

## 📂 Project Structure

```text
PostureGuard-AI/
├── public/
│   ├── models/
│   │   ├── blaze_face_short_range.tflite   # MediaPipe BlazeFace detector model
│   │   └── pose_landmarker_lite.task       # MediaPipe Pose Landmarker model
│   └── wasm/                               # Local MediaPipe Vision WASM runtime
├── src/
│   ├── components/
│   │   └── LiveCameraMonitor.tsx           # Dashboard, live camera pipeline, overlay & settings
│   ├── utils/
│   │   ├── postureEngine.ts                # Geometric posture evaluation, calibration & hysteresis
│   │   └── postureEngine.test.ts           # Unit tests for posture evaluation & alert cooldowns
│   ├── App.tsx                             # Main desktop-shell layout & sidebar navigation
│   ├── index.css                           # Global theme styles & typography
│   └── main.tsx                            # Application entry point
├── index.html
├── package.json
└── vite.config.ts
💻 Getting Started Locally
Prerequisites
Node.js 18+ and npm
A built-in laptop webcam or external USB webcam
Installation & Development
Clone the repository:
code
Bash
git clone https://github.com/your-username/postureguard-ai.git
cd postureguard-ai
Install dependencies:
code
Bash
npm install
Start the development server:
code
Bash
npm run dev
Open in your browser:
Navigate to http://localhost:3000 and click Start Monitoring to grant webcam access.
Running Unit Tests
code
Bash
npx tsx --test src/utils/postureEngine.test.ts
Building for Production
code
Bash
npm run build
🔒 Privacy & Security
100% On-Device Processing: All webcam video frames and MediaPipe landmark inferences are processed locally in your device's memory (RAM/GPU).
Zero Cloud Video Streaming: No camera frames, snapshots, or biometric landmarks are ever uploaded or transmitted to any external server.
Explicit Hardware Control: The webcam is only accessed when you click Start Monitoring and all media tracks are immediately stopped and released when you click Stop.
📄 License
Distributed under the Apache-2.0 License.
