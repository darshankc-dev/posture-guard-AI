/**
 * Real-time Face & Upper-Body Posture Analysis Engine.
 * Evaluates MediaPipe Pose landmarks (Nose, Eyes, Ears, Shoulders) from live webcam video.
 */

export type PostureState = 'UNASSESSED' | 'GOOD' | 'WARNING' | 'ALERT';
export type DeviationType =
  | 'none'
  | 'forward_head'
  | 'slouching'
  | 'leaning_forward'
  | 'shoulder_tilt'
  | 'head_tilt'
  | 'off_center';

export interface CalibrationData {
  neckLengthRatio: number;
  shoulderWidthNorm: number;
  shoulderTiltDeg: number;
  headTiltDeg: number;
  headForwardDropRatio: number;
  refMidShoulderY: number;
  refNoseX?: number;
  refNoseY?: number;
  refEarSpan?: number;
  isValid: boolean;
}

export interface PostureAssessmentResult {
  state: PostureState;
  primaryDeviation: DeviationType;
  message: string;
  confidence: number;
  deviationScore: number;
  timeInDeviation: number;
  metrics: {
    neckRatio: number;
    shoulderWidth: number;
    shoulderTiltDeg: number;
    headTiltDeg: number;
    forwardDrop: number;
    noseY: number;
    earSpan: number;
  };
}

export const POSTURE_MESSAGES: Record<DeviationType, string> = {
  none: 'Sitting comfortably in good posture.',
  forward_head: 'Head dropped forward — try bringing your head up into a neutral position.',
  slouching: 'Slouching detected — sit upright and raise your head and shoulders.',
  leaning_forward: 'Leaning too close to the camera — sit back comfortably.',
  shoulder_tilt: 'Your shoulders are uneven — level your shoulders.',
  head_tilt: 'Your head is tilted sideways — straighten your neck.',
  off_center: 'Leaning to the side — center yourself in front of the screen.',
};

export class WebPostureEngine {
  calibration: CalibrationData | null = null;
  sensitivity: 'low' | 'medium' | 'high' = 'medium';
  alertDelaySeconds: number = 2.0; // Fast 2-second alert when bad posture is held
  alertCooldownSeconds: number = 8.0;
  hysteresisRecoverySeconds: number = 0.4;

  currentState: PostureState = 'UNASSESSED';
  currentDeviation: DeviationType = 'none';
  deviationStartTime: number | null = null;
  goodPostureStartTime: number | null = null;
  lastAlertTime: number = 0;
  totalAlertsTriggered: number = 0;

  smoothedMetrics: Record<string, number> = {};
  emaAlpha: number = 0.45; // Responsive smoothing

  constructor(calibration?: CalibrationData) {
    if (calibration) {
      this.calibration = calibration;
    }
  }

  private applyEma(key: string, value: number): number {
    if (!(key in this.smoothedMetrics) || Number.isNaN(this.smoothedMetrics[key])) {
      this.smoothedMetrics[key] = value;
      return value;
    }
    const smoothed = this.emaAlpha * value + (1.0 - this.emaAlpha) * this.smoothedMetrics[key];
    this.smoothedMetrics[key] = smoothed;
    return smoothed;
  }

  evaluate(
    nose: [number, number, number],
    leftEar: [number, number, number],
    rightEar: [number, number, number],
    leftShoulder: [number, number, number],
    rightShoulder: [number, number, number],
    nowSec: number = Date.now() / 1000
  ): PostureAssessmentResult {
    // Check face visibility first (nose + ears)
    const faceLandmarks = [nose, leftEar, rightEar];
    const faceMinVis = Math.min(...faceLandmarks.map(l => l[2]));
    const shouldersVisible = leftShoulder[2] >= 0.35 && rightShoulder[2] >= 0.35;
    const avgVis =
      (nose[2] + leftEar[2] + rightEar[2] + leftShoulder[2] + rightShoulder[2]) / 5.0;

    if (faceMinVis < 0.35) {
      this.currentState = 'UNASSESSED';
      this.deviationStartTime = null;
      return {
        state: 'UNASSESSED',
        primaryDeviation: 'none',
        message: 'No face detected. Position yourself clearly in front of the camera.',
        confidence: avgVis,
        deviationScore: 0.0,
        timeInDeviation: 0.0,
        metrics: {
          neckRatio: 0,
          shoulderWidth: 0,
          shoulderTiltDeg: 0,
          headTiltDeg: 0,
          forwardDrop: 0,
          noseY: 0,
          earSpan: 0,
        },
      };
    }

    const [nx, ny] = nose;
    const [lex, ley] = leftEar;
    const [rex, rey] = rightEar;
    const [lsx, lsy] = leftShoulder;
    const [rsx, rsy] = rightShoulder;

    const rawEarSpan = Math.hypot(rex - lex, rey - ley);
    const rawShoulderWidth = shouldersVisible
      ? Math.hypot(rsx - lsx, rsy - lsy)
      : rawEarSpan * 2.6;

    if (rawShoulderWidth < 0.04 && rawEarSpan < 0.02) {
      this.currentState = 'UNASSESSED';
      return {
        state: 'UNASSESSED',
        primaryDeviation: 'none',
        message: 'Move closer to the camera so your face and shoulders are visible.',
        confidence: avgVis,
        deviationScore: 0.0,
        timeInDeviation: 0.0,
        metrics: {
          neckRatio: 0,
          shoulderWidth: 0,
          shoulderTiltDeg: 0,
          headTiltDeg: 0,
          forwardDrop: 0,
          noseY: 0,
          earSpan: 0,
        },
      };
    }

    const midShoulderX = shouldersVisible ? (lsx + rsx) / 2.0 : nx;
    const midShoulderY = shouldersVisible ? (lsy + rsy) / 2.0 : Math.min(0.92, ny + rawEarSpan * 1.8);
    const midEarX = (lex + rex) / 2.0;
    const midEarY = (ley + rey) / 2.0;

    const rawNeckDist = Math.hypot(midShoulderX - midEarX, midShoulderY - midEarY);
    const rawNeckRatio = rawNeckDist / Math.max(0.05, rawShoulderWidth);

    // Normalize angles so 0 degrees = horizontal level regardless of coordinate order
    const shDx = Math.abs(rsx - lsx);
    const shDy = rsy - lsy;
    const rawShoulderTilt = shouldersVisible
      ? (Math.atan2(shDy, Math.max(0.001, shDx)) * 180) / Math.PI
      : 0;

    const earDx = Math.abs(rex - lex);
    const earDy = rey - ley;
    const rawHeadTilt = (Math.atan2(earDy, Math.max(0.001, earDx)) * 180) / Math.PI;

    const rawForwardDrop = (midShoulderY - ny) / Math.max(0.05, rawShoulderWidth);

    const neckRatio = this.applyEma('neckRatio', rawNeckRatio);
    const shoulderWidthSmoothed = this.applyEma('shoulderWidth', rawShoulderWidth);
    const shoulderTilt = this.applyEma('shoulderTilt', rawShoulderTilt);
    const headTilt = this.applyEma('headTilt', rawHeadTilt);
    const forwardDrop = this.applyEma('forwardDrop', rawForwardDrop);
    const midShoulderYSmooth = this.applyEma('midShoulderY', midShoulderY);
    const noseXSmooth = this.applyEma('noseX', nx);
    const noseYSmooth = this.applyEma('noseY', ny);
    const earSpanSmooth = this.applyEma('earSpan', rawEarSpan);

    const baseNeck = this.calibration?.neckLengthRatio ?? 0.55;
    const baseSw = this.calibration?.shoulderWidthNorm ?? 0.35;
    const baseSt = this.calibration?.shoulderTiltDeg ?? 0.0;
    const baseHt = this.calibration?.headTiltDeg ?? 0.0;
    const baseDrop = this.calibration?.headForwardDropRatio ?? 0.25;
    const baseMsY = this.calibration?.refMidShoulderY ?? 0.65;
    const baseNoseX = this.calibration?.refNoseX ?? 0.50;
    const baseNoseY = this.calibration?.refNoseY ?? 0.42;
    const baseEarSpan = this.calibration?.refEarSpan ?? 0.13;

    const scalerMap = { low: 1.25, medium: 1.0, high: 0.75 };
    const scaler = scalerMap[this.sensitivity] ?? 1.0;

    const threshForwardHead = 0.16 * scaler;
    const threshSlouch = 0.08 * scaler;
    const threshLean = 0.20 * scaler;
    const threshShoulderTilt = 7.0 * scaler;
    const threshHeadTilt = 8.5 * scaler;
    const threshOffCenter = 0.18 * scaler;

    // 1. Forward head / neck compression
    const deltaNeck = (baseNeck - neckRatio) / Math.max(0.1, baseNeck);
    const deltaDrop = (baseDrop - forwardDrop) / Math.max(0.1, baseDrop);
    const forwardHeadScore = Math.max(0.0, Math.max(deltaNeck, deltaDrop));

    // 2. Slouching: shoulders or nose dropping significantly down in the frame
    const shoulderDrop = shouldersVisible ? (midShoulderYSmooth - baseMsY) / Math.max(0.1, baseMsY) : 0;
    const noseDrop = (noseYSmooth - baseNoseY) / Math.max(0.1, baseNoseY);
    const deltaSlouch = Math.max(0.0, shoulderDrop, noseDrop * 0.75);

    // 3. Leaning forward toward screen: shoulder width OR face ear-span grows significantly
    const swExpansion = (shoulderWidthSmoothed - baseSw) / Math.max(0.05, baseSw);
    const earExpansion = this.calibration?.refEarSpan
      ? (earSpanSmooth - baseEarSpan) / Math.max(0.03, baseEarSpan)
      : 0;
    const deltaLean = Math.max(0.0, swExpansion, earExpansion);

    // 4. Shoulder & Head tilt angles
    const deltaShoulderTilt = Math.abs(shoulderTilt - baseSt);
    const deltaHeadTilt = Math.abs(headTilt - baseHt);

    // 5. Off-center horizontal lean
    const deltaOffCenter = Math.abs(noseXSmooth - baseNoseX);

    let deviationCandidate: DeviationType = 'none';
    let maxSeverity = 0.0;

    if (forwardHeadScore > threshForwardHead) {
      const sev = forwardHeadScore / threshForwardHead;
      if (sev > maxSeverity) {
        maxSeverity = sev;
        deviationCandidate = 'forward_head';
      }
    }
    if (deltaSlouch > threshSlouch) {
      const sev = deltaSlouch / threshSlouch;
      if (sev > maxSeverity) {
        maxSeverity = sev;
        deviationCandidate = 'slouching';
      }
    }
    if (deltaLean > threshLean) {
      const sev = deltaLean / threshLean;
      if (sev > maxSeverity) {
        maxSeverity = sev;
        deviationCandidate = 'leaning_forward';
      }
    }
    if (deltaShoulderTilt > threshShoulderTilt) {
      const sev = deltaShoulderTilt / threshShoulderTilt;
      if (sev > maxSeverity) {
        maxSeverity = sev;
        deviationCandidate = 'shoulder_tilt';
      }
    }
    if (deltaHeadTilt > threshHeadTilt) {
      const sev = deltaHeadTilt / threshHeadTilt;
      if (sev > maxSeverity) {
        maxSeverity = sev;
        deviationCandidate = 'head_tilt';
      }
    }
    if (deltaOffCenter > threshOffCenter) {
      const sev = deltaOffCenter / threshOffCenter;
      if (sev > maxSeverity) {
        maxSeverity = sev;
        deviationCandidate = 'off_center';
      }
    }

    const hasDeviation = deviationCandidate !== 'none';
    let durationInDev = 0.0;

    if (hasDeviation) {
      this.goodPostureStartTime = null;
      if (this.deviationStartTime === null) {
        this.deviationStartTime = nowSec;
      }
      durationInDev = nowSec - this.deviationStartTime;
      if (durationInDev >= this.alertDelaySeconds) {
        this.currentState = 'ALERT';
      } else {
        this.currentState = 'WARNING';
      }
      this.currentDeviation = deviationCandidate;
    } else {
      if (this.currentState === 'WARNING' || this.currentState === 'ALERT') {
        if (this.goodPostureStartTime === null) {
          this.goodPostureStartTime = nowSec;
        }
        const recoveryDuration = nowSec - this.goodPostureStartTime;
        if (recoveryDuration < this.hysteresisRecoverySeconds) {
          durationInDev = nowSec - (this.deviationStartTime ?? nowSec);
        } else {
          this.currentState = 'GOOD';
          this.currentDeviation = 'none';
          this.deviationStartTime = null;
          this.goodPostureStartTime = null;
          durationInDev = 0.0;
        }
      } else {
        this.currentState = 'GOOD';
        this.currentDeviation = 'none';
        this.deviationStartTime = null;
        this.goodPostureStartTime = null;
        durationInDev = 0.0;
      }
    }

    const msg =
      this.currentState === 'GOOD'
        ? POSTURE_MESSAGES.none
        : POSTURE_MESSAGES[this.currentDeviation] || POSTURE_MESSAGES.none;

    return {
      state: this.currentState,
      primaryDeviation: this.currentDeviation,
      message: msg,
      confidence: avgVis,
      deviationScore: parseFloat(maxSeverity.toFixed(2)),
      timeInDeviation: parseFloat(durationInDev.toFixed(1)),
      metrics: {
        neckRatio: parseFloat(neckRatio.toFixed(3)),
        shoulderWidth: parseFloat(shoulderWidthSmoothed.toFixed(3)),
        shoulderTiltDeg: parseFloat(shoulderTilt.toFixed(1)),
        headTiltDeg: parseFloat(headTilt.toFixed(1)),
        forwardDrop: parseFloat(forwardDrop.toFixed(3)),
        noseY: parseFloat(noseYSmooth.toFixed(3)),
        earSpan: parseFloat(earSpanSmooth.toFixed(3)),
      },
    };
  }

  canTriggerAlert(nowSec: number = Date.now() / 1000): boolean {
    return nowSec - this.lastAlertTime >= this.alertCooldownSeconds;
  }

  registerAlertTriggered(nowSec: number = Date.now() / 1000): void {
    this.lastAlertTime = nowSec;
    this.totalAlertsTriggered += 1;
  }

  calibrate(
    samples: Array<{
      nose: [number, number, number];
      leftEar: [number, number, number];
      rightEar: [number, number, number];
      leftShoulder: [number, number, number];
      rightShoulder: [number, number, number];
    }>
  ): boolean {
    if (!samples || samples.length === 0) return false;
    const s = samples[0];
    const [nx, ny] = s.nose;
    const [lex, ley] = s.leftEar;
    const [rex, rey] = s.rightEar;
    const [lsx, lsy] = s.leftShoulder;
    const [rsx, rsy] = s.rightShoulder;

    const shouldersVisible = s.leftShoulder[2] >= 0.35 && s.rightShoulder[2] >= 0.35;
    const rawEarSpan = Math.hypot(rex - lex, rey - ley);
    const rawShoulderWidth = shouldersVisible
      ? Math.hypot(rsx - lsx, rsy - lsy)
      : Math.max(0.15, rawEarSpan * 2.6);

    const midShoulderX = shouldersVisible ? (lsx + rsx) / 2.0 : nx;
    const midShoulderY = shouldersVisible
      ? (lsy + rsy) / 2.0
      : Math.min(0.92, ny + rawEarSpan * 1.8);
    const midEarX = (lex + rex) / 2.0;
    const midEarY = (ley + rey) / 2.0;

    const rawNeckDist = Math.hypot(midShoulderX - midEarX, midShoulderY - midEarY);
    const neckLengthRatio = rawNeckDist / Math.max(0.05, rawShoulderWidth);

    const shDx = Math.abs(rsx - lsx);
    const shDy = rsy - lsy;
    const shoulderTiltDeg = shouldersVisible
      ? (Math.atan2(shDy, Math.max(0.001, shDx)) * 180) / Math.PI
      : 0;

    const earDx = Math.abs(rex - lex);
    const earDy = rey - ley;
    const headTiltDeg = (Math.atan2(earDy, Math.max(0.001, earDx)) * 180) / Math.PI;

    const headForwardDropRatio = (midShoulderY - ny) / Math.max(0.05, rawShoulderWidth);

    this.calibration = {
      neckLengthRatio,
      shoulderWidthNorm: rawShoulderWidth,
      shoulderTiltDeg,
      headTiltDeg,
      headForwardDropRatio,
      refMidShoulderY: midShoulderY,
      refNoseX: nx,
      refNoseY: ny,
      refEarSpan: rawEarSpan,
      isValid: true,
    };
    this.deviationStartTime = null;
    this.currentState = 'GOOD';
    this.currentDeviation = 'none';
    return true;
  }
}

export type PostureAssessment = PostureAssessmentResult;

