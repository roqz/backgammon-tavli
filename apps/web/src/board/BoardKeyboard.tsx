import type { From, GameState, Move, Player, To } from "@tavli/engine";
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { Dict } from "../i18n";
import {
  ALL_CELLS,
  type Cell,
  type CellFlags,
  cellAt,
  cellLabel,
  type GridPos,
  navigate,
  pointNumber,
  positionSummary,
  posOf,
} from "./a11y";
import { BAR_W, BAR_X, BOTTOM_Y, MID_Y, POINT_W, pointX, TOP_Y, TRAY_W, TRAY_X, type View } from "./geometry";
import { fromKey, targetsFrom } from "./interaction";

/**
 * Keyboard play and screen reader output for the board. Keys only move a focus cursor and then
 * call the same select/move steps as tapping (`targetsFrom`, `tryMove`), so the rules applied to
 * keyboard and pointer input are identical.
 */

/** Logical move source/destination of a cell for the player on turn (mirrors Board's `locate`). */
const logicalOf = (view: View, cell: Cell): { from: From | null; to: To | null } => {
  if (cell === "bar") return { from: "bar", to: null };
  if (cell === "tray") return { from: null, to: "off" };
  const abs = view.fromScreen(cell) as number;
  return { from: abs, to: abs };
};

const cellOfFrom = (view: View, f: From): Cell => (f === "bar" ? "bar" : (view.toScreen(f) as number));

const sameFrom = (a: From | null, b: From | null) => a !== null && a === b;

export interface KeyboardInput {
  readonly state: GameState;
  readonly view: View;
  readonly t: Dict;
  readonly interactive: boolean;
  readonly rotated: boolean;
  readonly mirrored: boolean;
  /** Perspective of spoken point numbers (the one drawn on the board, else the viewer's). */
  readonly numbersFor: Player;
  readonly sources: ReadonlySet<string>;
  readonly selected: From | null;
  readonly setSelected: (f: From | null) => void;
  /** Plays the move to `to` if it is a target of the current selection (Board's tap logic). */
  readonly tryMove: (to: To | null) => boolean;
  readonly svgRef: RefObject<SVGSVGElement | null>;
}

export interface Announcement {
  readonly text: string;
  /** Bumped on every announcement so repeating the same text is read again. */
  readonly seq: number;
}

export function useBoardKeyboard(k: KeyboardInput) {
  const { state, view, t, sources, selected, svgRef } = k;
  const [cursor, setCursor] = useState<GridPos>({ row: 1, col: 12 });
  const [announcement, setAnnouncement] = useState<Announcement>({ text: "", seq: 0 });
  const say = (text: string) => setAnnouncement((a) => ({ text, seq: a.seq + 1 }));

  // While the board is not focused, park the cursor on a checker that can move, so that
  // tabbing into the board lands where the user most likely wants to start.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the movable checkers change
  useEffect(() => {
    if (svgRef.current?.contains(document.activeElement)) return;
    const first = [...sources][0];
    if (first !== undefined) setCursor(posOf(cellOfFrom(view, first === "bar" ? "bar" : Number(first))));
  }, [sources]);

  // Read out the position after every change (moves, rolls, the opponent's turn), but not on mount.
  const mounted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: announce new positions only
  useEffect(() => {
    if (mounted.current) say(positionSummary(t, state));
    mounted.current = true;
  }, [state]);

  const targetName = (key: string) =>
    key === "off" ? t.a11yOff : String(pointNumber(state, k.numbersFor, Number(key)));

  /** Enter/Space on a cell: like a tap – move to a target, else pick up or put down a checker. */
  const activate = (cell: Cell) => {
    const { from, to } = logicalOf(view, cell);
    if (selected !== null && k.tryMove(to)) return;
    if (from !== null && sources.has(fromKey(from)) && !sameFrom(selected, from)) {
      k.setSelected(from);
      const names = [...targetsFrom(state, from).keys()].map(targetName).join(", ");
      say(`${cellName(cell)} ${t.a11ySelected}. ${t.a11yTargets}: ${names}`);
      return;
    }
    if (selected !== null) {
      k.setSelected(null);
      say(t.a11yCancelled);
    }
  };

  const cellName = (cell: Cell) =>
    cell === "bar"
      ? t.a11yBar
      : cell === "tray"
        ? t.a11yOff
        : `${t.a11yPoint} ${pointNumber(state, k.numbersFor, view.fromScreen(cell) as number)}`;

  const focusCell = (pos: GridPos) => {
    setCursor(pos);
    svgRef.current?.querySelector<SVGGElement>(`[data-cell="${cellAt(pos)}"]`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const next = navigate(cursor, e.key, k.rotated, k.mirrored);
    // Handled keys stop here so page-wide shortcuts (e.g. replay stepping) do not fire as well.
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (next) {
      handled();
      focusCell(next);
    } else if ((e.key === "Enter" || e.key === " ") && k.interactive) {
      handled();
      activate(cellAt(cursor));
    } else if (e.key === "Escape" && selected !== null) {
      handled();
      k.setSelected(null);
      say(t.a11yCancelled);
    } else if (e.key === "s" || e.key === "S") {
      handled();
      say(positionSummary(t, state));
    }
  };

  /** Keeps the cursor in sync when a cell gets focus by other means (Tab, screen reader). */
  const onCellFocus = (cell: Cell) => setCursor((c) => (cellAt(c) === cell ? c : posOf(cell, c.row)));

  return { cursor, announcement, onKeyDown, onCellFocus };
}

/** Area of a cell in board units: a point's half-height column, or the whole bar/tray. */
const cellRect = (cell: Cell) => {
  if (cell === "bar") return { x: BAR_X, y: TOP_Y, width: BAR_W, height: BOTTOM_Y - TOP_Y };
  if (cell === "tray") return { x: TRAY_X, y: TOP_Y, width: TRAY_W, height: BOTTOM_Y - TOP_Y };
  const top = cell >= 12;
  return { x: pointX(cell) - POINT_W / 2, y: top ? TOP_Y : MID_Y, width: POINT_W, height: MID_Y - TOP_Y };
};

/**
 * Invisible focusable buttons over every point, the bar and the tray (roving tabindex: only the
 * cursor cell is in the tab order). They ignore the pointer so tapping and dragging keep working
 * exactly as before; a ring is drawn only for keyboard focus.
 */
export function FocusCells({
  state,
  view,
  t,
  cursor,
  numbersFor,
  sources,
  targets,
  selected,
  ringColor,
  onCellFocus,
}: {
  state: GameState;
  view: View;
  t: Dict;
  cursor: GridPos;
  numbersFor: Player;
  sources: ReadonlySet<string>;
  targets: ReadonlyMap<string, Move[]>;
  selected: From | null;
  ringColor: string;
  onCellFocus: (cell: Cell) => void;
}) {
  const current = cellAt(cursor);
  const flagsOf = (cell: Cell): CellFlags => {
    const { from, to } = logicalOf(view, cell);
    return {
      movable: from !== null && sources.has(fromKey(from)),
      target: to !== null && targets.has(String(to)),
      selected: sameFrom(selected, from),
    };
  };
  const labelOf = (cell: Cell) => {
    if (cell === "bar" || cell === "tray") return cellLabel(t, state.board, cell, null, flagsOf(cell));
    const abs = view.fromScreen(cell) as number;
    return cellLabel(t, state.board, { abs }, pointNumber(state, numbersFor, abs), flagsOf(cell));
  };
  return (
    <g style={{ pointerEvents: "none" }}>
      {ALL_CELLS.map((cell) => {
        const r = cellRect(cell);
        return (
          // biome-ignore lint/a11y/useSemanticElements: SVG has no <button>; a focusable group is the SVG idiom
          <g
            key={`cell-${cell}`}
            data-cell={cell}
            role="button"
            tabIndex={cell === current ? 0 : -1}
            aria-label={labelOf(cell)}
            className="group outline-none"
            onFocus={() => onCellFocus(cell)}
          >
            <rect {...r} fill="transparent" />
            <rect
              x={r.x + 3}
              y={r.y + 3}
              width={r.width - 6}
              height={r.height - 6}
              rx={8}
              fill="none"
              stroke={ringColor}
              strokeWidth={4}
              className="opacity-0 group-focus-visible:opacity-100"
            />
          </g>
        );
      })}
    </g>
  );
}

/** Visually hidden live region; a new node per announcement makes screen readers read repeats. */
export function LiveRegion({ announcement }: { announcement: Announcement }) {
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="board-live">
      {announcement.text && <span key={announcement.seq}>{announcement.text}</span>}
    </div>
  );
}
