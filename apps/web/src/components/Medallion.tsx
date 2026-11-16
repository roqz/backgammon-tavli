/**
 * Prestige marks (design doc „Eigene Icons“, sets B and C): avatar frames as medallions – dark
 * enamel, a ring in the frame's metal and an engraved motif; rarities and champions carry a
 * second ring of beads. Podium plaques, club rank marks and the supporter heart.
 */
import type { Frame } from "@tavli/protocol";
import { useId } from "react";

/** Engraved motif of each frame on the 24 grid. */
const MOTIF: Record<Frame, string> = {
  gold: "M4 17h16M5 17l-1-9 4.5 3.5L12 6l3.5 5.5L20 8l-1 9",
  laurel:
    "M12 20c-4-1-7-5-7-11M12 20c4-1 7-5 7-11M5.4 13.5c1.6.1 2.8-.9 3-2.4M5 9.6c1.5 0 2.6-1 2.7-2.5M18.6 13.5c-1.6.1-2.8-.9-3-2.4M19 9.6c-1.5 0-2.6-1-2.7-2.5M7 17c1.4-.3 2.3-1.3 2.3-2.7M17 17c-1.4-.3-2.3-1.3-2.3-2.7",
  flame: "M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1 2.5 2 3 .5-3-1-5.5.5-8z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  scholar: "M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6",
  post: "M3 6h18v12H3zM3 6l9 7 9-7M12 15.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z",
  handshake:
    "M2 10l4-3 4 1.5 2.5-1.5 3.5.5L22 10M2 10l5.5 5.5 1.5-1 1.5 1.5 1.5-1 1.5 1.5 1.5-1 1 1L22 10M10 8.5l-3 3",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM7.5 10.5l4.5 3 4.5-3",
  champion: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4",
  master: "M3 20L6 6l3 14zM9.5 20L12.5 6l3 14zM16 20l3-14 3 14z",
  series: "M4 16h16M5 16l-1-8 4.5 3.5L12 5l3.5 6.5L20 8l-1 8M8 20h.01M12 20h.01M16 20h.01",
  veteran: "M7 3h10M7 21h10M8 3v3l4 6-4 6v3M16 3v3l-4 6 4 6v3",
  rosette:
    "M12 4a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM12 7.3a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM9 14.2L7.2 20l2.8-1.3L12 20M15 14.2l1.8 5.8-2.8-1.3L12 20",
  medal:
    "M8 3l4 6 4-6M12 9a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z",
  patron: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
};

/** Metal of the ring and motif; `beads` marks rarities, champions and supporters. */
export const FRAME_METAL: Record<Frame, { metal: string; beads?: string; rare?: boolean }> = {
  gold: { metal: "#c9a14a" },
  laurel: { metal: "#8fae68" },
  flame: { metal: "#d1603d" },
  star: { metal: "#e6d6a3" },
  scholar: { metal: "#8fb0cf" },
  post: { metal: "#c9b289" },
  handshake: { metal: "#9cc2a7" },
  shield: { metal: "#b8977c" },
  champion: { metal: "#e3c574", beads: "#c9a14a", rare: true },
  master: { metal: "#d9c08a", beads: "#8fae68", rare: true },
  series: { metal: "#e3c574", beads: "#d1603d", rare: true },
  veteran: { metal: "#c9b289", beads: "#c9a14a", rare: true },
  rosette: { metal: "#c9a14a", beads: "#c9a14a", rare: true },
  medal: { metal: "#e3c574", beads: "#d1603d", rare: true },
  patron: { metal: "#c9a14a", beads: "#e3c574", rare: true },
};

/** A frame as a medallion; `size` in px. Decorative unless `label` is given. */
export function Medallion({
  frame,
  size = 20,
  label,
  shine = false,
  className = "",
}: {
  frame: Frame;
  size?: number;
  label?: string;
  /** One gleam across a rarity (match start); off with reduced motion. */
  shine?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const { metal, beads, rare } = FRAME_METAL[frame];
  // thin lines vanish at small sizes: engrave thicker there
  const motifWidth = size < 32 ? 2.3 : 1.7;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative (aria-hidden) unless labelled, then role, aria-label and title are set
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      data-frame={frame}
    >
      {label && <title>{label}</title>}
      <defs>
        <radialGradient id={`${id}e`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#3a2d22" />
          <stop offset="1" stopColor="#140e0a" />
        </radialGradient>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={metal} />
          <stop offset=".55" stopColor={metal} stopOpacity=".85" />
          <stop offset="1" stopColor={metal} stopOpacity=".6" />
        </linearGradient>
        {shine && rare && (
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        )}
        <clipPath id={`${id}c`}>
          <circle cx="24" cy="24" r="22" />
        </clipPath>
      </defs>
      {beads && (
        <circle
          cx="24"
          cy="24"
          r="22.6"
          fill="none"
          stroke={beads}
          strokeWidth="2"
          strokeDasharray="0.1 3.55"
          strokeLinecap="round"
        />
      )}
      <circle
        cx="24"
        cy="24"
        r={beads ? 19.6 : 21}
        fill={`url(#${id}e)`}
        stroke={`url(#${id}m)`}
        strokeWidth={beads ? 2.6 : 3}
      />
      <path
        d="M13 15a13 13 0 0 1 13-6"
        fill="none"
        stroke="#f7f1e6"
        strokeOpacity=".18"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <g transform={`translate(24 24) scale(${beads ? 0.92 : 1}) translate(-12 -12)`}>
        <path
          d={MOTIF[frame]}
          fill="none"
          stroke={metal}
          strokeWidth={motifWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {shine && rare && (
        <g clipPath={`url(#${id}c)`} className="motion-reduce:hidden">
          <rect x="-30" y="-10" width="16" height="70" fill={`url(#${id}s)`} transform="rotate(20 24 24)">
            <animate attributeName="x" from="-30" to="70" dur="1.4s" begin="0.4s" fill="freeze" />
          </rect>
        </g>
      )}
    </svg>
  );
}

const PODIUM = {
  1: ["#f0d58a", "#b8862f"],
  2: ["#e3e0d6", "#8e8a80"],
  3: ["#e0a473", "#8f5a32"],
} as const;

/** Gold, silver or bronze plaque of a monthly podium. */
export function Plaque({ place, size = 20, label }: { place: 1 | 2 | 3; size?: number; label?: string }) {
  const id = useId().replace(/:/g, "");
  const [light, dark] = PODIUM[place];
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative (aria-hidden) unless labelled, then role, aria-label and title are set
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className="inline-block shrink-0 align-[-0.25em]"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      data-place={place}
    >
      {label && <title>{label}</title>}
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <path d="M15 3h7l2 9-6 4zM33 3h-7l-2 9 6 4z" fill="#8f3e26" stroke="#4a2116" strokeWidth="1" />
      <circle cx="24" cy="29" r="14" fill={`url(#${id})`} stroke="#211913" strokeWidth="1.5" />
      <circle cx="24" cy="29" r="10.5" fill="none" stroke="#211913" strokeOpacity=".45" strokeWidth="1" />
      <text
        x="24"
        y="34.2"
        textAnchor="middle"
        fontFamily="Fraunces Variable, Georgia, serif"
        fontWeight="650"
        fontSize="14"
        fill="#211913"
      >
        {place}
      </text>
    </svg>
  );
}

/** Club rank mark: I, II, III, a star for honorary members (0 = none). */
export function RankMark({ rank, label }: { rank: number; label?: string }) {
  if (rank <= 0) return null;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative (aria-hidden) unless labelled, then role, aria-label and title are set
    <svg
      viewBox="0 0 24 24"
      className="inline-block h-4 w-4 shrink-0"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {label && <title>{label}</title>}
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="3"
        fill="none"
        stroke="#c9a14a"
        strokeOpacity=".7"
        strokeWidth="1.6"
      />
      {rank >= 4 ? (
        <path d="M12 6.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L12 14.7l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#c9a14a" />
      ) : (
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontFamily="Fraunces Variable, Georgia, serif"
          fontWeight="650"
          fontSize="10"
          fill="#c9a14a"
        >
          {["", "I", "II", "III"][rank]}
        </text>
      )}
    </svg>
  );
}
