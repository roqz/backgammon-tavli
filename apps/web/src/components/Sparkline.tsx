import { useState } from "react";

/**
 * Rating course as a small line (one series, so no legend; the card names it). Hovering or
 * tapping shows the value and date of the nearest point; the label summarises it for screen
 * readers.
 */
export function Sparkline({
  points,
  label,
  locale,
}: {
  points: readonly { at: string; rating: number }[];
  label: string;
  locale: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const W = 120;
  const H = 32;
  const values = points.map((p) => p.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const x = (i: number) => 2 + (i / (points.length - 1)) * (W - 4);
  const y = (v: number) => 3 + (1 - (v - min) / span) * (H - 6);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.rating).toFixed(1)}`).join(" ");
  const shown = hover ?? points.length - 1;
  const pick = (clientX: number, rect: DOMRect) =>
    setHover(Math.round(((clientX - rect.left) / rect.width) * (points.length - 1)));
  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-8 w-full max-w-32 touch-none"
        role="img"
        aria-label={`${label}: ${values[0]} → ${values[values.length - 1]} (min ${min}, max ${max})`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        <path
          d={d}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={x(shown)}
          cy={y(values[shown]!)}
          r={3}
          fill="#f59e0b"
          stroke="#1c1917"
          strokeWidth={1.5}
        />
      </svg>
      <span className="h-4 text-[10px] tabular-nums text-stone-500">
        {hover !== null && `${values[hover]} · ${new Date(points[hover]!.at).toLocaleDateString(locale)}`}
      </span>
    </div>
  );
}
