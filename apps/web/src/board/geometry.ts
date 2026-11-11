import type { Player } from "@tavli/engine";

/**
 * Board geometry in SVG user units. Absolute point indices follow the engine:
 * 0..5 bottom right (0 = rightmost), 6..11 bottom left, 12..17 top left, 18..23 top right.
 * Seen from white, white's home board is bottom right and black's is top right (Backgammon).
 */
export const FRAME = 18;
export const POINT_W = 64;
export const BAR_W = 60;
export const TRAY_W = 76;
export const HEIGHT = 660;
export const CHECKER_R = POINT_W / 2 - 3;
export const POINT_H = 250;

export const LEFT_X = FRAME;
export const BAR_X = LEFT_X + 6 * POINT_W;
export const RIGHT_X = BAR_X + BAR_W;
export const BOARD_RIGHT = RIGHT_X + 6 * POINT_W;
export const TRAY_X = BOARD_RIGHT + FRAME;
export const WIDTH = TRAY_X + TRAY_W + FRAME;
export const TOP_Y = FRAME;
export const BOTTOM_Y = HEIGHT - FRAME;
export const MID_Y = HEIGHT / 2;

/** Slots that hold checkers in the UI. */
export type Slot = number | "bar0" | "bar1" | "off0" | "off1";

export const barSlot = (p: Player): Slot => (p === 0 ? "bar0" : "bar1");
export const offSlot = (p: Player): Slot => (p === 0 ? "off0" : "off1");

export const isTop = (abs: number) => abs >= 12;

/** Horizontal centre of an absolute point. */
export const pointX = (abs: number): number => {
  if (abs < 6) return BOARD_RIGHT - (abs + 0.5) * POINT_W;
  if (abs < 12) return BAR_X - (abs - 6 + 0.5) * POINT_W;
  if (abs < 18) return LEFT_X + (abs - 12 + 0.5) * POINT_W;
  return RIGHT_X + (abs - 18 + 0.5) * POINT_W;
};

const MAX_STACK = POINT_H + 40;

/** Distance between checker centres in a stack of `n`, compressed when the stack grows tall. */
export const stackSpacing = (n: number): number =>
  n <= 5 ? CHECKER_R * 2 : Math.min(CHECKER_R * 2, (MAX_STACK - CHECKER_R * 2) / (n - 1));

export interface Pos {
  readonly x: number;
  readonly y: number;
}

/** Centre of the i-th checker (0 = outermost) in a stack of n on a slot. */
export const checkerPos = (slot: Slot, i: number, n: number): Pos => {
  if (typeof slot === "number") {
    const s = stackSpacing(n);
    const x = pointX(slot);
    return isTop(slot) ? { x, y: TOP_Y + CHECKER_R + i * s } : { x, y: BOTTOM_Y - CHECKER_R - i * s };
  }
  const barX = BAR_X + BAR_W / 2;
  const s = Math.min(CHECKER_R * 2, (MID_Y - TOP_Y - 60) / Math.max(1, n - 1));
  switch (slot) {
    // White waits on the bar in the upper half (it enters top right), black in the lower half.
    case "bar0":
      return { x: barX, y: MID_Y - 50 - CHECKER_R - i * s };
    case "bar1":
      return { x: barX, y: MID_Y + 50 + CHECKER_R + i * s };
    case "off0":
      return { x: TRAY_X + TRAY_W / 2, y: BOTTOM_Y - 8 - i * OFF_CHIP_H };
    case "off1":
      return { x: TRAY_X + TRAY_W / 2, y: TOP_Y + 8 + i * OFF_CHIP_H };
  }
};

/** Height of a borne-off checker shown edge-on in the tray. */
export const OFF_CHIP_H = 15;

/** Triangle path for a point. */
export const pointPath = (abs: number): string => {
  const x = pointX(abs);
  const half = POINT_W / 2;
  if (isTop(abs)) return `M${x - half},${TOP_Y} L${x + half},${TOP_Y} L${x},${TOP_Y + POINT_H} Z`;
  return `M${x - half},${BOTTOM_Y} L${x + half},${BOTTOM_Y} L${x},${BOTTOM_Y - POINT_H} Z`;
};

/** Which drop target lies under an SVG coordinate (points use their whole half-height column). */
export const slotAt = (x: number, y: number): Slot | null => {
  if (x >= TRAY_X && x <= TRAY_X + TRAY_W) return y > MID_Y ? "off0" : "off1";
  const top = y < MID_Y;
  let col: number | null = null;
  if (x >= LEFT_X && x < BAR_X)
    col = Math.floor((x - LEFT_X) / POINT_W); // 0..5 left half, from left
  else if (x >= RIGHT_X && x < BOARD_RIGHT) col = 6 + Math.floor((x - RIGHT_X) / POINT_W); // 6..11
  if (col === null) return null;
  if (top) return col < 6 ? 12 + col : 18 + (col - 6);
  return col < 6 ? 11 - col : 5 - (col - 6);
};

/**
 * Perspective of the viewer: maps logical slots (engine point indices, per-player bar/off) to
 * the physical slots they are drawn at, so that the viewer's starting point is always top right
 * and their home board bottom right. For white this is the identity; for black it is a vertical
 * mirror (opposite directions) or a 180° rotation (Fevga, same direction).
 */
export interface View {
  readonly viewer: Player;
  /** logical -> physical */
  readonly toScreen: (s: Slot) => Slot;
  /** physical -> logical */
  readonly fromScreen: (s: Slot) => Slot;
  /** Which physical side a player sits on: 0 = bottom/right half (viewer), 1 = top/left. */
  readonly side: (p: Player) => Player;
}

export const makeView = (paths: readonly [readonly number[], readonly number[]], viewer: Player): View => {
  if (viewer === 0) return { viewer, toScreen: (s) => s, fromScreen: (s) => s, side: (p) => p };
  const toPhys = new Array<number>(24);
  const toLogical = new Array<number>(24);
  for (let abs = 0; abs < 24; abs++) {
    // Draw the viewer's path where white's path is drawn.
    const phys = 23 - paths[viewer].indexOf(abs);
    toPhys[abs] = phys;
    toLogical[phys] = abs;
  }
  const swap: Record<string, Slot> = { bar0: "bar1", bar1: "bar0", off0: "off1", off1: "off0" };
  return {
    viewer,
    toScreen: (s) => (typeof s === "number" ? toPhys[s]! : swap[s]!),
    fromScreen: (s) => (typeof s === "number" ? toLogical[s]! : swap[s]!),
    side: (p) => (p === 0 ? 1 : 0),
  };
};
