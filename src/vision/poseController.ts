import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { CameraStatus, LeanInputState, SkyLane } from '../types/game';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const READY_HOLD_SECONDS = 1.5;

// Comfortable, symmetric 3-lane hysteresis where Center stays relaxed and predictable
const LANE_ENTER_THRESHOLD = 0.34;
const LANE_EXIT_THRESHOLD = 0.20;

/**
 * Real-time webcam + MediaPipe PoseLandmarker head-position controller.
 * - Tracks nose (0) + shoulders (11, 12) for scale & crowd filtering.
 * - Crowd filter locks onto the largest, most centered person in frame.
 * - Anchors Center Lane cleanly at the middle of the camera frame (x = 0.5)
 *   unless explicitly recalibrated (clamped safely near center).
 * - Maps head horizontal position cleanly to 3 sky lanes: Left (-1), Center (0), Right (+1),
 *   and renders matching lane divider guides on the live preview canvas.
 */
export class PoseController {
  private landmarker: PoseLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private status: CameraStatus = 'initializing';
  private errorMsg = '';
  private destroyed = false;

  private lastVideoTime = -1;
  private lastTickMs = performance.now();

  // Calibrated neutral head baseline (mirrored X in [0..1])
  private baselineHeadX = 0.5;
  private baselineSpan = 0.22;
  private calibrated = true;

  // Smoothed head position & active lane
  private smoothX = 0;
  private currentLane: SkyLane = 0;
  private readyHold = 0;
  private lastResultLandmarks: NormalizedLandmark[][] = [];
  private lockedIndex = -1;

  // Fallback touch/swipe lane override
  private virtualLane: SkyLane | null = null;

  private onStatusChange?: (status: CameraStatus, message: string) => void;

  public readonly state: LeanInputState = {
    x: 0,
    y: 0,
    targetLane: 0,
    burnerOn: false,
    venting: false,
    personDetected: false,
    calibrated: true,
    readyProgress: 0,
    trackedSpan: 0,
    peopleCount: 0,
  };

  constructor(onStatusChange?: (status: CameraStatus, message: string) => void) {
    this.onStatusChange = onStatusChange;
  }

  public attachPreviewCanvas(canvas: HTMLCanvasElement | null): void {
    this.previewCanvas = canvas;
  }

  /**
   * Exposes the live webcam video element so the post-game photo booth can
   * render and capture the player's photo without opening a competing stream.
   */
  public getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  /**
   * Touch/click/swipe fallback for 3-lane control when camera isn't used.
   */
  public setVirtualLane(lane: SkyLane | null): void {
    this.virtualLane = lane;
  }

  public stepVirtualLane(delta: -1 | 1): void {
    const base = this.virtualLane ?? this.currentLane;
    const next = Math.max(-1, Math.min(1, base + delta)) as SkyLane;
    this.virtualLane = next;
  }

  public getStatus(): { status: CameraStatus; errorMsg: string } {
    return { status: this.status, errorMsg: this.errorMsg };
  }

  private updateStatus(status: CameraStatus, message = ''): void {
    this.status = status;
    this.errorMsg = message;
    this.onStatusChange?.(status, message);
  }

  public async init(): Promise<void> {
    this.updateStatus('initializing', 'Starting camera & head sensor...');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.updateStatus(
        'unavailable',
        'NO CAMERA — USE TOUCH LANES'
      );
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.updateStatus(
          'denied',
          'CAMERA PERMISSION DENIED — TAP START FLIGHT FOR TOUCH LANES'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        this.updateStatus(
          'unavailable',
          'NO CAMERA DETECTED — TAP START FLIGHT FOR TOUCH LANES'
        );
      } else {
        this.updateStatus(
          'error',
          'CAMERA UNAVAILABLE — TAP START FLIGHT FOR TOUCH LANES'
        );
      }
      return;
    }

    if (this.destroyed) {
      this.stopStream();
      return;
    }

    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.srcObject = this.stream;
    this.video = video;

    try {
      await video.play();
    } catch {
      // Resolves once metadata arrives
    }

    try {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 4,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });

      if (this.destroyed) {
        this.landmarker.close();
        this.landmarker = null;
        return;
      }

      this.updateStatus('active', '');
    } catch {
      try {
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 4,
          minPoseDetectionConfidence: 0.45,
          minPosePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
        });
        if (!this.destroyed) {
          this.updateStatus('active', '');
        }
      } catch {
        this.updateStatus(
          'error',
          'POSE SENSOR OFFLINE — TOUCH LANES ACTIVE'
        );
      }
    }
  }

  /**
   * Explicitly re-captures the locked player's head X position (clamped safely
   * near frame center so standing at center never locks an extreme edge).
   */
  public recalibrate(): void {
    if (this.lockedIndex >= 0 && this.lastResultLandmarks[this.lockedIndex]) {
      const lm = this.lastResultLandmarks[this.lockedIndex];
      const nose = lm[0];
      const lSh = lm[11];
      const rSh = lm[12];
      if (nose && lSh && rSh) {
        const mirrorHeadX = 1 - nose.x;
        const span = Math.abs(lSh.x - rSh.x);
        this.baselineHeadX = Math.max(0.35, Math.min(0.65, mirrorHeadX));
        this.baselineSpan = Math.max(0.14, Math.min(0.32, span));
        this.calibrated = true;
        this.state.calibrated = true;
        this.smoothX = 0;
        this.currentLane = 0;
        this.virtualLane = null;
        return;
      }
    }
    this.baselineHeadX = 0.5;
    this.baselineSpan = 0.22;
    this.calibrated = true;
    this.state.calibrated = true;
    this.smoothX = 0;
    this.currentLane = 0;
    this.virtualLane = null;
  }

  /**
   * Crowd filter: selects the largest, most centered person in frame.
   */
  private selectLockedPerson(poses: NormalizedLandmark[][]): number {
    if (!poses.length) return -1;
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < poses.length; i++) {
      const lm = poses[i];
      const nose = lm[0];
      const lSh = lm[11];
      const rSh = lm[12];
      if (!nose || !lSh || !rSh) continue;

      const span = Math.abs(lSh.x - rSh.x);
      if (span < 0.05) continue;

      const centerX = (lSh.x + rSh.x) * 0.5;
      const centerDist = Math.abs(centerX - 0.5);
      const centerWeight = Math.max(0.1, 1 - centerDist * 1.65);
      const score = span * centerWeight;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private getRangeX(): number {
    // Full normalized travel from Center to extreme Left/Right (~0.23 of frame width)
    return Math.max(0.18, this.baselineSpan * 1.05);
  }

  public update(isAttractMode: boolean): LeanInputState {
    const now = performance.now();
    const dt = Math.min((now - this.lastTickMs) / 1000, 0.05);
    this.lastTickMs = now;

    if (
      this.landmarker &&
      this.video &&
      this.video.readyState >= 2 &&
      this.video.currentTime !== this.lastVideoTime
    ) {
      this.lastVideoTime = this.video.currentTime;
      try {
        const result = this.landmarker.detectForVideo(this.video, now);
        this.lastResultLandmarks = result.landmarks ?? [];
        this.lockedIndex = this.selectLockedPerson(this.lastResultLandmarks);
      } catch {
        // Ignore transient video frame decode hiccup
      }
    }

    let targetX = 0;

    if (this.virtualLane !== null) {
      this.currentLane = this.virtualLane;
      targetX = this.virtualLane;
      this.state.personDetected = false;
      this.readyHold = 0;
    } else if (this.lockedIndex >= 0 && this.lastResultLandmarks[this.lockedIndex]) {
      const lm = this.lastResultLandmarks[this.lockedIndex];
      const nose = lm[0];
      const lSh = lm[11];
      const rSh = lm[12];

      if (nose && lSh && rSh) {
        this.state.personDetected = true;
        this.state.peopleCount = this.lastResultLandmarks.length;

        const span = Math.abs(lSh.x - rSh.x);
        this.state.trackedSpan = span;

        // Track pure mirrored head X relative to center baseline (smooth, 1:1 with preview)
        const mirrorHeadX = 1 - nose.x;
        const rangeX = this.getRangeX();
        const rawX = (mirrorHeadX - this.baselineHeadX) / rangeX;
        targetX = Math.max(-1, Math.min(1, rawX));

        // Ready stance hold in Attract Mode when head is inside the Center Lane zone
        if (isAttractMode) {
          const inCenterZone = Math.abs(rawX) <= LANE_ENTER_THRESHOLD && span > 0.08;
          if (inCenterZone) {
            this.readyHold = Math.min(READY_HOLD_SECONDS, this.readyHold + dt);
          } else {
            this.readyHold = Math.max(0, this.readyHold - dt * 1.5);
          }
        } else {
          this.readyHold = 0;
        }
      }
    } else {
      this.state.personDetected = false;
      this.state.peopleCount = 0;
      this.state.trackedSpan = 0;
      this.readyHold = Math.max(0, this.readyHold - dt * 2);
    }

    // Smooth responsive exponential filter for head X
    const alpha = 1 - Math.exp(-20 * dt);
    this.smoothX += (targetX - this.smoothX) * alpha;
    this.state.x = Math.max(-1, Math.min(1, this.smoothX));
    this.state.y = 0;

    // 3-Lane selection with comfortable hysteresis matching preview zone lines
    if (this.virtualLane === null) {
      if (this.currentLane === 0) {
        if (this.state.x < -LANE_ENTER_THRESHOLD) this.currentLane = -1;
        else if (this.state.x > LANE_ENTER_THRESHOLD) this.currentLane = 1;
      } else if (this.currentLane === -1) {
        if (this.state.x > LANE_ENTER_THRESHOLD) this.currentLane = 1;
        else if (this.state.x > -LANE_EXIT_THRESHOLD) this.currentLane = 0;
      } else {
        if (this.state.x < -LANE_ENTER_THRESHOLD) this.currentLane = -1;
        else if (this.state.x < LANE_EXIT_THRESHOLD) this.currentLane = 0;
      }
    }

    this.state.targetLane = this.currentLane;
    this.state.calibrated = this.calibrated;
    this.state.burnerOn = false;
    this.state.venting = false;
    this.state.readyProgress = this.readyHold / READY_HOLD_SECONDS;

    this.drawPreview();
    return this.state;
  }

  private drawPreview(): void {
    const canvas = this.previewCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (this.video && this.video.readyState >= 2) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.restore();

      ctx.fillStyle = 'rgba(7, 21, 46, 0.2)';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#07152e';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#67e8f9';
      ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CAMERA STANDBY', w / 2, h / 2);
      return;
    }

    // Exact pixel boundaries matching Center Lane thresholds 1:1
    const rangeX = this.getRangeX();
    const leftEdgeNorm = Math.max(0.08, this.baselineHeadX - rangeX * LANE_ENTER_THRESHOLD);
    const rightEdgeNorm = Math.min(0.92, this.baselineHeadX + rangeX * LANE_ENTER_THRESHOLD);
    const leftEdgeX = leftEdgeNorm * w;
    const rightEdgeX = rightEdgeNorm * w;

    // Highlight active lane zone (Left / Center / Right)
    if (this.state.targetLane === -1) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
      ctx.fillRect(0, 0, leftEdgeX, h);
    } else if (this.state.targetLane === 0) {
      ctx.fillStyle = 'rgba(52, 211, 153, 0.15)';
      ctx.fillRect(leftEdgeX, 0, rightEdgeX - leftEdgeX, h);
    } else {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
      ctx.fillRect(rightEdgeX, 0, w - rightEdgeX, h);
    }

    // Draw exact 3-lane vertical boundary lines
    ctx.save();
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    [leftEdgeX, rightEdgeX].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x, h - 8);
      ctx.stroke();
    });
    ctx.restore();

    // Subtle Center tick at baselineHeadX
    const centerTickX = this.baselineHeadX * w;
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerTickX, h - 12);
    ctx.lineTo(centerTickX, h - 2);
    ctx.stroke();

    // Draw dim silhouettes for background people
    for (let i = 0; i < this.lastResultLandmarks.length; i++) {
      if (i === this.lockedIndex) continue;
      const lm = this.lastResultLandmarks[i];
      const nose = lm[0];
      if (!nose) continue;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((1 - nose.x) * w, nose.y * h, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw locked foreground head tracking reticle
    if (this.lockedIndex >= 0 && this.lastResultLandmarks[this.lockedIndex]) {
      const lm = this.lastResultLandmarks[this.lockedIndex];
      const nose = lm[0];
      if (nose) {
        const nx = (1 - nose.x) * w;
        const ny = nose.y * h;
        const accent = this.state.targetLane === 0 ? '#34d399' : '#facc15';

        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(nx, ny, 17, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(nx, ny, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  public dispose(): void {
    this.destroyed = true;
    this.stopStream();
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}
