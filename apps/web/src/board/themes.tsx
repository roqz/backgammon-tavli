import type { ReactNode } from "react";

export type BoardStyle = "classic" | "modern";

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
};
