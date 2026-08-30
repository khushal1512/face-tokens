/**
 * The looping scan animation on the landing page. It renders the same 68 point
 * landmark topology the real scanner uses, so what people see here is the shape
 * of the thing that actually runs on their camera feed.
 *
 * Timing lives in CSS so the whole loop can be disabled by prefers-reduced-motion
 * without touching this file.
 */

interface Point { x: number; y: number }

const VIEW = 320;
/** Cropped to the face bounds so the mesh fills its container. */
const VIEWBOX = '28 46 264 232';

const polar = (cx: number, cy: number, rx: number, ry: number, deg: number): Point => ({
  x: cx + rx * Math.cos((deg * Math.PI) / 180),
  y: cy + ry * Math.sin((deg * Math.PI) / 180),
});

const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, count: number): Point[] =>
  Array.from({ length: count }, (_, i) => polar(cx, cy, rx, ry, from + ((to - from) * i) / (count - 1)));

const ellipse = (cx: number, cy: number, rx: number, ry: number, count: number): Point[] =>
  Array.from({ length: count }, (_, i) => polar(cx, cy, rx, ry, (360 * i) / count));

const line = (from: Point, to: Point, count: number): Point[] =>
  Array.from({ length: count }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / (count - 1),
    y: from.y + ((to.y - from.y) * i) / (count - 1),
  }));

/** Landmarks in the canonical 68 point order, laid out on a front facing face. */
function buildLandmarks(): Point[] {
  const jaw = arc(160, 138, 76, 94, 145, 35, 17);
  const browR = arc(126, 108, 24, 12, 200, 340, 5);
  const browL = arc(194, 108, 24, 12, 200, 340, 5);
  const bridge = line({ x: 160, y: 112 }, { x: 160, y: 158 }, 4);
  const nostrils = arc(160, 168, 19, 7, 200, 340, 5);
  const eyeR = ellipse(128, 128, 16, 8, 6);
  const eyeL = ellipse(192, 128, 16, 8, 6);
  const lipsOuter = ellipse(160, 202, 31, 15, 12);
  const lipsInner = ellipse(160, 202, 20, 7, 8);
  return [...jaw, ...browR, ...browL, ...bridge, ...nostrils, ...eyeR, ...eyeL, ...lipsOuter, ...lipsInner];
}

const MESH_PATHS: Array<[number, number, boolean]> = [
  [0, 16, false],
  [17, 21, false],
  [22, 26, false],
  [27, 30, false],
  [31, 35, false],
  [36, 41, true],
  [42, 47, true],
  [48, 59, true],
  [60, 67, true],
];

const POINTS = buildLandmarks();

const toPath = (from: number, to: number, closed: boolean): string => {
  const segment = POINTS.slice(from, to + 1)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  return closed ? `${segment} Z` : segment;
};

export default function FaceScanVisual() {
  return (
    <div className="scan-visual" aria-hidden="true">
      <div className="scan-visual-glow" />
      <svg viewBox={VIEWBOX} className="scan-visual-svg">
        <defs>
          <linearGradient id="meshStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--signal)" />
            <stop offset="100%" stopColor="var(--signal-alt)" />
          </linearGradient>
          <linearGradient id="sweepFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--signal)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <ellipse
          className="scan-visual-head"
          cx="160"
          cy="150"
          rx="80"
          ry="98"
          fill="none"
          stroke="url(#meshStroke)"
        />

        <g className="scan-visual-mesh">
          {MESH_PATHS.map(([from, to, closed]) => (
            <path key={`${from}-${to}`} d={toPath(from, to, closed)} stroke="url(#meshStroke)" fill="none" />
          ))}
        </g>

        <g className="scan-visual-dots">
          {POINTS.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === 30 || (i >= 36 && i <= 47) ? 2.6 : 1.7}
              style={{ animationDelay: `${(i % 17) * 45}ms` }}
            />
          ))}
        </g>

        <rect className="scan-visual-sweep" x="20" y="-26" width={VIEW} height="52" fill="url(#sweepFill)" />
      </svg>

      <div className="scan-visual-readout">
        <span className="scan-visual-label">hash</span>
        <span className="scan-visual-hash">8f2a1c47d09be3a5</span>
      </div>
    </div>
  );
}
