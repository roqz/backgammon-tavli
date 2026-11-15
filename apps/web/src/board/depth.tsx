/**
 * "Board with depth": the flat SVG board tilted back with CSS perspective, lit from above, with
 * raised frame, sunken fields and checkers that have an edge and a gloss. The geometry stays the
 * same; only pointer positions are mapped back through the tilt (`untilt`).
 */
import { type CSSProperties, type RefObject, useEffect, useState } from "react";
import type { Pos } from "./geometry";

/** How far the board leans back. */
const TILT_DEG = 14;

export interface Tilt {
  readonly deg: number;
  /** CSS perspective distance in px (relative to the board width, so phones and desktops match). */
  readonly distance: number;
}

/** The tilt for an element of this width (null while unmeasured or off). */
export const useTilt = (ref: RefObject<SVGSVGElement | null>, on: boolean): Tilt | null => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, on]);
  if (!on || size.w === 0) return null;
  // a tall board (portrait phones) leans less, or its far end shrinks too much
  const tall = size.h > size.w;
  return { deg: tall ? TILT_DEG * 0.6 : TILT_DEG, distance: Math.max(800, Math.max(size.w, size.h) * 2.4) };
};

/**
 * Tilted around the bottom edge: the near edge keeps its size and place, the far edge recedes,
 * so the board never grows out of its box. The shadow lies on the table below.
 */
export const tiltStyle = (t: Tilt): CSSProperties => ({
  transform: `perspective(${t.distance}px) rotateX(${t.deg}deg)`,
  transformOrigin: "50% 100%",
  filter: "drop-shadow(0 14px 14px rgb(0 0 0 / 0.45))",
});

/**
 * Screen point → point in the untilted SVG's viewBox. CSS rotateX(θ) with perspective d around
 * the bottom edge maps a point y above it (y < 0) to Y = y·cosθ·d/(d − y·sinθ) and scales x by
 * d/(d − y·sinθ); this solves that for y and x.
 */
export const untilt = (svg: SVGSVGElement, t: Tilt, clientX: number, clientY: number): Pos => {
  const r = svg.getBoundingClientRect(); // bottom edge and width are those of the flat element
  const w = svg.clientWidth;
  const h = svg.clientHeight;
  const rad = (t.deg * Math.PI) / 180;
  const d = t.distance;
  const Y = clientY - r.bottom;
  const X = clientX - (r.left + r.width / 2);
  const y = (Y * d) / (d * Math.cos(rad) + Y * Math.sin(rad));
  const x = (X * (d - y * Math.sin(rad))) / d;
  const vb = svg.viewBox.baseVal;
  const scale = vb.width / w;
  return { x: (x + w / 2) * scale, y: (h + y) * scale };
};

/** Gradients and the shadow filter of the depth look; `side` is the checker edge direction. */
export const DEPTH_DEFS = (side: Pos) => {
  // gradients run from the top of the screen to the bottom, whichever way the board is drawn
  const dir = {
    x1: side.x < 0 ? 1 : 0,
    x2: side.x > 0 ? 1 : 0,
    y1: side.y < 0 ? 1 : 0,
    y2: side.y > 0 ? 1 : 0,
  };
  return (
    <>
      <linearGradient id="dp-bevel" {...dir}>
        <stop offset="0" stopColor="#fff" stopOpacity={0.35} />
        <stop offset="0.5" stopColor="#fff" stopOpacity={0.05} />
        <stop offset="1" stopColor="#000" stopOpacity={0.45} />
      </linearGradient>
      <linearGradient id="dp-inset" {...dir}>
        <stop offset="0" stopColor="#000" stopOpacity={0.38} />
        <stop offset="0.06" stopColor="#000" stopOpacity={0.12} />
        <stop offset="0.5" stopColor="#000" stopOpacity={0} />
        <stop offset="0.96" stopColor="#fff" stopOpacity={0} />
        <stop offset="1" stopColor="#fff" stopOpacity={0.08} />
      </linearGradient>
      <radialGradient id="dp-gloss" cx="0.36" cy="0.3" r="0.7">
        <stop offset="0" stopColor="#fff" stopOpacity={0.42} />
        <stop offset="0.45" stopColor="#fff" stopOpacity={0.08} />
        <stop offset="1" stopColor="#000" stopOpacity={0.12} />
      </radialGradient>
      <filter id="dp-shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx={side.x * 0.9} dy={side.y * 0.9} stdDeviation="2.5" floodOpacity={0.55} />
      </filter>
    </>
  );
};
