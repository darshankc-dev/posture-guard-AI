import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  Play,
  Pause,
  Square,
  RefreshCw,
  Volume2,
  VolumeX,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  CameraOff,
  Aperture,
  Trash2,
  UserCheck,
  Activity,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Eye,
  Crosshair,
  Clock,
  Bell,
  Coffee,
  ArrowRight,
  MoreHorizontal,
  Maximize2,
  Sun,
  User,
  Sliders,
} from 'lucide-react';
import { FilesetResolver, PoseLandmarker, FaceDetector } from '@mediapipe/tasks-vision';
import { WebPostureEngine, PostureAssessment, PostureState } from '../utils/postureEngine';

export type WorkspaceSection = 'dashboard' | 'monitoring' | 'history' | 'settings';

interface LiveCameraMonitorProps {
  activeSection?: WorkspaceSection;
  onNavigate?: (section: WorkspaceSection) => void;
}

interface CapturedSnapshot {
  id: string;
  timestamp: string;
  state: PostureState;
  message: string;
  dataUrl: string;
}

interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

interface ActivityLogItem {
  id: string;
  time: string;
  label: string;
  type: 'good' | 'warning' | 'alert';
}

interface ExtractedLandmarks {
  nose: [number, number, number];
  leftEye: [number, number, number];
  rightEye: [number, number, number];
  leftEar: [number, number, number];
  rightEar: [number, number, number];
  leftShoulder: [number, number, number];
  rightShoulder: [number, number, number];
  faceBox: { x: number; y: number; width: number; height: number } | null;
  faceConfidence: number;
  poseConfidence: number;
  hasFace: boolean;
  hasPose: boolean;
}

interface PipelineDiagnostics {
  selectedDevice: string;
  getUserMediaStatus: 'idle' | 'requesting' | 'granted' | 'failed';
  streamActive: boolean;
  trackState: string;
  trackMuted: boolean;
  videoReadyState: number;
  videoWidth: number;
  videoHeight: number;
  videoPlaying: boolean;
  faceModelReady: boolean;
  poseModelReady: boolean;
  inferenceRunning: boolean;
  fps: number;
  faceDetected: boolean;
  faceConfidence: number;
  poseDetected: boolean;
  poseConfidence: number;
  lastError: string | null;
}

function playHarmonicChime(volume: number = 0.8) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc2.frequency.setValueAtTime(880.0, now); // A5

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume * 0.25, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  } catch {
    // Ignore audio context errors when browser blocks autoplay audio
  }
}

export function LiveCameraMonitor({
  activeSection = 'dashboard',
  onNavigate,
}: LiveCameraMonitorProps) {
  // Distinct Pipeline Status States
  const [cameraStatus, setCameraStatus] = useState<
    'idle' | 'starting' | 'streaming' | 'paused' | 'error'
  >('idle');
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [faceDetectionStatus, setFaceDetectionStatus] = useState<
    'idle' | 'detected' | 'not_detected'
  >('idle');
  const [poseDetectionStatus, setPoseDetectionStatus] = useState<
    'idle' | 'detected' | 'partial' | 'not_detected'
  >('idle');

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  // Camera Devices
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Settings & Controls
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
  const [autoCaptureAlerts, setAutoCaptureAlerts] = useState<boolean>(true);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);

  // Live Clock
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('6:24 PM');
  const [currentDateStr, setCurrentDateStr] = useState<string>('Tue, 27 Oct 2026');

  // Posture Assessment & Calibration
  const [assessment, setAssessment] = useState<PostureAssessment>({
    state: 'UNASSESSED',
    primaryDeviation: 'none',
    message: 'Click "Start Monitoring" to open your webcam and begin real-time posture analysis.',
    confidence: 0,
    deviationScore: 0,
    timeInDeviation: 0,
    metrics: {
      neckRatio: 0,
      shoulderWidth: 0,
      shoulderTiltDeg: 0,
      headTiltDeg: 0,
      forwardDrop: 0,
      noseY: 0,
      earSpan: 0,
    },
  });
  const [hasCalibration, setHasCalibration] = useState<boolean>(false);
  const [calibrationToast, setCalibrationToast] = useState<string | null>(null);

  // Session Counters & Activity Timeline
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);
  const [goodSeconds, setGoodSeconds] = useState<number>(0);
  const [alertsCount, setAlertsCount] = useState<number>(0);
  const [snapshots, setSnapshots] = useState<CapturedSnapshot[]>([]);
  const [faceConfidencePct, setFaceConfidencePct] = useState<number>(0);
  const [poseConfidencePct, setPoseConfidencePct] = useState<number>(0);
  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([
    { id: 'init-1', time: '6:18 PM', label: 'Good posture aligned', type: 'good' },
    { id: 'init-2', time: '6:15 PM', label: 'Slight forward lean detected', type: 'warning' },
    { id: 'init-3', time: '6:13 PM', label: 'Posture reminder shown', type: 'alert' },
    { id: 'init-4', time: '6:10 PM', label: 'Good posture baseline calibrated', type: 'good' },
  ]);

  // Diagnostics State
  const [diagnostics, setDiagnostics] = useState<PipelineDiagnostics>({
    selectedDevice: 'Default Webcam',
    getUserMediaStatus: 'idle',
    streamActive: false,
    trackState: 'none',
    trackMuted: false,
    videoReadyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    videoPlaying: false,
    faceModelReady: false,
    poseModelReady: false,
    inferenceRunning: false,
    fps: 0,
    faceDetected: false,
    faceConfidence: 0,
    poseDetected: false,
    poseConfidence: 0,
    lastError: null,
  });

  // Refs for DOM elements and MediaPipe instances
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const engineRef = useRef<WebPostureEngine>(new WebPostureEngine());
  const animFrameRef = useRef<number | null>(null);
  const isInferenceBusyRef = useRef<boolean>(false);
  const lastTimestampMsRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const latestLandmarksRef = useRef<ExtractedLandmarks | null>(null);
  const autoCalibCountRef = useRef<number>(0);
  const lastAutoCaptureRef = useRef<number>(0);
  const fpsFrameCountRef = useRef<number>(0);
  const fpsLastCheckRef = useRef<number>(performance.now());
  const currentFpsRef = useRef<number>(0);
  const lastLoggedStateRef = useRef<PostureState>('UNASSESSED');

  // Update clock every 15 seconds
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      );
      setCurrentDateStr(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      );
    };
    updateClock();
    const timer = window.setInterval(updateClock, 15000);
    return () => window.clearInterval(timer);
  }, []);

  // Helper to check if a camera label looks like a virtual or phone-link camera
  const isVirtualOrPhoneCamera = useCallback((label: string): boolean => {
    return /virtual|phone|link to windows|samsung|droidcam|iriun|obs|ndi|snap camera|manycam|camo|epoccam|vcam/i.test(
      label
    );
  }, []);

  // Helper to pick the best physical laptop webcam from a list of video input devices
  const pickBestPhysicalCamera = useCallback(
    (devices: CameraDeviceOption[]): CameraDeviceOption | null => {
      if (devices.length === 0) return null;
      const preferredBuiltIn = devices.find(
        d =>
          !isVirtualOrPhoneCamera(d.label) &&
          /integrated|internal|built-in|user facing|front|uvc|webcam|usb|hd camera|hp |lenovo|dell|asus|acer|realtek|sunplus|chicony|bison|logitech/i.test(
            d.label
          )
      );
      if (preferredBuiltIn) return preferredBuiltIn;

      const nonVirtual = devices.find(d => !isVirtualOrPhoneCamera(d.label));
      if (nonVirtual) return nonVirtual;

      return devices[0];
    },
    [isVirtualOrPhoneCamera]
  );

  // Enumerate available video input cameras
  const refreshCameraDevices = useCallback(async (): Promise<CameraDeviceOption[]> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasRealLabels = devices.some(
        d => d.kind === 'videoinput' && d.label && d.label.trim().length > 0
      );

      const videoInputs = devices
        .filter(d => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera Device #${idx + 1}`,
        }));

      videoInputs.sort((a, b) => {
        const aVirt = isVirtualOrPhoneCamera(a.label) ? 1 : 0;
        const bVirt = isVirtualOrPhoneCamera(b.label) ? 1 : 0;
        return aVirt - bVirt;
      });

      setCameraDevices(videoInputs);

      if (hasRealLabels) {
        const bestCam = pickBestPhysicalCamera(videoInputs);
        const currentSelectedObj = videoInputs.find(d => d.deviceId === selectedDeviceId);
        if (
          bestCam &&
          (!selectedDeviceId ||
            (currentSelectedObj &&
              isVirtualOrPhoneCamera(currentSelectedObj.label) &&
              !isVirtualOrPhoneCamera(bestCam.label)))
        ) {
          setSelectedDeviceId(bestCam.deviceId);
        }
      }
      return videoInputs;
    } catch (err) {
      console.warn('Could not enumerate video devices:', err);
      return [];
    }
  }, [selectedDeviceId, isVirtualOrPhoneCamera, pickBestPhysicalCamera]);

  useEffect(() => {
    refreshCameraDevices();
  }, [refreshCameraDevices]);

  // Initialize MediaPipe FaceDetector and PoseLandmarker
  const initMediaPipeModels = useCallback(async () => {
    setModelStatus('loading');
    setModelError(null);

    try {
      if (faceDetectorRef.current) {
        try {
          faceDetectorRef.current.close();
        } catch {
          // ignore
        }
        faceDetectorRef.current = null;
      }
      if (poseLandmarkerRef.current) {
        try {
          poseLandmarkerRef.current.close();
        } catch {
          // ignore
        }
        poseLandmarkerRef.current = null;
      }

      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks('/wasm');
      } catch {
        vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );
      }

      let faceDetector: FaceDetector | null = null;
      try {
        faceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.45,
        });
      } catch {
        faceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/blaze_face_short_range.tflite',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.45,
        });
      }
      faceDetectorRef.current = faceDetector;

      let poseLandmarker: PoseLandmarker | null = null;
      try {
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.45,
          minPosePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
        });
      } catch {
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/pose_landmarker_lite.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.45,
          minPosePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
        });
      }
      poseLandmarkerRef.current = poseLandmarker;

      setModelStatus('ready');
      setDiagnostics(prev => ({
        ...prev,
        faceModelReady: Boolean(faceDetectorRef.current),
        poseModelReady: Boolean(poseLandmarkerRef.current),
        lastError: null,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('MediaPipe initialization error:', err);
      setModelStatus('error');
      setModelError(msg || 'Failed to load MediaPipe Vision WASM / model assets.');
      setDiagnostics(prev => ({
        ...prev,
        faceModelReady: false,
        poseModelReady: false,
        lastError: `Model init failed: ${msg}`,
      }));
    }
  }, []);

  useEffect(() => {
    initMediaPipeModels();
    return () => {
      if (faceDetectorRef.current) {
        try {
          faceDetectorRef.current.close();
        } catch {
          // ignore
        }
      }
      if (poseLandmarkerRef.current) {
        try {
          poseLandmarkerRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [initMediaPipeModels]);

  // Sync sensitivity with posture engine
  useEffect(() => {
    engineRef.current.sensitivity = sensitivity;
  }, [sensitivity]);

  // Session 1-second timer when camera is actively streaming
  useEffect(() => {
    if (cameraStatus !== 'streaming') return;
    const interval = window.setInterval(() => {
      setSessionSeconds(s => s + 1);
      if (assessment.state === 'GOOD') {
        setGoodSeconds(g => g + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cameraStatus, assessment.state]);

  // Calibrate baseline from current detected landmarks
  const calibrateFromLandmarks = useCallback(
    (lms: ExtractedLandmarks, isAuto: boolean = false) => {
      const ok = engineRef.current.calibrate([
        {
          nose: lms.nose,
          leftEar: lms.leftEar,
          rightEar: lms.rightEar,
          leftShoulder: lms.leftShoulder,
          rightShoulder: lms.rightShoulder,
        },
      ]);
      if (ok) {
        setHasCalibration(true);
        setCalibrationToast(
          isAuto
            ? 'Baseline automatically calibrated from your sitting position.'
            : 'Baseline posture calibrated to your current sitting position!'
        );
        setTimeout(() => setCalibrationToast(null), 3500);
      }
    },
    []
  );

  const handleManualCalibrate = () => {
    if (
      latestLandmarksRef.current &&
      (latestLandmarksRef.current.hasFace || latestLandmarksRef.current.hasPose)
    ) {
      calibrateFromLandmarks(latestLandmarksRef.current, false);
    } else {
      setCalibrationToast('Please ensure your face is visible in the camera frame before calibrating.');
      setTimeout(() => setCalibrationToast(null), 3500);
    }
  };

  // Capture composite snapshot (mirrored video frame + skeleton/face overlay + status banner)
  const captureFrameSnapshot = useCallback(
    (overrideState?: PostureState, overrideMsg?: string) => {
      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.translate(tempCanvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
      ctx.restore();

      if (overlay && overlay.width > 0 && overlay.height > 0) {
        ctx.drawImage(overlay, 0, 0, tempCanvas.width, tempCanvas.height);
      }

      const snapState = overrideState || assessment.state;
      const snapMsg = overrideMsg || assessment.message;
      const timeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      ctx.fillStyle = 'rgba(26, 24, 41, 0.85)';
      ctx.fillRect(0, tempCanvas.height - 38, tempCanvas.width, 38);
      ctx.font = 'bold 13px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle =
        snapState === 'GOOD'
          ? '#22C55E'
          : snapState === 'WARNING'
          ? '#F59E0B'
          : snapState === 'ALERT'
          ? '#EF4444'
          : '#A5B4FC';
      ctx.fillText(`${snapState}  •  ${timeStr}  •  ${snapMsg.slice(0, 48)}`, 12, tempCanvas.height - 14);

      const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.88);
      setSnapshots(prev => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: timeStr,
          state: snapState,
          message: snapMsg,
          dataUrl,
        },
        ...prev.slice(0, 7),
      ]);
    },
    [assessment.state, assessment.message]
  );

  // Cleanly stop camera and release all media tracks
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
    }

    isInferenceBusyRef.current = false;
    lastVideoTimeRef.current = -1;
    latestLandmarksRef.current = null;
    autoCalibCountRef.current = 0;

    setCameraStatus('idle');
    setFaceDetectionStatus('idle');
    setPoseDetectionStatus('idle');
    setFaceConfidencePct(0);
    setPoseConfidencePct(0);
    setDiagnostics(prev => ({
      ...prev,
      getUserMediaStatus: 'idle',
      streamActive: false,
      trackState: 'stopped',
      videoPlaying: false,
      inferenceRunning: false,
      fps: 0,
      faceDetected: false,
      poseDetected: false,
    }));
  }, []);

  const formatGetUserMediaError = (err: unknown): string => {
    if (err && typeof err === 'object' && 'name' in err) {
      const domErr = err as DOMException;
      switch (domErr.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          return 'Camera permission was denied. Please allow camera access in your browser address bar and click Retry Camera.';
        case 'NotFoundError':
        case 'DevicesNotFoundError':
          return 'No webcam device was found on this system. Please connect a camera and click Retry Camera.';
        case 'NotReadableError':
        case 'TrackStartError':
          return 'Webcam is currently in use by another application (such as Zoom, Teams, or another tab) or encountered a hardware error.';
        case 'OverconstrainedError':
          return 'The selected camera does not support the requested resolution constraints.';
        case 'SecurityError':
          return 'Camera access is blocked by browser security policy or iframe permissions.';
        default:
          return `Camera error (${domErr.name}): ${domErr.message || 'Unable to start video stream.'}`;
      }
    }
    return err instanceof Error ? err.message : 'Unable to access webcam.';
  };

  // Start Webcam with full verification of metadata, play(), non-zero dimensions, and virtual camera auto-bypass
  const startCamera = useCallback(
    async (overrideDeviceId?: string) => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      setCameraError(null);
      setCameraStatus('starting');
      setFaceDetectionStatus('idle');
      setPoseDetectionStatus('idle');
      autoCalibCountRef.current = 0;
      setHasCalibration(false);
      engineRef.current.calibration = null;

      const targetDeviceId =
        overrideDeviceId !== undefined ? overrideDeviceId : selectedDeviceId;

      setDiagnostics(prev => ({
        ...prev,
        getUserMediaStatus: 'requesting',
        lastError: null,
      }));

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const msg =
          'navigator.mediaDevices.getUserMedia() is not available in this browser or context.';
        setCameraError(msg);
        setCameraStatus('error');
        setDiagnostics(prev => ({
          ...prev,
          getUserMediaStatus: 'failed',
          lastError: msg,
        }));
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: targetDeviceId
            ? {
                deviceId: { exact: targetDeviceId },
                width: { ideal: 640 },
                height: { ideal: 480 },
              }
            : {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 },
              },
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (firstErr) {
          console.warn('Primary camera constraints failed, retrying with basic video:true', firstErr);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        const discoveredDevices = await refreshCameraDevices();

        let videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) {
          stream.getTracks().forEach(t => t.stop());
          throw new Error('MediaStream returned 0 video tracks.');
        }

        let primaryTrack = videoTracks[0];
        let trackLabel = primaryTrack.label || 'Webcam';

        // Automatically switch away from Windows Virtual Camera / Phone Link ("Samsung S22 (Windows Virtual Camera)")
        // to the laptop's built-in physical webcam when the user didn't explicitly pick the virtual camera
        if (!overrideDeviceId && isVirtualOrPhoneCamera(trackLabel)) {
          const bestPhysical = pickBestPhysicalCamera(discoveredDevices);
          if (bestPhysical && !isVirtualOrPhoneCamera(bestPhysical.label)) {
            console.info(
              `Auto-switching from virtual/phone camera "${trackLabel}" to physical webcam "${bestPhysical.label}"`
            );
            stream.getTracks().forEach(t => t.stop());
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  deviceId: { exact: bestPhysical.deviceId },
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                },
              });
              videoTracks = stream.getVideoTracks();
              if (videoTracks.length > 0) {
                primaryTrack = videoTracks[0];
                trackLabel = primaryTrack.label || bestPhysical.label;
                setSelectedDeviceId(bestPhysical.deviceId);
              }
            } catch (switchErr) {
              console.warn('Failed to auto-switch to physical camera, reopening default:', switchErr);
              stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
              videoTracks = stream.getVideoTracks();
              primaryTrack = videoTracks[0];
              trackLabel = primaryTrack?.label || 'Webcam';
            }
          }
        }

        const activeSettingsDeviceId = primaryTrack.getSettings?.().deviceId;
        if (activeSettingsDeviceId) {
          setSelectedDeviceId(activeSettingsDeviceId);
        } else {
          const matchedDev = discoveredDevices.find(d => d.label === trackLabel);
          if (matchedDev) {
            setSelectedDeviceId(matchedDev.deviceId);
          }
        }

        primaryTrack.onended = () => {
          console.warn('Webcam video track ended unexpectedly.');
          setCameraError('The webcam stream ended or was disconnected.');
          stopCamera();
          setCameraStatus('error');
        };

        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach(t => t.stop());
          throw new Error('Video element reference is not mounted.');
        }

        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = stream;

        await new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            cleanupListeners();
            reject(new Error('Timed out waiting for webcam video metadata (loadedmetadata).'));
          }, 8000);

          const onLoadedMetadata = () => {
            cleanupListeners();
            resolve();
          };

          const onError = () => {
            cleanupListeners();
            reject(new Error('HTMLVideoElement emitted an error while loading stream.'));
          };

          const cleanupListeners = () => {
            window.clearTimeout(timeoutId);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('error', onError);
          };

          if (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0) {
            cleanupListeners();
            resolve();
          } else {
            video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
            video.addEventListener('error', onError, { once: true });
          }
        });

        await video.play();

        let retries = 20;
        while ((video.videoWidth === 0 || video.videoHeight === 0) && retries > 0) {
          await new Promise(r => setTimeout(r, 100));
          retries--;
        }

        if (video.videoWidth === 0 || video.videoHeight === 0) {
          throw new Error(
            `Webcam opened (${trackLabel}), but video dimensions are 0x0. Try selecting a different camera device.`
          );
        }

        if (overlayCanvasRef.current) {
          overlayCanvasRef.current.width = video.videoWidth;
          overlayCanvasRef.current.height = video.videoHeight;
        }

        setCameraStatus('streaming');
        setDiagnostics(prev => ({
          ...prev,
          selectedDevice: trackLabel,
          getUserMediaStatus: 'granted',
          streamActive: stream.active,
          trackState: primaryTrack.readyState,
          trackMuted: primaryTrack.muted,
          videoReadyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          videoPlaying: !video.paused && !video.ended,
          lastError: null,
        }));
      } catch (err: unknown) {
        console.error('Webcam initialization failed:', err);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        const friendlyMsg = formatGetUserMediaError(err);
        setCameraError(friendlyMsg);
        setCameraStatus('error');
        setDiagnostics(prev => ({
          ...prev,
          getUserMediaStatus: 'failed',
          streamActive: false,
          videoPlaying: false,
          inferenceRunning: false,
          lastError: friendlyMsg,
        }));
      }
    },
    [
      selectedDeviceId,
      refreshCameraDevices,
      stopCamera,
      isVirtualOrPhoneCamera,
      pickBestPhysicalCamera,
    ]
  );

  const pauseMonitoring = () => {
    if (cameraStatus !== 'streaming') return;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setCameraStatus('paused');
    setDiagnostics(prev => ({ ...prev, inferenceRunning: false }));
  };

  const resumeMonitoring = () => {
    if (cameraStatus !== 'paused') return;
    setCameraStatus('streaming');
  };

  const handleDeviceChange = (newDeviceId: string) => {
    setSelectedDeviceId(newDeviceId);
    if (cameraStatus === 'streaming' || cameraStatus === 'paused') {
      startCamera(newDeviceId);
    }
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Main Real-Time Detection & Overlay Rendering Loop
  useEffect(() => {
    if (cameraStatus !== 'streaming') {
      return;
    }

    let active = true;

    const runDetectionLoop = () => {
      if (!active) return;

      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      const stream = streamRef.current;

      if (!stream || !stream.active) {
        setCameraError('Camera stream became inactive.');
        setCameraStatus('error');
        return;
      }

      if (
        video &&
        canvas &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !video.paused &&
        !isInferenceBusyRef.current
      ) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        if (video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          isInferenceBusyRef.current = true;

          fpsFrameCountRef.current += 1;
          const nowPerf = performance.now();
          if (nowPerf - fpsLastCheckRef.current >= 1000) {
            currentFpsRef.current = Math.round(
              (fpsFrameCountRef.current * 1000) / (nowPerf - fpsLastCheckRef.current)
            );
            fpsFrameCountRef.current = 0;
            fpsLastCheckRef.current = nowPerf;
          }

          try {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);

              const W = canvas.width;
              const H = canvas.height;

              let hasFace = false;
              let hasPose = false;
              let faceConf = 0;
              let poseConf = 0;
              let faceBoxNorm: { x: number; y: number; width: number; height: number } | null =
                null;

              let nose: [number, number, number] = [0.5, 0.5, 0];
              let leftEye: [number, number, number] = [0.45, 0.45, 0];
              let rightEye: [number, number, number] = [0.55, 0.45, 0];
              let leftEar: [number, number, number] = [0.4, 0.46, 0];
              let rightEar: [number, number, number] = [0.6, 0.46, 0];
              let leftShoulder: [number, number, number] = [0.35, 0.72, 0];
              let rightShoulder: [number, number, number] = [0.65, 0.72, 0];

              // 1. MediaPipe FaceDetector
              if (faceDetectorRef.current) {
                const tsFace = Math.max(
                  Math.floor(performance.now()),
                  lastTimestampMsRef.current + 1
                );
                lastTimestampMsRef.current = tsFace;

                const faceResult = faceDetectorRef.current.detectForVideo(video, tsFace);
                if (faceResult.detections && faceResult.detections.length > 0) {
                  const det = faceResult.detections[0];
                  faceConf = det.categories?.[0]?.score ?? 0.85;

                  if (faceConf >= 0.45 && det.boundingBox) {
                    hasFace = true;
                    const bb = det.boundingBox;
                    const mirroredX = Math.max(0, (W - (bb.originX + bb.width)) / W);
                    const normY = Math.max(0, bb.originY / H);
                    const normW = Math.min(1, bb.width / W);
                    const normH = Math.min(1, bb.height / H);

                    faceBoxNorm = {
                      x: mirroredX,
                      y: normY,
                      width: normW,
                      height: normH,
                    };

                    const kps = det.keypoints;
                    if (kps && kps.length >= 6) {
                      nose = [1.0 - kps[2].x, kps[2].y, faceConf];
                      leftEye = [1.0 - kps[0].x, kps[0].y, faceConf];
                      rightEye = [1.0 - kps[1].x, kps[1].y, faceConf];
                      leftEar = [1.0 - kps[4].x, kps[4].y, faceConf];
                      rightEar = [1.0 - kps[5].x, kps[5].y, faceConf];
                    } else {
                      const cx = mirroredX + normW / 2;
                      const cy = normY + normH / 2;
                      nose = [cx, cy, faceConf];
                      leftEye = [cx - normW * 0.18, cy - normH * 0.1, faceConf];
                      rightEye = [cx + normW * 0.18, cy - normH * 0.1, faceConf];
                      leftEar = [cx - normW * 0.42, cy, faceConf];
                      rightEar = [cx + normW * 0.42, cy, faceConf];
                    }
                  }
                }
              }

              // 2. MediaPipe PoseLandmarker
              if (poseLandmarkerRef.current) {
                const tsPose = Math.max(
                  Math.floor(performance.now()),
                  lastTimestampMsRef.current + 1
                );
                lastTimestampMsRef.current = tsPose;

                const poseResult = poseLandmarkerRef.current.detectForVideo(video, tsPose);
                if (poseResult.landmarks && poseResult.landmarks.length > 0) {
                  const lms = poseResult.landmarks[0];
                  const getMirroredPt = (idx: number): [number, number, number] => {
                    const pt = lms[idx];
                    if (!pt) return [0.5, 0.5, 0];
                    return [1.0 - pt.x, pt.y, pt.visibility ?? 0.8];
                  };

                  const pNose = getMirroredPt(0);
                  const pLEye = getMirroredPt(5);
                  const pREye = getMirroredPt(2);
                  const pLEar = getMirroredPt(8);
                  const pREar = getMirroredPt(7);
                  const pLSh = getMirroredPt(12);
                  const pRSh = getMirroredPt(11);

                  const shoulderVis = (pLSh[2] + pRSh[2]) / 2;
                  const headVis = (pNose[2] + pLEar[2] + pREar[2]) / 3;
                  poseConf = (shoulderVis + headVis) / 2;

                  if (shoulderVis >= 0.35 || headVis >= 0.45) {
                    hasPose = shoulderVis >= 0.35;
                    leftShoulder = pLSh;
                    rightShoulder = pRSh;

                    if (headVis >= 0.5) {
                      nose = pNose;
                      leftEye = pLEye;
                      rightEye = pREye;
                      leftEar = pLEar;
                      rightEar = pREar;
                    }

                    if (!hasFace && headVis >= 0.55) {
                      hasFace = true;
                      faceConf = headVis;
                      const earSpan = Math.max(
                        0.08,
                        Math.hypot(rightEar[0] - leftEar[0], rightEar[1] - leftEar[1])
                      );
                      const fw = earSpan * 1.45;
                      const fh = earSpan * 1.75;
                      faceBoxNorm = {
                        x: Math.max(0.01, nose[0] - fw / 2),
                        y: Math.max(0.01, nose[1] - fh * 0.52),
                        width: Math.min(0.95, fw),
                        height: Math.min(0.95, fh),
                      };
                    }
                  }
                }
              }

              setFaceDetectionStatus(hasFace ? 'detected' : 'not_detected');
              setPoseDetectionStatus(
                hasPose ? 'detected' : hasFace ? 'partial' : 'not_detected'
              );
              setFaceConfidencePct(Math.round(faceConf * 100));
              setPoseConfidencePct(Math.round(poseConf * 100));

              const extracted: ExtractedLandmarks = {
                nose,
                leftEye,
                rightEye,
                leftEar,
                rightEar,
                leftShoulder,
                rightShoulder,
                faceBox: faceBoxNorm,
                faceConfidence: faceConf,
                poseConfidence: poseConf,
                hasFace,
                hasPose,
              };
              latestLandmarksRef.current = extracted;

              if (hasFace || hasPose) {
                if (!engineRef.current.calibration) {
                  autoCalibCountRef.current += 1;
                  if (autoCalibCountRef.current >= 12) {
                    calibrateFromLandmarks(extracted, true);
                  }
                }

                const evalRes = engineRef.current.evaluate(
                  extracted.nose,
                  extracted.leftEar,
                  extracted.rightEar,
                  extracted.leftShoulder,
                  extracted.rightShoulder
                );
                setAssessment(evalRes);

                // Record real state transitions into Recent Activity timeline
                if (
                  evalRes.state !== 'UNASSESSED' &&
                  evalRes.state !== lastLoggedStateRef.current
                ) {
                  lastLoggedStateRef.current = evalRes.state;
                  const nowTime = new Date().toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  });
                  const labelMap: Record<PostureState, string> = {
                    GOOD: 'Good posture aligned',
                    WARNING:
                      evalRes.primaryDeviation === 'forward_head'
                        ? 'Slight forward lean detected'
                        : evalRes.primaryDeviation === 'shoulder_tilt'
                        ? 'Uneven shoulder alignment detected'
                        : 'Slight posture deviation detected',
                    ALERT: 'Reminder shown — sustained posture deviation',
                    UNASSESSED: 'Waiting for landmark detection',
                  };
                  setActivityLog(prev => [
                    {
                      id: `${Date.now()}`,
                      time: nowTime,
                      label: labelMap[evalRes.state],
                      type:
                        evalRes.state === 'GOOD'
                          ? 'good'
                          : evalRes.state === 'WARNING'
                          ? 'warning'
                          : 'alert',
                    },
                    ...prev.slice(0, 7),
                  ]);
                }

                if (evalRes.state === 'ALERT') {
                  if (engineRef.current.canTriggerAlert()) {
                    engineRef.current.registerAlertTriggered();
                    setAlertsCount(c => c + 1);
                    if (soundEnabled) {
                      playHarmonicChime(0.85);
                    }
                    const nowMs = Date.now();
                    if (autoCaptureAlerts && nowMs - lastAutoCaptureRef.current > 6000) {
                      lastAutoCaptureRef.current = nowMs;
                      setTimeout(() => captureFrameSnapshot('ALERT', evalRes.message), 50);
                    }
                  }
                }

                if (showSkeleton) {
                  const stateColors = {
                    GOOD: '#22C55E',
                    WARNING: '#F59E0B',
                    ALERT: '#EF4444',
                    UNASSESSED: '#A5B4FC',
                  };
                  const mainColor = stateColors[evalRes.state];

                  if (extracted.faceBox) {
                    const bx = extracted.faceBox.x * W;
                    const by = extracted.faceBox.y * H;
                    const bw = extracted.faceBox.width * W;
                    const bh = extracted.faceBox.height * H;

                    // Corner brackets matching the clean reference camera overlay
                    const cornerLen = Math.min(26, bw * 0.24);
                    ctx.strokeStyle = mainColor;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(bx, by + cornerLen);
                    ctx.lineTo(bx, by);
                    ctx.lineTo(bx + cornerLen, by);
                    ctx.moveTo(bx + bw - cornerLen, by);
                    ctx.lineTo(bx + bw, by);
                    ctx.lineTo(bx + bw, by + cornerLen);
                    ctx.moveTo(bx, by + bh - cornerLen);
                    ctx.lineTo(bx, by + bh);
                    ctx.lineTo(bx + cornerLen, by + bh);
                    ctx.moveTo(bx + bw - cornerLen, by + bh);
                    ctx.lineTo(bx + bw, by + bh);
                    ctx.lineTo(bx + bw, by + bh - cornerLen);
                    ctx.stroke();
                  }

                  const toPx = (pt: [number, number, number]): [number, number] => [
                    pt[0] * W,
                    pt[1] * H,
                  ];

                  const pNose = toPx(extracted.nose);
                  const pLEye = toPx(extracted.leftEye);
                  const pREye = toPx(extracted.rightEye);
                  const pLEar = toPx(extracted.leftEar);
                  const pREar = toPx(extracted.rightEar);

                  ctx.strokeStyle = mainColor;
                  ctx.lineWidth = 2.5;

                  const drawBone = (a: [number, number], b: [number, number], color?: string) => {
                    ctx.beginPath();
                    ctx.strokeStyle = color || mainColor;
                    ctx.moveTo(a[0], a[1]);
                    ctx.lineTo(b[0], b[1]);
                    ctx.stroke();
                  };

                  drawBone(pLEar, pLEye);
                  drawBone(pLEye, pNose);
                  drawBone(pNose, pREye);
                  drawBone(pREye, pREar);

                  const faceJoints: Array<{ pt: [number, number]; r: number }> = [
                    { pt: pNose, r: 5 },
                    { pt: pLEye, r: 4 },
                    { pt: pREye, r: 4 },
                    { pt: pLEar, r: 4.5 },
                    { pt: pREar, r: 4.5 },
                  ];

                  if (extracted.hasPose) {
                    const pLSh = toPx(extracted.leftShoulder);
                    const pRSh = toPx(extracted.rightShoulder);
                    const pNeck: [number, number] = [
                      (pLSh[0] + pRSh[0]) / 2,
                      (pLSh[1] + pRSh[1]) / 2,
                    ];

                    ctx.lineWidth = 3;
                    drawBone(pNose, pNeck, evalRes.state === 'GOOD' ? '#22C55E' : '#EF4444');
                    drawBone(pLSh, pRSh, mainColor);
                    drawBone(pLEar, pLSh, mainColor);
                    drawBone(pREar, pRSh, mainColor);

                    faceJoints.push(
                      { pt: pLSh, r: 7 },
                      { pt: pRSh, r: 7 },
                      { pt: pNeck, r: 5.5 }
                    );
                  }

                  faceJoints.forEach(({ pt, r }) => {
                    ctx.beginPath();
                    ctx.fillStyle = `${mainColor}44`;
                    ctx.arc(pt[0], pt[1], r * 1.8, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.beginPath();
                    ctx.fillStyle = mainColor;
                    ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
                    ctx.fill();
                  });
                }
              } else {
                engineRef.current.deviationStartTime = null;
                setAssessment({
                  state: 'UNASSESSED',
                  primaryDeviation: 'none',
                  message:
                    'No face or upper body detected in the camera frame. Position yourself in front of the webcam with adequate lighting.',
                  confidence: 0,
                  deviationScore: 0,
                  timeInDeviation: 0,
                  metrics: {
                    neckRatio: 0,
                    shoulderWidth: 0,
                    shoulderTiltDeg: 0,
                    headTiltDeg: 0,
                    forwardDrop: 0,
                    noseY: 0,
                    earSpan: 0,
                  },
                });
              }

              if (fpsFrameCountRef.current % 10 === 0) {
                const track = stream.getVideoTracks()[0];
                setDiagnostics(prev => ({
                  ...prev,
                  streamActive: stream.active,
                  trackState: track ? track.readyState : 'none',
                  trackMuted: track ? track.muted : false,
                  videoReadyState: video.readyState,
                  videoWidth: video.videoWidth,
                  videoHeight: video.videoHeight,
                  videoPlaying: !video.paused && !video.ended,
                  inferenceRunning: true,
                  fps: currentFpsRef.current,
                  faceDetected: hasFace,
                  faceConfidence: Math.round(faceConf * 100),
                  poseDetected: hasPose,
                  poseConfidence: Math.round(poseConf * 100),
                }));
              }
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error('Inference frame error:', err);
            setDiagnostics(prev => ({
              ...prev,
              lastError: `Inference error: ${errMsg}`,
            }));
          } finally {
            isInferenceBusyRef.current = false;
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(runDetectionLoop);
    };

    animFrameRef.current = requestAnimationFrame(runDetectionLoop);

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      isInferenceBusyRef.current = false;
    };
  }, [
    cameraStatus,
    showSkeleton,
    soundEnabled,
    autoCaptureAlerts,
    calibrateFromLandmarks,
    captureFrameSnapshot,
  ]);

  const formatHMS = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
      .toString()
      .padStart(2, '0')}`;
  };

  const isCameraActive = cameraStatus === 'streaming' || cameraStatus === 'paused';
  const goodPosturePct =
    sessionSeconds > 0 ? Math.round((goodSeconds / sessionSeconds) * 100) : 100;

  // Compute live indicator percentages and statuses
  const headTiltAbs = Math.abs(assessment.metrics.headTiltDeg);
  const headScorePct = isCameraActive
    ? Math.max(15, Math.min(100, Math.round(100 - headTiltAbs * 4.5)))
    : 65;
  const headStatusLabel = !isCameraActive
    ? 'Standby'
    : headTiltAbs <= 8.5
    ? 'Good'
    : headTiltAbs <= 14
    ? 'Tilted'
    : 'Adjust';

  const shoulderTiltAbs = Math.abs(assessment.metrics.shoulderTiltDeg);
  const shoulderScorePct = isCameraActive
    ? Math.max(15, Math.min(100, Math.round(100 - shoulderTiltAbs * 5)))
    : 55;
  const shoulderStatusLabel = !isCameraActive
    ? 'Standby'
    : shoulderTiltAbs <= 7.0
    ? 'Good'
    : shoulderTiltAbs <= 12
    ? 'Uneven'
    : 'Adjust';

  const backScorePct = isCameraActive
    ? Math.max(
        15,
        Math.min(100, Math.round(100 - Math.max(0, assessment.deviationScore * 38)))
      )
    : 70;
  const backStatusLabel = !isCameraActive
    ? 'Standby'
    : assessment.state === 'GOOD'
    ? 'Good'
    : assessment.state === 'WARNING'
    ? 'Fair'
    : assessment.state === 'ALERT'
    ? 'Slouching'
    : 'Standby';

  const activeSegments =
    !isCameraActive
      ? 3
      : assessment.state === 'GOOD'
      ? 5
      : assessment.state === 'WARNING'
      ? 3
      : assessment.state === 'ALERT'
      ? 2
      : 1;

  return (
    <div className="space-y-4">
      {/* TOP GREETING & STATUS BAR (Matches reference image header) */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs sm:text-sm font-medium text-[#64607D]">Good evening,</p>
          <h2 className="text-2xl font-extrabold text-[#1E1B3A] tracking-tight flex items-center gap-2">
            <span>Darshan</span>
            <span aria-hidden="true">👋</span>
          </h2>
          <p className="text-xs text-[#6E6A86] mt-0.5">
            Keep your posture in check while you work or study.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {/* Date & Time Widget */}
          <div className="flex items-center gap-2.5 bg-white/70 border border-[#EAE6F6] px-3.5 py-2 rounded-2xl shadow-xs">
            <Sun size={20} className="text-amber-500 shrink-0" />
            <div className=" leading-tight">
              <span className="block text-[11px] text-[#736E8C] font-medium">
                {currentDateStr}
              </span>
              <span className="block text-sm font-bold text-[#1E1B3A] tabular-nums">
                {currentTimeStr}
              </span>
            </div>
          </div>

          {/* Monitoring / Camera Selector Pill */}
          <div className="flex items-center gap-2 bg-[#ECE9FA] border border-[#DFD9F6] px-3.5 py-2 rounded-2xl">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                cameraStatus === 'streaming'
                  ? 'bg-emerald-500'
                  : cameraStatus === 'starting'
                  ? 'bg-sky-500'
                  : cameraStatus === 'paused'
                  ? 'bg-amber-500'
                  : cameraStatus === 'error'
                  ? 'bg-red-500'
                  : 'bg-[#8C87A6]'
              }`}
            />
            {cameraDevices.length > 0 ? (
              <select
                aria-label="Select Webcam Device"
                value={selectedDeviceId}
                onChange={e => handleDeviceChange(e.target.value)}
                className="bg-transparent text-[#1E1B3A] text-xs font-bold focus:outline-none cursor-pointer max-w-[190px] truncate"
              >
                {cameraDevices.map(dev => (
                  <option key={dev.deviceId} value={dev.deviceId}>
                    {isVirtualOrPhoneCamera(dev.label)
                      ? `⚠️ ${dev.label} (Virtual)`
                      : `📷 ${dev.label}`}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-bold text-[#1E1B3A]">
                {cameraStatus === 'streaming'
                  ? 'Monitoring'
                  : cameraStatus === 'paused'
                  ? 'Paused'
                  : 'Standby'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SETTINGS SECTION WHEN SELECTED IN SIDEBAR */}
      {activeSection === 'settings' && (
        <div className="space-y-5">
          <div className="bg-white border border-[#EAE6F6] rounded-3xl p-6 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#1E1B3A] flex items-center gap-2">
                <Sliders size={18} className="text-[#5B4FE9]" /> Camera &amp; Posture Preferences
              </h3>
              <p className="text-xs text-[#6E6A86] mt-1">
                Customize your webcam device, posture detection sensitivity, and reminder alerts.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Camera Device Selection */}
              <div className="bg-[#FAF9FE] border border-[#EAE6F6] p-4 rounded-2xl flex flex-col justify-between gap-2">
                <div>
                  <span className="text-[#1E1B3A] font-bold block">Active Webcam Device</span>
                  <span className="text-[#6E6A86] text-[11px]">
                    Select your preferred built-in or external USB webcam
                  </span>
                </div>
                {cameraDevices.length > 0 ? (
                  <select
                    aria-label="Preferred Webcam Device"
                    value={selectedDeviceId}
                    onChange={e => handleDeviceChange(e.target.value)}
                    className="bg-white text-[#1E1B3A] text-xs font-semibold border border-[#DFD9F6] rounded-xl px-3 py-2 focus:outline-none focus:border-[#5B4FE9] cursor-pointer"
                  >
                    {cameraDevices.map(dev => (
                      <option key={dev.deviceId} value={dev.deviceId}>
                        {isVirtualOrPhoneCamera(dev.label)
                          ? `⚠️ ${dev.label} (Virtual)`
                          : `📷 ${dev.label}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[#6E6A86] font-medium">
                    Default Webcam (Grant camera access to list all devices)
                  </span>
                )}
              </div>

              {/* Detection Sensitivity */}
              <div className="bg-[#FAF9FE] border border-[#EAE6F6] p-4 rounded-2xl flex flex-col justify-between gap-2">
                <div>
                  <span className="text-[#1E1B3A] font-bold block">Detection Sensitivity</span>
                  <span className="text-[#6E6A86] text-[11px]">
                    Adjust how strictly forward head tilt and slouching are flagged
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(['low', 'medium', 'high'] as const).map(lvl => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSensitivity(lvl)}
                      className={`px-3.5 py-1.5 rounded-xl capitalize font-semibold transition-colors cursor-pointer ${
                        sensitivity === lvl
                          ? 'bg-[#5B4FE9] text-white'
                          : 'bg-[#EEECFA] text-[#4A4665] hover:bg-[#E2DDF8]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Chime Reminders */}
              <div className="bg-[#FAF9FE] border border-[#EAE6F6] p-4 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-[#1E1B3A] font-bold block">Audio Chime Reminders</span>
                  <span className="text-[#6E6A86] text-[11px]">
                    Play a gentle harmonic chime when sustained poor posture is detected
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSoundEnabled(!soundEnabled);
                    if (!soundEnabled) playHarmonicChime(0.5);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl font-semibold cursor-pointer shrink-0 ${
                    soundEnabled
                      ? 'bg-[#5B4FE9] text-white'
                      : 'bg-[#EEECFA] text-[#6E6A86]'
                  }`}
                >
                  {soundEnabled ? 'Enabled' : 'Muted'}
                </button>
              </div>

              {/* Pose Skeleton Overlay */}
              <div className="bg-[#FAF9FE] border border-[#EAE6F6] p-4 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-[#1E1B3A] font-bold block">Pose Skeleton Overlay</span>
                  <span className="text-[#6E6A86] text-[11px]">
                    Draw real-time face brackets and shoulder landmarks over the live video
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSkeleton(!showSkeleton)}
                  className={`px-3.5 py-1.5 rounded-xl font-semibold cursor-pointer shrink-0 ${
                    showSkeleton
                      ? 'bg-[#5B4FE9] text-white'
                      : 'bg-[#EEECFA] text-[#6E6A86]'
                  }`}
                >
                  {showSkeleton ? 'Visible' : 'Hidden'}
                </button>
              </div>

              {/* Auto-Capture on Posture Alert */}
              <div className="bg-[#FAF9FE] border border-[#EAE6F6] p-4 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-[#1E1B3A] font-bold block">Auto-Capture on Posture Alert</span>
                  <span className="text-[#6E6A86] text-[11px]">
                    Automatically save a snapshot when sustained posture deviation triggers an alert
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoCaptureAlerts(!autoCaptureAlerts)}
                  className={`px-3.5 py-1.5 rounded-xl font-semibold cursor-pointer shrink-0 ${
                    autoCaptureAlerts
                      ? 'bg-[#5B4FE9] text-white'
                      : 'bg-[#EEECFA] text-[#6E6A86]'
                  }`}
                >
                  {autoCaptureAlerts ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {/* Posture Baseline Calibration */}
              <div className="bg-[#FAF9FE] border border-[#EAE6F6] p-4 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-[#1E1B3A] font-bold block">Posture Baseline Calibration</span>
                  <span className="text-[#6E6A86] text-[11px]">
                    {hasCalibration
                      ? 'Personalized neutral sitting baseline is currently active'
                      : 'Using default baseline (auto-calibrates once your face is detected)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleManualCalibrate}
                  className="px-3.5 py-1.5 rounded-xl font-semibold bg-[#EEECFA] hover:bg-[#E2DDF8] text-[#5B4FE9] cursor-pointer shrink-0"
                >
                  Recalibrate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN DASHBOARD & LIVE CAMERA WORKSPACE (Always mounted in DOM so stream never interrupts) */}
      <div className={activeSection === 'settings' ? 'hidden' : 'space-y-4'}>
        {/* Virtual / Phone Camera Warning Banner + 1-Click Camera Source Switcher */}
        {isCameraActive && isVirtualOrPhoneCamera(diagnostics.selectedDevice) && (
          <div
            role="alert"
            className="bg-amber-50 border border-amber-300 text-amber-950 text-xs p-4 rounded-2xl shadow-xs space-y-2.5"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900">
                  Virtual / Phone Camera Selected: &ldquo;{diagnostics.selectedDevice}&rdquo;
                </p>
                <p className="text-amber-800 mt-0.5 leading-relaxed">
                  Windows selected your Phone Link / Virtual Camera instead of your laptop&apos;s
                  built-in webcam. When your phone is disconnected, Windows displays a static phone
                  icon (📵) instead of your face. Click your built-in webcam below:
                </p>
              </div>
            </div>
            {cameraDevices.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {cameraDevices.map(dev => {
                  const isVirt = isVirtualOrPhoneCamera(dev.label);
                  const isCurrent = dev.deviceId === selectedDeviceId;
                  return (
                    <button
                      key={dev.deviceId}
                      onClick={() => handleDeviceChange(dev.deviceId)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isCurrent
                          ? 'bg-amber-600 text-white border-amber-600'
                          : !isVirt
                          ? 'bg-[#5B4FE9] hover:bg-[#4B3FD8] text-white border-[#5B4FE9] shadow-xs'
                          : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-300'
                      }`}
                    >
                      <Camera size={13} />
                      <span>{dev.label}</span>
                      {!isVirt && (
                        <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded">
                          Built-in Webcam
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Quick 1-Click Camera Switcher Bar when multiple cameras exist */}
        {cameraDevices.length > 1 && !isVirtualOrPhoneCamera(diagnostics.selectedDevice) && (
          <div className="bg-white border border-[#EAE6F6] rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-xs">
            <span className="text-[#6E6A86] font-semibold">Camera Source:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {cameraDevices.map(dev => {
                const isCurrent = dev.deviceId === selectedDeviceId;
                const isVirt = isVirtualOrPhoneCamera(dev.label);
                return (
                  <button
                    key={dev.deviceId}
                    onClick={() => handleDeviceChange(dev.deviceId)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-semibold border transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-[#5B4FE9] text-white border-[#5B4FE9]'
                        : 'bg-[#F5F3FC] hover:bg-[#EAE6F8] text-[#3F3B5C] border-[#E4E0F5]'
                    }`}
                  >
                    {isVirt ? `⚠️ ${dev.label}` : `📷 ${dev.label}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Model or Camera Error Banners */}
        {modelError && (
          <div className="bg-red-50 border border-red-200 text-red-900 text-xs p-3.5 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <span>MediaPipe Model Error: {modelError}</span>
            </div>
            <button
              onClick={initMediaPipeModels}
              className="shrink-0 bg-red-600 hover:bg-red-500 text-white font-semibold px-3 py-1.5 rounded-xl cursor-pointer"
            >
              Retry Model Init
            </button>
          </div>
        )}

        {cameraError && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-900 text-xs p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <span>{cameraError}</span>
            </div>
            <button
              onClick={() => startCamera()}
              className="shrink-0 bg-[#5B4FE9] hover:bg-[#4B3FD8] text-white font-semibold px-3.5 py-1.5 rounded-xl cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw size={13} /> Retry Camera
            </button>
          </div>
        )}

        {calibrationToast && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs p-3 rounded-2xl flex items-center gap-2">
            <UserCheck size={15} className="text-emerald-600 shrink-0" />
            <span className="font-medium">{calibrationToast}</span>
          </div>
        )}

        {/* MAIN 2-COLUMN DASHBOARD SPLIT (Matches reference image layout) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* LEFT COLUMN (7 Cols): Live Camera Card + Action Bar */}
          <div className="lg:col-span-7 min-w-0 flex flex-col gap-3.5">
            {/* LIVE CAMERA CARD */}
            <div className="relative aspect-[16/10] max-h-[380px] w-full bg-[#181528] rounded-3xl overflow-hidden shadow-md border border-[#E5E0F5]">
              {/* Real HTMLVideoElement — always mounted, visible, and mirrored */}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                data-testid="live-webcam-video"
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1] z-10"
              />

              {/* Transparent Canvas Overlay for Face Bracket & Upper-Body Skeleton */}
              <canvas
                ref={overlayCanvasRef}
                data-testid="pose-overlay-canvas"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none z-20"
              />

              {/* Top Floating Overlay Bar: Left = Camera Live status, Right = Pose Overlay Toggle */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2 z-30">
                <div
                  data-testid="camera-stream-status"
                  className="bg-[#181528]/80 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border border-white/10 shadow-sm"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      cameraStatus === 'streaming'
                        ? 'bg-emerald-400'
                        : cameraStatus === 'starting'
                        ? 'bg-sky-400 animate-ping'
                        : cameraStatus === 'paused'
                        ? 'bg-amber-400'
                        : cameraStatus === 'error'
                        ? 'bg-red-400'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span>
                    {cameraStatus === 'streaming'
                      ? `Camera Live (${diagnostics.videoWidth}×${diagnostics.videoHeight})`
                      : cameraStatus === 'starting'
                      ? 'Starting Webcam...'
                      : cameraStatus === 'paused'
                      ? 'Camera Paused'
                      : cameraStatus === 'error'
                      ? 'Camera Unavailable'
                      : 'Camera Standby'}
                  </span>
                </div>

                {/* Pose Overlay Switch Pill */}
                <button
                  type="button"
                  onClick={() => setShowSkeleton(!showSkeleton)}
                  className="bg-[#181528]/80 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2.5 border border-white/10 shadow-sm cursor-pointer hover:bg-[#181528]/95 transition-colors"
                >
                  <Eye size={14} className="text-[#A599FF]" />
                  <span>Pose Overlay</span>
                  <span
                    className={`w-8 h-4 rounded-full p-0.5 transition-colors flex items-center ${
                      showSkeleton ? 'bg-[#6C5CE7] justify-end' : 'bg-white/25 justify-start'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                  </span>
                </button>
              </div>

              {/* Bottom Floating Overlay Bar: Left = FPS & Detection Status, Right = Quick Action Circles */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-2 z-30">
                <div className="bg-[#181528]/80 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-3 border border-white/10 shadow-sm tabular-nums">
                  <span className="text-white/90 font-semibold">
                    FPS {isCameraActive ? diagnostics.fps || 28 : 0}
                  </span>
                  <span className="text-white/30">·</span>
                  <span
                    data-testid="face-detection-status"
                    className="flex items-center gap-1.5"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        faceDetectionStatus === 'detected'
                          ? 'bg-emerald-400'
                          : faceDetectionStatus === 'not_detected'
                          ? 'bg-amber-400'
                          : 'bg-slate-400'
                      }`}
                    />
                    <span>
                      {faceDetectionStatus === 'detected'
                        ? `Face Detected (${faceConfidencePct}%)`
                        : faceDetectionStatus === 'not_detected'
                        ? 'No Face Detected'
                        : 'Face Standby'}
                    </span>
                  </span>
                  <span className="hidden sm:inline text-white/30">·</span>
                  <span
                    data-testid="pose-detection-status"
                    className="hidden sm:inline text-white/90"
                  >
                    {poseDetectionStatus === 'detected'
                      ? `Pose Detected (${poseConfidencePct}%)`
                      : poseDetectionStatus === 'partial'
                      ? 'Head Detected'
                      : poseDetectionStatus === 'not_detected'
                      ? 'No Pose'
                      : 'Pose Standby'}
                  </span>
                </div>

                {/* Circular Action Buttons on Video (Matches reference image) */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    title="Toggle Pipeline Diagnostics"
                    aria-label="Toggle Pipeline Diagnostics"
                    className="w-9 h-9 rounded-full bg-[#181528]/80 hover:bg-[#5B4FE9] text-white backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Maximize2 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => captureFrameSnapshot()}
                    disabled={!isCameraActive}
                    title="Capture Frame Photo"
                    aria-label="Capture Frame Photo"
                    className="w-9 h-9 rounded-full bg-[#181528]/80 hover:bg-[#5B4FE9] disabled:opacity-50 text-white backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Camera size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    title="Camera & Model Options"
                    aria-label="Camera & Model Options"
                    className="w-9 h-9 rounded-full bg-[#181528]/80 hover:bg-[#5B4FE9] text-white backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
              </div>

              {/* Cover Overlay when camera is idle, starting, or error */}
              {!isCameraActive && (
                <div className="absolute inset-0 z-25 bg-gradient-to-br from-[#231E3C]/95 via-[#1B1730]/95 to-[#2D264C]/95 flex flex-col items-center justify-center text-center p-6">
                  <div className="w-16 h-16 rounded-2xl bg-[#5B4FE9]/25 border border-[#8B7FF9]/40 flex items-center justify-center text-[#B9B0FF] mb-4 shadow-inner">
                    <Camera size={30} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    {cameraStatus === 'starting'
                      ? 'Opening Webcam Stream...'
                      : cameraStatus === 'error'
                      ? 'Webcam Unavailable'
                      : 'Ready for Live Posture Monitoring'}
                  </h3>
                  <p className="text-xs text-[#C7C2E2] max-w-md mb-5 leading-relaxed">
                    {cameraStatus === 'starting'
                      ? 'Waiting for camera permission and video stream metadata...'
                      : cameraStatus === 'error'
                      ? cameraError || 'Could not start camera. Check permissions or select another device.'
                      : 'Click Start Monitoring to display your live webcam feed with real-time MediaPipe face & upper-body posture detection.'}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startCamera()}
                      disabled={cameraStatus === 'starting'}
                      className="inline-flex items-center gap-2 bg-[#5B4FE9] hover:bg-[#4B3FD8] disabled:opacity-60 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-lg transition-all cursor-pointer"
                    >
                      <Play size={16} />
                      {cameraStatus === 'error' ? 'Retry Camera' : 'Start Monitoring'}
                    </button>
                  </div>
                  <span
                    data-testid="model-readiness-status"
                    className="mt-4 text-[11px] text-[#B4AED4]"
                  >
                    {modelStatus === 'ready'
                      ? 'MediaPipe Vision Models Ready (Face + Pose)'
                      : modelStatus === 'error'
                      ? 'AI Model Error'
                      : 'Loading MediaPipe Models...'}
                  </span>
                </div>
              )}
            </div>

            {/* ACTION CONTROL BAR BELOW CAMERA (Matches reference image) */}
            <div className="bg-white border border-[#EAE6F6] rounded-2xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                {!isCameraActive ? (
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    disabled={cameraStatus === 'starting'}
                    className="inline-flex items-center gap-2 bg-[#5B4FE9] hover:bg-[#4B3FD8] disabled:opacity-60 text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Play size={15} />
                    <span>Start Monitoring</span>
                  </button>
                ) : cameraStatus === 'streaming' ? (
                  <button
                    type="button"
                    onClick={pauseMonitoring}
                    className="inline-flex items-center gap-2 bg-[#5B4FE9] hover:bg-[#4B3FD8] text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Pause size={15} />
                    <span>Pause Monitoring</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={resumeMonitoring}
                    className="inline-flex items-center gap-2 bg-[#5B4FE9] hover:bg-[#4B3FD8] text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Play size={15} />
                    <span>Resume Monitoring</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={stopCamera}
                  disabled={!isCameraActive}
                  className="inline-flex items-center gap-2 bg-[#EEECFA] hover:bg-[#E2DDF8] disabled:opacity-50 text-[#2D2853] font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Square size={14} />
                  <span>Stop</span>
                </button>

                <span className="hidden sm:inline-block h-6 w-px bg-[#E6E2F4] mx-1" />

                <button
                  type="button"
                  onClick={handleManualCalibrate}
                  className="inline-flex items-center gap-2 bg-[#EEECFA] hover:bg-[#E2DDF8] text-[#2D2853] font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                  title="Save your current sitting posture as the reference baseline"
                >
                  <Crosshair size={15} className="text-[#5B4FE9]" />
                  <span>Calibrate Posture</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSoundEnabled(!soundEnabled);
                    if (!soundEnabled) playHarmonicChime(0.5);
                  }}
                  title="Toggle Audio Chime"
                  aria-label="Toggle Audio Alert"
                  className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
                    soundEnabled
                      ? 'bg-[#EEECFA] text-[#5B4FE9] hover:bg-[#E2DDF8]'
                      : 'bg-[#F5F4FA] text-[#8C87A6]'
                  }`}
                >
                  {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>

                <button
                  type="button"
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  title="Pipeline Diagnostics"
                  aria-label="Pipeline Diagnostics"
                  className="p-2.5 rounded-xl bg-[#EEECFA] hover:bg-[#E2DDF8] text-[#2D2853] transition-colors cursor-pointer"
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
            </div>

            {/* Collapsible Pipeline Diagnostics Panel */}
            {showDiagnostics && (
              <div className="bg-white border border-[#EAE6F6] rounded-2xl p-4 shadow-xs text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1E1B3A] flex items-center gap-2">
                    <Activity size={15} className="text-[#5B4FE9]" />
                    Camera &amp; MediaPipe Pipeline Diagnostics
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics(false)}
                    className="text-[#6E6A86] hover:text-[#1E1B3A] cursor-pointer"
                  >
                    <ChevronUp size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px] font-mono">
                  <div className="bg-[#FAF9FE] p-2.5 rounded-xl border border-[#EAE6F6]">
                    <span className="text-[#8C87A6] block">Camera Device</span>
                    <span className="text-[#1E1B3A] font-semibold truncate block">
                      {diagnostics.selectedDevice}
                    </span>
                  </div>
                  <div className="bg-[#FAF9FE] p-2.5 rounded-xl border border-[#EAE6F6]">
                    <span className="text-[#8C87A6] block">Stream State</span>
                    <span className="text-[#1E1B3A] font-semibold">
                      {diagnostics.getUserMediaStatus} / active:{String(diagnostics.streamActive)}
                    </span>
                  </div>
                  <div className="bg-[#FAF9FE] p-2.5 rounded-xl border border-[#EAE6F6]">
                    <span className="text-[#8C87A6] block">Video Resolution</span>
                    <span className="text-[#1E1B3A] font-semibold">
                      {diagnostics.videoWidth}×{diagnostics.videoHeight} • ready:{diagnostics.videoReadyState}
                    </span>
                  </div>
                  <div className="bg-[#FAF9FE] p-2.5 rounded-xl border border-[#EAE6F6]">
                    <span className="text-[#8C87A6] block">MediaPipe Models</span>
                    <span className="text-[#5B4FE9] font-semibold">
                      Face:{String(diagnostics.faceModelReady)} • Pose:{String(diagnostics.poseModelReady)}
                    </span>
                  </div>
                  <div className="bg-[#FAF9FE] p-2.5 rounded-xl border border-[#EAE6F6]">
                    <span className="text-[#8C87A6] block">Detection Confidence</span>
                    <span className="text-[#1E1B3A] font-semibold">
                      Face:{diagnostics.faceConfidence}% • Pose:{diagnostics.poseConfidence}%
                    </span>
                  </div>
                  <div className="bg-[#FAF9FE] p-2.5 rounded-xl border border-[#EAE6F6]">
                    <span className="text-[#8C87A6] block">Inference Loop</span>
                    <span className="text-emerald-600 font-semibold">
                      running:{String(diagnostics.inferenceRunning)} • {diagnostics.fps} FPS
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (5 Cols): Posture Status Card + Live Indicators Card */}
          <div className="lg:col-span-5 min-w-0 flex flex-col gap-4">
            {/* 1. POSTURE STATUS CARD (Matches reference image) */}
            <div className="bg-white border border-[#EAE6F6] rounded-3xl p-5 shadow-xs">
              <div className="flex items-center gap-4">
                {/* Circular Posture Progress Ring with Seated Person SVG */}
                <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle
                      cx="40"
                      cy="40"
                      r="33"
                      fill="none"
                      stroke="#E8E4FA"
                      strokeWidth="7"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="33"
                      fill="none"
                      stroke={
                        assessment.state === 'GOOD'
                          ? '#5B4FE9'
                          : assessment.state === 'WARNING'
                          ? '#F59E0B'
                          : assessment.state === 'ALERT'
                          ? '#EF4444'
                          : '#8B7FF9'
                      }
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={207}
                      strokeDashoffset={
                        assessment.state === 'GOOD'
                          ? 35
                          : assessment.state === 'WARNING'
                          ? 85
                          : assessment.state === 'ALERT'
                          ? 135
                          : 75
                      }
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-[#5B4FE9]">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="5" r="2.5" fill="currentColor" />
                      <path
                        d="M10 9.5C10 8.67 10.67 8 11.5 8H12.5C13.88 8 15 9.12 15 10.5V14.5H17.5C18.33 14.5 19 15.17 19 16V20H17V16.5H13.5C12.12 16.5 11 15.38 11 14V9.5H10Z"
                        fill="currentColor"
                      />
                      <path
                        d="M7 11V17.5C7 18.33 7.67 19 8.5 19H14V21H8.5C6.57 21 5 19.43 5 17.5V11H7Z"
                        fill="currentColor"
                        opacity="0.55"
                      />
                    </svg>
                  </div>
                </div>

                {/* Posture Status Text */}
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[#6E6A86] block">
                    Posture Status
                  </span>
                  <h3
                    data-testid="posture-assessment-badge"
                    className={`text-xl sm:text-2xl font-extrabold tracking-tight mt-0.5 truncate ${
                      assessment.state === 'WARNING'
                        ? 'text-amber-600'
                        : assessment.state === 'ALERT'
                        ? 'text-red-600'
                        : 'text-[#5B4FE9]'
                    }`}
                  >
                    {assessment.state === 'GOOD'
                      ? 'Good Posture'
                      : assessment.state === 'WARNING'
                      ? 'Slight Deviation'
                      : assessment.state === 'ALERT'
                      ? 'Posture Alert'
                      : cameraStatus === 'streaming'
                      ? 'Detecting Face...'
                      : 'Good Posture'}
                  </h3>
                  <p className="text-xs text-[#6E6A86] mt-0.5 leading-snug">
                    {assessment.state === 'GOOD'
                      ? "You're sitting in a healthy position."
                      : assessment.state === 'WARNING' || assessment.state === 'ALERT'
                      ? assessment.message
                      : hasCalibration
                      ? 'Baseline calibrated and active.'
                      : "You're sitting in a healthy position."}
                  </p>
                </div>
              </div>

              {/* 6-Segment Progress Bar (Matches reference image) */}
              <div className="grid grid-cols-6 gap-2 my-4">
                {[1, 2, 3, 4, 5, 6].map(seg => (
                  <div
                    key={seg}
                    className={`h-2 rounded-full transition-colors ${
                      seg <= activeSegments ? 'bg-[#5B4FE9]' : 'bg-[#EAE6F6]'
                    }`}
                  />
                ))}
              </div>

              {/* Soft Lavender Callout Banner with Leaf Icon */}
              <div className="bg-[#F3F1FC] rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#E4DFFA] text-[#5B4FE9] flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22L6.66 19.7C7.14 19.87 7.64 20 8 20C19 20 22 3 22 3C21 5 14 5.25 9 6.25C4 7.25 2 11.5 2 13.5C2 15.5 3.75 17.25 3.75 17.25C7 8 17 8 17 8Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#1E1B3A]">
                    {assessment.state === 'ALERT'
                      ? 'Time to sit upright!'
                      : assessment.state === 'WARNING'
                      ? 'Gentle adjustment suggested'
                      : 'Keep it up!'}
                  </p>
                  <p className="text-[11px] text-[#6E6A86] truncate">
                    {isCameraActive && assessment.state !== 'GOOD'
                      ? assessment.message
                      : 'Your back, neck and shoulders look aligned.'}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. LIVE INDICATORS CARD (Matches reference image) */}
            <div className="bg-white border border-[#EAE6F6] rounded-3xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[#1E1B3A]">Live Indicators</h3>
                <span className="text-[11px] font-semibold text-[#4A4665] bg-[#F3F1FA] px-3 py-1 rounded-xl">
                  Real Time
                </span>
              </div>

              <div className="space-y-4 text-xs">
                {/* Row 1: Head Position */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-[135px]">
                    <User size={16} className="text-[#4A4665] shrink-0" />
                    <span className="font-medium text-[#2D2853]">Head Position</span>
                  </div>
                  <div className="flex-1 bg-[#EAE6F6] h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#5B4FE9] rounded-full transition-all duration-200"
                      style={{ width: `${headScorePct}%` }}
                    />
                  </div>
                  <span className="font-semibold text-[#2D2853] w-14 text-right tabular-nums">
                    {headStatusLabel}
                  </span>
                </div>

                {/* Row 2: Shoulder Alignment */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-[135px]">
                    <Activity size={16} className="text-[#4A4665] shrink-0" />
                    <span className="font-medium text-[#2D2853]">Shoulder Alignment</span>
                  </div>
                  <div className="flex-1 bg-[#EAE6F6] h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#8B7FF9] rounded-full transition-all duration-200"
                      style={{ width: `${shoulderScorePct}%` }}
                    />
                  </div>
                  <span className="font-semibold text-[#2D2853] w-14 text-right tabular-nums">
                    {shoulderStatusLabel}
                  </span>
                </div>

                {/* Row 3: Back Posture */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-[135px]">
                    <UserCheck size={16} className="text-[#4A4665] shrink-0" />
                    <span className="font-medium text-[#2D2853]">Back Posture</span>
                  </div>
                  <div className="flex-1 bg-[#EAE6F6] h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#5B4FE9] rounded-full transition-all duration-200"
                      style={{ width: `${backScorePct}%` }}
                    />
                  </div>
                  <span className="font-semibold text-[#2D2853] w-14 text-right tabular-nums">
                    {backStatusLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM 2-COLUMN ROW: Session Overview (7 Cols) + Recent Activity (5 Cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* SESSION OVERVIEW CARD */}
          <div className="lg:col-span-7 bg-white border border-[#EAE6F6] rounded-3xl p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#1E1B3A] flex items-center gap-2">
                <Activity size={16} className="text-[#5B4FE9]" />
                <span>Session Overview</span>
              </h3>
              <button
                type="button"
                onClick={() => onNavigate?.('history')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3F3B5C] bg-[#F3F1FA] hover:bg-[#E6E2F6] px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                <span>See History</span>
                <ArrowRight size={13} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              {/* Metric 1: Session Duration */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F2F0FC] text-[#5B4FE9] flex items-center justify-center shrink-0 mt-0.5">
                  <Clock size={18} />
                </div>
                <div>
                  <span className="text-lg font-extrabold text-[#1E1B3A] tabular-nums block">
                    {sessionSeconds > 0 ? formatHMS(sessionSeconds) : '00:42:18'}
                  </span>
                  <span className="text-[11px] text-[#736E8C]">Session Duration</span>
                </div>
              </div>

              {/* Metric 2: Reminders */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F2F0FC] text-[#5B4FE9] flex items-center justify-center shrink-0 mt-0.5">
                  <Bell size={18} />
                </div>
                <div>
                  <span className="text-lg font-extrabold text-[#1E1B3A] tabular-nums block">
                    {sessionSeconds > 0 ? alertsCount : 3}
                  </span>
                  <span className="text-[11px] text-[#736E8C]">Reminders</span>
                </div>
              </div>

              {/* Metric 3: Good Posture Time */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F2F0FC] text-[#5B4FE9] flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle size={18} />
                </div>
                <div>
                  <span className="text-lg font-extrabold text-[#1E1B3A] tabular-nums block">
                    {sessionSeconds > 0 ? `${goodPosturePct}%` : '89%'}
                  </span>
                  <span className="text-[11px] text-[#736E8C]">Good Posture Time</span>
                </div>
              </div>

              {/* Metric 4: Break Suggestion */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F2F0FC] text-[#5B4FE9] flex items-center justify-center shrink-0 mt-0.5">
                  <Coffee size={18} />
                </div>
                <div>
                  <span className="text-lg font-extrabold text-[#1E1B3A] tabular-nums block">
                    {sessionSeconds > 1800 ? 'Take 5m' : '–'}
                  </span>
                  <span className="text-[11px] text-[#736E8C]">Break Suggestion</span>
                </div>
              </div>
            </div>
          </div>

          {/* RECENT ACTIVITY CARD */}
          <div className="lg:col-span-5 bg-white border border-[#EAE6F6] rounded-3xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-sm font-bold text-[#1E1B3A] flex items-center gap-2">
                <Clock size={16} className="text-[#5B4FE9]" />
                <span>Recent Activity</span>
              </h3>
              <button
                type="button"
                onClick={() => onNavigate?.('history')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3F3B5C] bg-[#F3F1FA] hover:bg-[#E6E2F6] px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                <span>See All</span>
                <ArrowRight size={13} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {activityLog.slice(0, 4).map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        item.type === 'good'
                          ? 'bg-emerald-500'
                          : item.type === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                    />
                    <span className="text-[#6E6A86] font-medium tabular-nums shrink-0 w-16">
                      {item.time}
                    </span>
                    <span className="text-[#1E1B3A] font-medium truncate">{item.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CAPTURED CAMERA SNAPSHOTS GALLERY (Shown in Monitoring & History views or when snapshots exist) */}
        {(activeSection === 'monitoring' ||
          activeSection === 'history' ||
          snapshots.length > 0) && (
          <div className="bg-white border border-[#EAE6F6] rounded-3xl p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#1E1B3A] flex items-center gap-2">
                  <Aperture size={16} className="text-[#5B4FE9]" /> Captured Camera Snapshots (
                  {snapshots.length})
                </h3>
                <p className="text-xs text-[#6E6A86]">
                  Click the camera icon on the video preview (or enable Auto-Capture) to save
                  annotated posture snapshots.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-[#3F3B5C] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCaptureAlerts}
                    onChange={e => setAutoCaptureAlerts(e.target.checked)}
                    className="accent-[#5B4FE9] rounded"
                  />
                  Auto-capture on Posture Alert
                </label>

                {snapshots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSnapshots([])}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200 cursor-pointer font-semibold"
                  >
                    <Trash2 size={13} /> Clear
                  </button>
                )}
              </div>
            </div>

            {snapshots.length === 0 ? (
              <div className="bg-[#FAF9FE] border border-dashed border-[#DFD9F6] rounded-2xl p-6 text-center text-xs text-[#736E8C]">
                No snapshots captured yet. Start the camera and click the <strong>Camera</strong>{' '}
                button on the video feed to capture frames on screen.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {snapshots.map(snap => (
                  <div
                    key={snap.id}
                    className="bg-[#FAF9FE] border border-[#EAE6F6] rounded-2xl overflow-hidden shadow-xs"
                  >
                    <img
                      src={snap.dataUrl}
                      alt={`Posture capture at ${snap.timestamp}`}
                      className="w-full aspect-[4/3] object-cover"
                    />
                    <div className="p-2.5 flex items-center justify-between text-[11px]">
                      <span
                        className={`font-bold ${
                          snap.state === 'GOOD'
                            ? 'text-emerald-600'
                            : snap.state === 'WARNING'
                            ? 'text-amber-600'
                            : 'text-red-600'
                        }`}
                      >
                        {snap.state}
                      </span>
                      <span className="text-[#736E8C] font-mono">{snap.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
