/**
 * An achievement as a small plaque (design doc „Eigene Icons“, achievement round): a hexagon of
 * green enamel with a brass rim and the motif in line; rarities carry a ring of brass beads.
 */
import { useId } from "react";
import type { Achievement } from "../achievements";
import { ICONS } from "./Icon";

export function AchievementBadge({
  a,
  size = 32,
  locked = false,
  className = "",
}: {
  a: Pick<Achievement, "badge" | "tint" | "rare">;
  size?: number;
  /** Not reached yet: muted and without colour. */
  locked?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const rim = a.rare ? 4.6 : 3;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      className={`inline-block shrink-0 ${locked ? "opacity-45 grayscale" : ""} ${className}`}
    >
      <defs>
        <radialGradient id={id} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#2d6449" />
          <stop offset="1" stopColor="#143326" />
        </radialGradient>
      </defs>
      {a.rare && (
        <circle
          cx="24"
          cy="24"
          r="22.6"
          fill="none"
          stroke="#c9a14a"
          strokeWidth="2"
          strokeDasharray="0.1 3.55"
          strokeLinecap="round"
        />
      )}
      <path
        d={`M24 ${rim}l${a.rare ? 16.5 : 17} ${a.rare ? 9.3 : 9.5}v${a.rare ? 20.2 : 21}L24 ${48 - rim}l-${a.rare ? 16.5 : 17}-${a.rare ? 9.3 : 9.5}v-${a.rare ? 20.2 : 21}z`}
        fill={`url(#${id})`}
        stroke="#c9a14a"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <g transform={`translate(24 24) scale(${a.rare ? 0.78 : 0.85}) translate(-12 -12)`}>
        <path
          d={ICONS[a.badge]}
          fill="none"
          stroke={a.tint ?? "#efe6d2"}
          strokeWidth={size < 30 ? 2.4 : 1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
