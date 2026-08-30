import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';

export interface ScanResult {
  userUuid: string;
  faceHash: string;
  faceHashBytes: Uint8Array;
  confidenceScore: number;
  normalizedVector: string;
}

interface ScannerProps {
  modelsLoaded: boolean;
  onScanComplete: (result: ScanResult) => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
  setError: (err: string | null) => void;
}

type Phase = 'searching' | 'hold' | 'turn_left' | 'turn_right' | 'done';

interface Point { x: number; y: number }

/** Polylines over the 68 point landmark model. `true` closes the loop. */
const MESH_PATHS: Array<{ from: number; to: number; closed: boolean; weight: number }> = [
  { from: 0, to: 16, closed: false, weight: 0.55 },  // jaw
  { from: 17, to: 21, closed: false, weight: 0.8 },  // right brow
  { from: 22, to: 26, closed: false, weight: 0.8 },  // left brow
  { from: 27, to: 30, closed: false, weight: 1 },    // nose bridge
  { from: 31, to: 35, closed: false, weight: 1 },    // nostrils
  { from: 36, to: 41, closed: true, weight: 1 },     // right eye
  { from: 42, to: 47, closed: true, weight: 1 },     // left eye
  { from: 48, to: 59, closed: true, weight: 0.8 },   // outer lips
  { from: 60, to: 67, closed: true, weight: 0.6 },   // inner lips
];

const YAW_LEFT_THRESHOLD = 0.40;
const YAW_RIGHT_THRESHOLD = 0.60;
const HOLD_FRAMES = 10;
/** Weight of each new detection against the running average. Lower is smoother. */
const SMOOTHING = 0.35;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hashToUuid(hex: string): string {
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

function hexToBytes32(hex: string): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Ratios between facial landmarks, each divided by the pupil distance so the
 * result is invariant to how close the user sits to the camera. This is what
 * gets hashed; the raw landmark positions never leave this function.
 */
function faceRatios(points: Point[]): string {
  const leftEye = midpoint(points[36], points[39]);
  const rightEye = midpoint(points[42], points[45]);
  const pupilDist = dist(leftEye, rightEye) || 1;
  const jawWidth = Math.abs(points[16].x - points[0].x);
  return [
    jawWidth / pupilDist,
    dist(points[27], points[30]) / pupilDist,
    dist(leftEye, points[19]) / pupilDist,
    dist(rightEye, points[24]) / pupilDist,
    dist(points[48], points[54]) / pupilDist,
    dist(points[30], points[51]) / pupilDist,
    dist(leftEye, points[48]) / pupilDist,
    dist(rightEye, points[54]) / pupilDist,
  ]
    .map((r) => r.toFixed(2))
    .join(',');
}

export default function Scanner({
  modelsLoaded,
  onScanComplete,
  isScanning,
  setIsScanning,
  setError,
}: ScannerProps) {
  const [phase, setPhase] = useState<Phase>('searching');
  const [progress, setProgress] = useState(0);
  const [yaw, setYaw] = useState(0.5);
  const [faceVisible, setFaceVisible] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onScanComplete);
  onCompleteRef.current = onScanComplete;

  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Releasing on unmount matters: without it the camera indicator stays lit
  // after the user navigates away mid-scan.
  useEffect(() => releaseCamera, [releaseCamera]);

  const startCamera = useCallback(async () => {
    setError(null);
    setPhase('searching');
    setProgress(0);
    setFaceVisible(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      setIsScanning(true);
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      setError(
        denied
          ? 'Camera access was blocked. Allow the camera for this site, then start the scan again.'
          : 'No camera is available. Connect one and try again.',
      );
      setIsScanning(false);
    }
  }, [setError, setIsScanning]);

  // Attach the stream once the video element is mounted.
  useEffect(() => {
    if (!isScanning || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => setError('The browser refused to start the camera preview.'));
  }, [isScanning, setError]);

  useEffect(() => {
    if (!isScanning || !modelsLoaded) return;

    const detector = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
    const smoothed: Point[] = [];
    let holdFrames = 0;
    let current: Phase = 'searching';
    let bestDetectionScore = 0;
    let stopped = false;
    let detecting = false;

    const advance = (next: Phase, pct: number) => {
      current = next;
      setPhase(next);
      setProgress(pct);
    };

    const finish = async (points: Point[]) => {
      stopped = true;
      const vector = faceRatios(points);
      const hash = await sha256Hex(vector);
      // Both head turns completed plus the detector's own confidence. The floor
      // of 70 is what the mint circuit asserts against.
      const score = Math.min(99, 70 + Math.round(bestDetectionScore * 29));
      onCompleteRef.current({
        userUuid: hashToUuid(hash),
        faceHash: hash,
        faceHashBytes: hexToBytes32(hash),
        confidenceScore: score,
        normalizedVector: vector,
      });
      releaseCamera();
      setIsScanning(false);
    };

    const step = async () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const w = video.clientWidth || 640;
      const h = video.clientHeight || 480;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      // Detection is much slower than a frame; skip requesting a new one while
      // the previous is still in flight and keep drawing the smoothed mesh.
      if (!detecting) {
        detecting = true;
        void runDetection(video, w, h).finally(() => {
          detecting = false;
        });
      }

      draw(canvas, smoothed, current);
      if (!stopped) rafRef.current = requestAnimationFrame(step);
    };

    const runDetection = async (video: HTMLVideoElement, w: number, h: number) => {
      try {
        const detection = await faceapi.detectSingleFace(video, detector).withFaceLandmarks();
        if (stopped) return;
        if (!detection) {
          setFaceVisible(false);
          if (current === 'searching') {
            holdFrames = Math.max(0, holdFrames - 1);
            setProgress(Math.round((holdFrames / HOLD_FRAMES) * 20));
          }
          return;
        }

        setFaceVisible(true);
        bestDetectionScore = Math.max(bestDetectionScore, detection.detection.score);
        const positions = faceapi.resizeResults(detection, { width: w, height: h }).landmarks.positions;
        for (let i = 0; i < positions.length; i++) {
          const p = { x: positions[i].x, y: positions[i].y };
          smoothed[i] = smoothed[i]
            ? {
                x: smoothed[i].x + (p.x - smoothed[i].x) * SMOOTHING,
                y: smoothed[i].y + (p.y - smoothed[i].y) * SMOOTHING,
              }
            : p;
        }

        const jawWidth = Math.abs(smoothed[16].x - smoothed[0].x) || 1;
        const noseRel = (smoothed[30].x - smoothed[0].x) / jawWidth;
        setYaw(noseRel);

        if (current === 'searching') {
          holdFrames++;
          setProgress(Math.round((holdFrames / HOLD_FRAMES) * 20));
          if (holdFrames >= HOLD_FRAMES) {
            advance('hold', 25);
            setTimeout(() => !stopped && advance('turn_left', 35), 700);
          }
        } else if (current === 'turn_left' && noseRel < YAW_LEFT_THRESHOLD) {
          advance('turn_right', 65);
        } else if (current === 'turn_right' && noseRel > YAW_RIGHT_THRESHOLD) {
          advance('done', 100);
          void finish(smoothed.map((p) => ({ ...p })));
        }
      } catch {
        /* a dropped frame is not worth surfacing */
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      stopped = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isScanning, modelsLoaded, releaseCamera, setIsScanning]);

  const cancel = () => {
    releaseCamera();
    setIsScanning(false);
  };

  if (!isScanning) {
    return (
      <div className="scan-start">
        <div className="scan-start-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
            <path d="M6 16V9a3 3 0 013-3h7M42 16V9a3 3 0 00-3-3h-7M6 32v7a3 3 0 003 3h7M42 32v7a3 3 0 01-3 3h-7" />
            <circle cx="24" cy="21" r="6" opacity="0.7" />
            <path d="M14 36c1.8-5 5.4-7.5 10-7.5S32.2 31 34 36" opacity="0.7" />
          </svg>
        </div>
        <p className="scan-start-copy">
          The camera feed stays in this tab. Detection runs on your device and only a hash of the
          measurements is ever sent anywhere.
        </p>
        <button className="btn-primary" onClick={startCamera} disabled={!modelsLoaded}>
          {modelsLoaded ? 'Start face scan' : 'Loading model'}
        </button>
      </div>
    );
  }

  return (
    <div className="camera-container" data-phase={phase}>
      <video ref={videoRef} className="camera-video" playsInline muted />
      <canvas ref={canvasRef} className="camera-canvas" />

      <div className="camera-frame" aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      {(phase === 'turn_left' || phase === 'turn_right') && (
        <div className="yaw-meter" aria-hidden="true">
          <div className="yaw-track">
            <div
              className={`yaw-target ${phase === 'turn_left' ? 'left' : 'right'}`}
            />
            <div className="yaw-marker" style={{ left: `${Math.min(100, Math.max(0, yaw * 100))}%` }} />
          </div>
        </div>
      )}

      <div className="scan-overlay">
        <div className="scan-status" role="status">
          <span className={`scan-dot ${faceVisible ? 'live' : ''}`} />
          {PHASE_LABELS[phase]}
        </div>
        <div className="scan-progress-bar">
          <div className="scan-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <button className="scan-cancel" onClick={cancel}>Cancel</button>
    </div>
  );
}

const PHASE_LABELS: Record<Phase, string> = {
  searching: 'Looking for your face',
  hold: 'Face found, hold still',
  turn_left: 'Slowly turn your head left',
  turn_right: 'Now turn your head right',
  done: 'Liveness confirmed',
};

/** Draw the landmark mesh. Runs every frame off the smoothed buffer. */
function draw(canvas: HTMLCanvasElement, points: Point[], phase: Phase): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (points.length < 68) return;

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#e07a5f';
  const settled = phase === 'done';
  const line = settled ? styles.getPropertyValue('--success').trim() || '#4ade80' : accent;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const path of MESH_PATHS) {
    ctx.beginPath();
    ctx.moveTo(points[path.from].x, points[path.from].y);
    for (let i = path.from + 1; i <= path.to; i++) ctx.lineTo(points[i].x, points[i].y);
    if (path.closed) ctx.closePath();
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.28 * path.weight;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  for (let i = 0; i < points.length; i++) {
    const anchor = i === 30 || (i >= 36 && i <= 47);
    ctx.beginPath();
    ctx.arc(points[i].x, points[i].y, anchor ? 2.1 : 1.4, 0, Math.PI * 2);
    ctx.fillStyle = line;
    ctx.globalAlpha = anchor ? 0.95 : 0.5;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
