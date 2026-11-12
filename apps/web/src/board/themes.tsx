import type { ReactNode } from "react";

export type BoardStyle = "classic" | "modern" | "marble" | "night" | "tournament" | "contrast";

/** Order in the settings. */
export const BOARD_STYLES: readonly BoardStyle[] = [
  "classic",
  "modern",
  "marble",
  "night",
  "tournament",
  "contrast",
];

const shadow = (opacity: number) => (
  <filter id="cl-shadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodOpacity={opacity} />
  </filter>
);

export interface CheckerLook {
  readonly fill: string;
  readonly edge: string;
  readonly ring: string;
}

export interface BoardTheme {
  readonly id: BoardStyle;
  readonly defs: ReactNode;
  readonly frame: string;
  readonly felt: string;
  readonly bar: string;
  readonly tray: string;
  readonly pointA: string;
  readonly pointB: string;
  readonly label: string;
  readonly highlight: string;
  readonly selected: string;
  readonly checkers: readonly [CheckerLook, CheckerLook];
  readonly die: { readonly fill: string; readonly pip: string; readonly edge: string };
  readonly cube: { readonly fill: string; readonly text: string };
}

const classicDefs = (
  <>
    <linearGradient id="cl-wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#7a4f2b" />
      <stop offset="0.5" stopColor="#5e3a1f" />
      <stop offset="1" stopColor="#4a2d17" />
    </linearGradient>
    <pattern id="cl-grain" width="220" height="14" patternUnits="userSpaceOnUse">
      <rect width="220" height="14" fill="url(#cl-wood)" />
      <path d="M0 4 Q55 1 110 5 T220 4" stroke="#3a2210" strokeOpacity="0.25" fill="none" />
      <path d="M0 10 Q70 13 140 9 T220 11" stroke="#9a6a3c" strokeOpacity="0.18" fill="none" />
    </pattern>
    <radialGradient id="cl-felt" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0" stopColor="#24563d" />
      <stop offset="1" stopColor="#163a28" />
    </radialGradient>
    <linearGradient id="cl-pointA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#efe3c8" />
      <stop offset="1" stopColor="#d9c7a0" />
    </linearGradient>
    <linearGradient id="cl-pointB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#9c3a25" />
      <stop offset="1" stopColor="#74261a" />
    </linearGradient>
    <radialGradient id="cl-white" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stopColor="#fffdf6" />
      <stop offset="0.7" stopColor="#ece2c9" />
      <stop offset="1" stopColor="#cdbd96" />
    </radialGradient>
    <radialGradient id="cl-black" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stopColor="#6b4a36" />
      <stop offset="0.7" stopColor="#3a2418" />
      <stop offset="1" stopColor="#21140c" />
    </radialGradient>
    <filter id="cl-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.45" />
    </filter>
  </>
);

export const THEMES: Record<BoardStyle, BoardTheme> = {
  classic: {
    id: "classic",
    defs: classicDefs,
    frame: "url(#cl-grain)",
    felt: "url(#cl-felt)",
    bar: "url(#cl-grain)",
    tray: "#2c1a0d",
    pointA: "url(#cl-pointA)",
    pointB: "url(#cl-pointB)",
    label: "#e9d9b4",
    highlight: "#ffd54a",
    selected: "#7fd3ff",
    checkers: [
      { fill: "url(#cl-white)", edge: "#a8946a", ring: "#c9b68c" },
      { fill: "url(#cl-black)", edge: "#120a05", ring: "#5b3d2a" },
    ],
    die: { fill: "#fbf7ec", pip: "#2a1a10", edge: "#bfae88" },
    cube: { fill: "#f4ead2", text: "#4a2d17" },
  },
  modern: {
    id: "modern",
    defs: (
      <filter id="cl-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.3" />
      </filter>
    ),
    frame: "#1e293b",
    felt: "#334155",
    bar: "#1e293b",
    tray: "#0f172a",
    pointA: "#64748b",
    pointB: "#0ea5a4",
    label: "#94a3b8",
    highlight: "#facc15",
    selected: "#38bdf8",
    checkers: [
      { fill: "#f8fafc", edge: "#cbd5e1", ring: "#e2e8f0" },
      { fill: "#f97316", edge: "#c2410c", ring: "#fb923c" },
    ],
    die: { fill: "#f8fafc", pip: "#0f172a", edge: "#94a3b8" },
    cube: { fill: "#e2e8f0", text: "#0f172a" },
  },
  /** Greek marble: white stone, gold lines, deep blue and white checkers. */
  marble: {
    id: "marble",
    defs: (
      <>
        <linearGradient id="mb-stone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3f1ec" />
          <stop offset="0.45" stopColor="#e2ded5" />
          <stop offset="0.55" stopColor="#ece8e0" />
          <stop offset="1" stopColor="#d6d1c6" />
        </linearGradient>
        <pattern id="mb-vein" width="300" height="200" patternUnits="userSpaceOnUse">
          <rect width="300" height="200" fill="url(#mb-stone)" />
          <path
            d="M0 40 C60 20 120 80 180 50 S280 30 300 70"
            stroke="#b9b3a6"
            strokeOpacity="0.5"
            fill="none"
          />
          <path
            d="M0 150 C80 120 150 180 220 140 S290 120 300 160"
            stroke="#c8c2b4"
            strokeOpacity="0.45"
            fill="none"
          />
        </pattern>
        <radialGradient id="mb-blue" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#3b6fb6" />
          <stop offset="1" stopColor="#123a73" />
        </radialGradient>
        <radialGradient id="mb-white" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9dde3" />
        </radialGradient>
        {shadow(0.35)}
      </>
    ),
    frame: "#1d3b66",
    felt: "url(#mb-vein)",
    bar: "#1d3b66",
    tray: "#132a4a",
    pointA: "#c9a44c",
    pointB: "#1d4f91",
    label: "#e8d7a6",
    highlight: "#f59e0b",
    selected: "#e11d48",
    checkers: [
      { fill: "url(#mb-white)", edge: "#8a93a3", ring: "#b8c0cc" },
      { fill: "url(#mb-blue)", edge: "#0b2349", ring: "#5b86c4" },
    ],
    die: { fill: "#ffffff", pip: "#1d3b66", edge: "#9aa6b8" },
    cube: { fill: "#f3f1ec", text: "#1d3b66" },
  },
  /** Dark board for the evening: navy felt, teal and gold. */
  night: {
    id: "night",
    defs: shadow(0.5),
    frame: "#0b1020",
    felt: "#111a33",
    bar: "#0b1020",
    tray: "#070b16",
    pointA: "#2a3b66",
    pointB: "#0f766e",
    label: "#8ea0c9",
    highlight: "#fde047",
    selected: "#f472b6",
    checkers: [
      { fill: "#e5e7eb", edge: "#9ca3af", ring: "#cbd5e1" },
      { fill: "#d4a017", edge: "#8a6508", ring: "#f2c94c" },
    ],
    die: { fill: "#e5e7eb", pip: "#0b1020", edge: "#64748b" },
    cube: { fill: "#1f2a4d", text: "#e5e7eb" },
  },
  /** Like a club tournament board: green felt, cream and red points, white and red checkers. */
  tournament: {
    id: "tournament",
    defs: shadow(0.4),
    frame: "#3b2a1a",
    felt: "#1f6b3a",
    bar: "#3b2a1a",
    tray: "#2a1d12",
    pointA: "#f1e6c8",
    pointB: "#b91c1c",
    label: "#f1e6c8",
    highlight: "#fde047",
    selected: "#60a5fa",
    checkers: [
      { fill: "#fafaf9", edge: "#a8a29e", ring: "#d6d3d1" },
      { fill: "#991b1b", edge: "#450a0a", ring: "#dc2626" },
    ],
    die: { fill: "#fafaf9", pip: "#1c1917", edge: "#a8a29e" },
    cube: { fill: "#fafaf9", text: "#1f6b3a" },
  },
  /**
   * High contrast for low vision and colour blindness: black board, white and yellow points,
   * white and blue checkers with strong outlines (blue/white stays distinct in all common CVD
   * types).
   */
  contrast: {
    id: "contrast",
    defs: shadow(0),
    frame: "#000000",
    felt: "#000000",
    bar: "#1a1a1a",
    tray: "#1a1a1a",
    pointA: "#f5f5f5",
    pointB: "#facc15",
    label: "#ffffff",
    highlight: "#22d3ee",
    selected: "#f472b6",
    checkers: [
      { fill: "#ffffff", edge: "#000000", ring: "#000000" },
      { fill: "#1d4ed8", edge: "#ffffff", ring: "#ffffff" },
    ],
    die: { fill: "#ffffff", pip: "#000000", edge: "#000000" },
    cube: { fill: "#ffffff", text: "#000000" },
  },
};
