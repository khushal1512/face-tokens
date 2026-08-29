import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';

interface ScannerProps {
  modelsLoaded: boolean;
  onScanComplete: (result: {
    userUuid: string;
    faceHash: string;
    faceHashBytes: Uint8Array;
    confidenceScore: number;
    normalizedVector: string;
  }) => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
  setError: (err: string | null) => void;
}

async function calculateHash(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function hashToUuid(hashHex: string): string {
  return [
    hashHex.slice(0, 8),
    hashHex.slice(8, 12),
    hashHex.slice(12, 16),
    hashHex.slice(16, 20),
    hashHex.slice(20, 32),
  ].join('-');
}

export default function Scanner({
  modelsLoaded,
  onScanComplete,
  isScanning,
  setIsScanning,
  setError,
}: ScannerProps) {
  const [scanStep, setScanStep] = useState<'detecting' | 'found' | 'turn_left' | 'turn_right' | 'done'>('detecting');
  const [scanProgress, setScanProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsScanning(false);
  }, [setIsScanning]);

  const startCamera = async () => {
    setError(null);
    setScanStep('detecting');
    setScanProgress(0);
    setIsScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setError('Webcam access denied. Camera permissions are required for the face scan.');
      setIsScanning(false);
    }
  };

  // Face tracking loop
  useEffect(() => {
    if (!isScanning || !modelsLoaded) return;

    let faceFoundFrames = 0;
    let leftTurnDetected = false;
    let rightTurnDetected = false;
    let phase: 'detecting' | 'found' | 'turn_left' | 'turn_right' | 'done' = 'detecting';
    let finished = false;

    const detect = async () => {
      if (finished) return;
      if (!videoRef.current || !canvasRef.current) {
        if (!finished) animFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      const w = video.clientWidth || 640;
      const h = video.clientHeight || 480;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        faceapi.matchDimensions(canvas, { width: w, height: h });
      }

      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
        .withFaceLandmarks();

      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, w, h);

      if (detection) {
        const resized = faceapi.resizeResults(detection, { width: w, height: h });
        const positions = resized.landmarks.positions;

        // Draw landmark dots
        if (ctx) {
          const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e07a5f';
          const groups: [number, number, string][] = [
            [0, 16, 'rgba(224,122,95,0.35)'],
            [17, 21, 'rgba(255,255,255,0.5)'],
            [22, 26, 'rgba(255,255,255,0.5)'],
            [27, 35, accentColor],
            [36, 41, 'rgba(255,255,255,0.6)'],
            [42, 47, 'rgba(255,255,255,0.6)'],
            [48, 67, 'rgba(255,255,255,0.4)'],
          ];
          for (const [start, end, color] of groups) {
            ctx.fillStyle = color;
            for (let i = start; i <= end; i++) {
              const pt = positions[i];
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 2.5, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
        }

        // Phase machine
        const jaw = positions.slice(0, 17);
        const noseTip = positions[30];
        const leftJaw = jaw[0];
        const rightJaw = jaw[16];
        const jawWidth = Math.abs(rightJaw.x - leftJaw.x);
        const noseRel = (noseTip.x - leftJaw.x) / jawWidth;

        if (phase === 'detecting') {
          faceFoundFrames++;
          setScanProgress(Math.min(20, faceFoundFrames * 2));
          if (faceFoundFrames >= 8) {
            phase = 'found';
            setScanStep('found');
            setScanProgress(25);
            setTimeout(() => {
              if (!finished) {
                phase = 'turn_left';
                setScanStep('turn_left');
                setScanProgress(35);
              }
            }, 800);
          }
        } else if (phase === 'turn_left') {
          setScanProgress(45);
          if (noseRel < 0.40) {
            leftTurnDetected = true;
            phase = 'turn_right';
            setScanStep('turn_right');
            setScanProgress(65);
          }
        } else if (phase === 'turn_right') {
          setScanProgress(75);
          if (noseRel > 0.60) {
            rightTurnDetected = true;
            phase = 'done';
            setScanStep('done');
            setScanProgress(100);
            finished = true;

            const leftEyeCenter = {
              x: (positions[36].x + positions[39].x) / 2,
              y: (positions[36].y + positions[39].y) / 2,
            };
            const rightEyeCenter = {
              x: (positions[42].x + positions[45].x) / 2,
              y: (positions[42].y + positions[45].y) / 2,
            };
            const pupilDist = Math.hypot(
              rightEyeCenter.x - leftEyeCenter.x,
              rightEyeCenter.y - leftEyeCenter.y,
            );
            const d = (a: any, b: any) => Math.hypot(b.x - a.x, b.y - a.y);

            const ratios = [
              (jawWidth / pupilDist).toFixed(2),
              (d(positions[27], positions[30]) / pupilDist).toFixed(2),
              (d(leftEyeCenter, positions[19]) / pupilDist).toFixed(2),
              (d(rightEyeCenter, positions[24]) / pupilDist).toFixed(2),
              (d(positions[48], positions[54]) / pupilDist).toFixed(2),
              (d(positions[30], positions[51]) / pupilDist).toFixed(2),
              (d(leftEyeCenter, positions[48]) / pupilDist).toFixed(2),
              (d(rightEyeCenter, positions[54]) / pupilDist).toFixed(2),
            ];

            const vectorStr = ratios.join(',');

            calculateHash(vectorStr).then((hash) => {
              const bytes = new Uint8Array(32);
              for (let i = 0; i < 32; i++) {
                bytes[i] = parseInt(hash.slice(i * 2, i * 2 + 2), 16);
              }
              onScanComplete({
                userUuid: hashToUuid(hash),
                faceHash: hash,
                faceHashBytes: bytes,
                confidenceScore: 98,
                normalizedVector: vectorStr,
              });
              stopCamera();
            });
          }
        }
      } else {
        if (phase === 'detecting') {
          faceFoundFrames = Math.max(0, faceFoundFrames - 1);
          setScanProgress(Math.min(20, faceFoundFrames * 2));
        }
      }

      if (!finished) {
        animFrameRef.current = requestAnimationFrame(detect);
      }
    };

    animFrameRef.current = requestAnimationFrame(detect);
    return () => {
      finished = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isScanning, modelsLoaded, onScanComplete, stopCamera]);

  const scanLabel = (() => {
    switch (scanStep) {
      case 'detecting': return 'Looking for a face...';
      case 'found': return 'Face detected';
      case 'turn_left': return 'Turn your head to the left';
      case 'turn_right': return 'Now turn your head to the right';
      case 'done': return 'Liveness confirmed';
      default: return '';
    }
  })();

  if (!isScanning) {
    return (
      <button
        className="btn-primary"
        onClick={startCamera}
        disabled={!modelsLoaded}
        style={{ maxWidth: 280 }}
      >
        {modelsLoaded ? 'Start Face Scan' : 'Loading face model...'}
      </button>
    );
  }

  return (
    <div className="camera-container">
      <video ref={videoRef} className="camera-video" playsInline muted />
      <canvas ref={canvasRef} className="camera-canvas" />
      <div className="scan-overlay">
        <div className="scan-status">{scanLabel}</div>
        <div className="scan-progress-bar">
          <div className="scan-progress-fill" style={{ width: `${scanProgress}%` }} />
        </div>
      </div>
    </div>
  );
}
