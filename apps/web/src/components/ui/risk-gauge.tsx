import { cn } from '../../lib/cn';

/** Semicircular risk gauge (pure SVG, server-safe). Colour band by score, with faint zone segments
 * on the track (low/medium/high) so the needle value reads against the full scale. */
export function RiskGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const band = clamped <= 30 ? 'text-risk-green' : clamped <= 70 ? 'text-risk-amber' : 'text-risk-red';
  const label = clamped <= 30 ? 'low' : clamped <= 70 ? 'medium' : 'high';
  const r = 52;
  const circ = Math.PI * r; // half circle length
  const offset = circ * (1 - clamped / 100);
  const seg = (from: number, to: number) => ({
    strokeDasharray: `${((to - from) / 100) * circ} ${circ}`,
    strokeDashoffset: -((from / 100) * circ),
  });
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="w-40">
        <path
          d="M8 64 A52 52 0 0 1 112 64"
          fill="none"
          className="stroke-border"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Faint risk-zone segments on the track (0-30 green, 30-70 amber, 70-100 red). */}
        <path
          d="M8 64 A52 52 0 0 1 112 64"
          fill="none"
          className="stroke-risk-green/25"
          strokeWidth={10}
          {...seg(0, 30)}
        />
        <path
          d="M8 64 A52 52 0 0 1 112 64"
          fill="none"
          className="stroke-risk-amber/25"
          strokeWidth={10}
          {...seg(30, 70)}
        />
        <path
          d="M8 64 A52 52 0 0 1 112 64"
          fill="none"
          className="stroke-risk-red/25"
          strokeWidth={10}
          {...seg(70, 100)}
        />
        <path
          d="M8 64 A52 52 0 0 1 112 64"
          fill="none"
          className={cn('stroke-current', band)}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="-mt-4 text-center">
        <div className={cn('font-semibold tabular', band)}>
          <span className="text-2xl">{clamped}</span>
          <span className="text-sm text-fg-subtle">/100</span>
        </div>
        <div className="text-xs text-fg-subtle">
          risk score · <span className={cn('font-medium uppercase', band)}>{label}</span>
        </div>
      </div>
    </div>
  );
}
