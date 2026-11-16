/**
 * The app's own line icons (design doc „Eigene Icons“, set A): a 24 × 24 grid with 2 px free at
 * the edges, 1.75 px round strokes, no fill, colour from the surrounding text. Decorative by
 * default (aria-hidden); give `label` when an icon stands alone without visible text.
 */
import type { SVGProps } from "react";

export const ICONS = {
  // navigation
  back: "M19 12H5M11 6l-6 6 6 6",
  forward: "M5 12h14M13 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  fullscreen: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  copy: "M8 8h12v12H8zM16 8V4H4v12h4",
  plus: "M12 5v14M5 12h14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  /** Turn the phone: a handset and a turning arrow. */
  rotate: "M9 3h6v10H9zM11.5 10.5h1M4 14a8 8 0 0 0 13.5 5.8M17.5 21v-3h-3",
  // game
  dice: "M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01",
  cube: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  check: "M5 12.5l4.5 4.5L19 7",
  undo: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4.3h4.3",
  flag: "M6 21V4M6 4h11l-2 4 2 4H6",
  hint: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  rules: "M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z",
  rematch: "M4 9a8 8 0 0 1 14-3M20 15a8 8 0 0 1-14 3M18 3v3h-3M6 21v-3h3",
  finish: "M6 21V4M6 4h12v9H6M10 4v9M14 4v9M6 8.5h12",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  // replay
  first: "M18 5v14L9 12zM6 5v14",
  prev: "M16 5v14L6 12z",
  play: "M8 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  last: "M6 5v14l9-7zM18 5v14",
  // time and tempo
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  hourglass: "M7 3h10M7 21h10M8 3v3l4 6-4 6v3M16 3v3l-4 6 4 6v3",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  blitz: "M13 2L4 14h7l-1 8 9-12h-7z",
  relaxed: "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h1.5a2 2 0 0 1 0 4H16M8.5 3v3M12 3v3",
  infinity: "M12 12c-2-3-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1 6-4zm0 0c2 3 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1-6 4z",
  // online and community
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  friends:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  challenge: "M4 4l11 11M20 4L9 15M13 17l4 4M11 17l-4 4M15 15l2-2M9 15l-2-2",
  club: "M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18",
  watch: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  live: "M3 6h18v12H3zM8 21h8M10 10v4l4-2z",
  chat: "M4 5h16v11H9l-5 4z",
  mail: "M3 6h18v12H3zM3 6l9 7 9-7",
  /** A correspondence game: a letter with a clock. */
  corr: "M3 6h12v9H3zM3 6l6 5 6-5M18 13a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM18 15v1.6l1 .8",
  handshake:
    "M2 10l4-3 4 1.5 2.5-1.5 3.5.5L22 10M2 10l5.5 5.5 1.5-1 1.5 1.5 1.5-1 1.5 1.5 1.5-1 1 1L22 10M10 8.5l-3 3",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  "bell-off": "M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l2 2H8M10 21h4M3 3l18 18",
  signal:
    "M12 12h.01M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8",
  offline: "M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  // account and security
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2",
  key: "M7.5 16a4 4 0 1 1 3.9-4.9H21v3h-2v2.5h-3v-2.5h-4.6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  phone: "M8 2h8v20H8zM11 18h2",
  computer: "M4 5h16v11H4zM9 20h6M12 16v4",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  upload: "M12 20V5M6 11l6-6 6 6",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  folder: "M3 6h6l2 2h10v11H3z",
  robot: "M6 8h12v11H6zM12 8V4M9.5 12.5h.01M14.5 12.5h.01M9 16h6M3 12v3M21 12v3",
  // status and looks
  warning: "M12 4l9 16H3zM12 10v4M12 17v.01",
  target:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  "trend-up": "M4 16l6-6 4 4 6-6M14 8h6v6",
  "trend-down": "M4 8l6 6 4-4 6 6M14 16h6v-6",
  palette:
    "M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-1-.8-1.5-.8-2.5s.8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01",
  sound: "M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  fireworks:
    "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  // navigation tiles (formerly GLYPH)
  puzzle:
    "M10 3h4v3a2 2 0 1 0 4 0h3v5h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H4v-6h3a2 2 0 1 0 0-4H4V6h6z",
  school: "M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6",
  stats: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  ranking: "M4 18h4v-5H4zM10 18h4V7h-4zM16 18h4v-8h-4z",
  board: "M4 5h16v14H4zM12 5v14M4 12h4M16 12h4",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  label,
  className = "h-[1.15em] w-[1.15em]",
  strokeWidth = 1.75,
  ...rest
}: {
  name: IconName;
  /** Accessible name; without it the icon is decorative. */
  label?: string;
  className?: string;
  strokeWidth?: number;
} & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative (aria-hidden) unless labelled, then role, aria-label and title are set
    <svg
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 align-[-0.18em] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      {...rest}
    >
      {label && <title>{label}</title>}
      <path d={ICONS[name]} />
    </svg>
  );
}
