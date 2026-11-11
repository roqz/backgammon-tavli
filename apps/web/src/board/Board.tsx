import {
  type Dice,
  type From,
  type GameState,
  getVariant,
  type Move,
  ownPoint,
  type Player,
  type To,
} from "@tavli/engine";
import { motion } from "motion/react";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BAR_W,
  BAR_X,
  BOTTOM_Y,
  barSlot,
  CHECKER_R,
  checkerPos,
  FRAME,
  HEIGHT,
  isTop,
  LEFT_X,
  MID_Y,
  OFF_CHIP_H,
  offSlot,
  POINT_W,
  type Pos,
  pointPath,
  pointX,
  RIGHT_X,
  type Slot,
  slotAt,
  TOP_Y,
  TRAY_W,
  TRAY_X,
  WIDTH,
} from "./geometry";
import { fromKey, movableSources, targetsFrom, toKey } from "./interaction";
import { checkerOwner, type Layout, stackAt } from "./layout";
import type { BoardTheme } from "./themes";

export interface BoardProps {
  readonly state: GameState;
  readonly layout: Layout;
  readonly theme: BoardTheme;
  /** Whether the local user may move checkers now. */
  readonly interactive: boolean;
  /** Last opening roll [white, black] to show while deciding who starts. */
  readonly openingDice: OpeningRoll | null;
  /** Show point numbers from this player's perspective. */
  readonly numbersFor: Player | null;
  readonly onMoves: (chain: Move[]) => void;
}

export interface OpeningRoll {
  readonly dice: Dice;
  /** Increments with every opening roll so ties re-animate. */
  readonly seq: number;
}

interface Drag {
  readonly id: string;
  readonly from: From;
  readonly pointerId: number;
  readonly start: Pos;
  readonly cur: Pos;
  readonly moved: boolean;
}

const POINT_INDICES = Array.from({ length: 24 }, (_, i) => i);

const slotOfFrom = (p: Player, f: From): Slot => (f === "bar" ? barSlot(p) : f);

export function Board({ state, layout, theme, interactive, openingDice, numbersFor, onMoves }: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<From | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const turn = state.turn;

  const sources = useMemo(
    () => (interactive ? movableSources(state) : new Set<string>()),
    [state, interactive],
  );
  const active = drag?.from ?? selected;
  const targets = useMemo(
    () => (active !== null && interactive ? targetsFrom(state, active) : new Map<string, Move[]>()),
    [state, active, interactive],
  );

  // Clear selection whenever the position changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on new state only
  useEffect(() => {
    setSelected(null);
    setDrag(null);
  }, [state]);

  const toSvg = (e: PointerEvent): Pos => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  /** Interprets an SVG coordinate as a move source or destination for the player on turn. */
  const locate = (pos: Pos): { from: From | null; to: To | null } => {
    if (pos.x >= BAR_X && pos.x <= BAR_X + BAR_W) return { from: "bar", to: null };
    const slot = slotAt(pos.x, pos.y);
    if (slot === null) return { from: null, to: null };
    if (typeof slot === "number") return { from: slot, to: slot };
    return { from: null, to: slot === offSlot(turn) ? "off" : null };
  };

  const tryMove = (to: To | null): boolean => {
    if (to === null) return false;
    const chain = targets.get(toKey(to));
    if (!chain) return false;
    setSelected(null);
    setDrag(null);
    onMoves(chain);
    return true;
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const pos = toSvg(e);
    const { from, to } = locate(pos);
    if (selected !== null && tryMove(to)) return;
    if (from !== null && sources.has(fromKey(from))) {
      const stack = stackAt(layout, slotOfFrom(turn, from));
      const id = [...stack].reverse().find((c) => checkerOwner(c) === turn);
      if (!id) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ id, from, pointerId: e.pointerId, start: pos, cur: pos, moved: false });
      return;
    }
    setSelected(null);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const cur = toSvg(e);
    const moved = drag.moved || Math.hypot(cur.x - drag.start.x, cur.y - drag.start.y) > 8;
    setDrag({ ...drag, cur, moved });
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      if (!tryMove(locate(drag.cur).to)) setDrag(null);
      setSelected(null);
    } else {
      setSelected(selected === drag.from ? null : drag.from);
      setDrag(null);
    }
  };

  // ---- rendering ---------------------------------------------------------------------------
  const rules = getVariant(state.variant);
  const checkers: { id: string; slot: Slot; i: number; n: number }[] = [];
  for (const [k, ids] of Object.entries(layout)) {
    const slot: Slot = /^\d+$/.test(k) ? Number(k) : (k as Slot);
    ids.forEach((id, i) => {
      checkers.push({ id, slot, i, n: ids.length });
    });
  }
  // Stable render order by id keeps React from remounting; the dragged checker is drawn last.
  checkers.sort((a, b) => (a.id === drag?.id ? 1 : b.id === drag?.id ? -1 : a.i - b.i));

  const targetPoints = new Set([...targets.keys()]);
  const activeSlot = active !== null ? slotOfFrom(turn, active) : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="block h-auto w-full touch-none select-none"
      role="img"
      aria-label="Spielbrett"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      <defs>{theme.defs}</defs>

      {/* frame, felt, bar, tray */}
      <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={14} fill={theme.frame} />
      <rect x={LEFT_X} y={TOP_Y} width={6 * POINT_W} height={HEIGHT - 2 * FRAME} fill={theme.felt} />
      <rect x={RIGHT_X} y={TOP_Y} width={6 * POINT_W} height={HEIGHT - 2 * FRAME} fill={theme.felt} />
      <rect x={BAR_X} y={0} width={BAR_W} height={HEIGHT} fill={theme.bar} />
      <rect x={BAR_X + BAR_W / 2 - 1} y={0} width={2} height={HEIGHT} fill="#000" opacity={0.25} />
      <rect x={TRAY_X} y={TOP_Y} width={TRAY_W} height={MID_Y - TOP_Y - 6} rx={6} fill={theme.tray} />
      <rect x={TRAY_X} y={MID_Y + 6} width={TRAY_W} height={BOTTOM_Y - MID_Y - 6} rx={6} fill={theme.tray} />

      {/* points */}
      {POINT_INDICES.map((abs) => (
        <path key={`pt${abs}`} d={pointPath(abs)} fill={abs % 2 === 0 ? theme.pointA : theme.pointB} />
      ))}

      {/* highlights */}
      {POINT_INDICES.map((abs) =>
        targetPoints.has(String(abs)) ? (
          <path
            key={`hl${abs}`}
            d={pointPath(abs)}
            fill={theme.highlight}
            opacity={0.55}
            className="animate-pulse"
          />
        ) : null,
      )}
      {typeof activeSlot === "number" && (
        <path d={pointPath(activeSlot)} fill={theme.selected} opacity={0.45} />
      )}
      {targetPoints.has("off") && (
        <rect
          x={TRAY_X}
          y={turn === 0 ? MID_Y + 6 : TOP_Y}
          width={TRAY_W}
          height={BOTTOM_Y - MID_Y - 6}
          rx={6}
          fill={theme.highlight}
          opacity={0.45}
          className="animate-pulse"
        />
      )}

      {/* point numbers */}
      {numbersFor !== null &&
        POINT_INDICES.map((abs) => (
          <text
            key={`n${abs}`}
            x={pointX(abs)}
            y={isTop(abs) ? TOP_Y - 4 : BOTTOM_Y + 13}
            textAnchor="middle"
            fontSize={12}
            fill={theme.label}
            opacity={0.85}
          >
            {ownPoint(rules, numbersFor, abs)}
          </text>
        ))}

      {/* movable sources */}
      {interactive &&
        drag === null &&
        [...sources].map((k) => {
          if (k === "bar") return null;
          const abs = Number(k);
          const n = stackAt(layout, abs).length;
          const top = checkerPos(abs, n - 1, n);
          return (
            <circle
              key={`src${k}`}
              cx={top.x}
              cy={top.y}
              r={CHECKER_R + 4}
              fill="none"
              stroke={theme.selected}
              strokeWidth={2}
              strokeDasharray="4 4"
              opacity={0.8}
            />
          );
        })}

      {/* checkers */}
      {checkers.map(({ id, slot, i, n }) => {
        const owner = checkerOwner(id);
        const look = theme.checkers[owner];
        const isDragged = drag?.id === id && drag.moved;
        const pos = isDragged ? drag.cur : checkerPos(slot, i, n);
        const off = slot === "off0" || slot === "off1";
        const pinnedBelow =
          typeof slot === "number" && i === 0 && n > 1 && state.board.pinned[slot] === owner;
        return (
          <motion.g
            key={id}
            initial={false}
            animate={{ x: pos.x, y: pos.y }}
            transition={isDragged ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
            style={{ pointerEvents: "none" }}
            filter="url(#cl-shadow)"
          >
            {off ? (
              <rect
                x={-CHECKER_R}
                y={-OFF_CHIP_H / 2 + 1}
                width={CHECKER_R * 2}
                height={OFF_CHIP_H - 2}
                rx={3}
                fill={look.fill}
                stroke={look.edge}
              />
            ) : (
              <>
                <circle r={CHECKER_R} fill={look.fill} stroke={look.edge} strokeWidth={2} />
                <circle r={CHECKER_R * 0.62} fill="none" stroke={look.ring} strokeWidth={2} opacity={0.8} />
                {pinnedBelow && <circle r={CHECKER_R * 0.25} fill={theme.highlight} opacity={0.9} />}
                {activeSlot === slot && i === n - 1 && (
                  <circle r={CHECKER_R + 2} fill="none" stroke={theme.selected} strokeWidth={3} />
                )}
              </>
            )}
          </motion.g>
        );
      })}

      <DiceLayer state={state} theme={theme} openingDice={openingDice} />
      <CubeView state={state} theme={theme} />
    </svg>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

function Die({
  x,
  y,
  value,
  size,
  faded,
  theme,
  edge,
}: {
  x: number;
  y: number;
  value: number;
  size: number;
  faded?: boolean;
  theme: BoardTheme;
  edge?: string;
}) {
  const s = size / 2;
  return (
    <motion.g
      initial={{ rotate: -120, scale: 0.4, opacity: 0 }}
      animate={{ rotate: 0, scale: 1, opacity: faded ? 0.35 : 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 14 }}
      style={{ x, y, pointerEvents: "none" }}
    >
      <rect
        x={-s}
        y={-s}
        width={size}
        height={size}
        rx={size * 0.18}
        fill={theme.die.fill}
        stroke={edge ?? theme.die.edge}
        strokeWidth={edge ? 4 : 2}
      />
      {PIPS[value]?.map(([dx, dy]) => (
        <circle
          key={`${dx}${dy}`}
          cx={dx * s * 0.52}
          cy={dy * s * 0.52}
          r={size * 0.09}
          fill={theme.die.pip}
        />
      ))}
    </motion.g>
  );
}

function DiceLayer({
  state,
  theme,
  openingDice,
}: {
  state: GameState;
  theme: BoardTheme;
  openingDice: OpeningRoll | null;
}) {
  const halfCenter = (p: Player) => (p === 0 ? RIGHT_X + 3 * POINT_W : LEFT_X + 3 * POINT_W);
  if (state.phase === "opening" && openingDice) {
    return (
      <g key={`open${openingDice.seq}`}>
        <Die x={halfCenter(0)} y={MID_Y} value={openingDice.dice[0]} size={52} theme={theme} />
        <Die
          x={halfCenter(1)}
          y={MID_Y}
          value={openingDice.dice[1]}
          size={52}
          theme={theme}
          edge={theme.checkers[1].edge}
        />
      </g>
    );
  }
  if (!state.dice || state.phase !== "moving") return null;
  const [a, b] = state.dice;
  const values = a === b ? [a, a, a, a] : [a, b];
  // Mark used dice: remove remaining values, whatever is left over was played.
  const remaining = [...state.remaining];
  const used = values.map((v) => {
    const idx = remaining.indexOf(v);
    if (idx >= 0) {
      remaining.splice(idx, 1);
      return false;
    }
    return true;
  });
  const size = values.length === 4 ? 44 : 52;
  const gap = size + 12;
  const cx = halfCenter(state.turn);
  const start = cx - ((values.length - 1) * gap) / 2;
  return (
    <g key={`dice${state.history.length}${a}${b}`}>
      {values.map((v, i) => (
        <Die
          // biome-ignore lint/suspicious/noArrayIndexKey: dice are positional
          key={i}
          x={start + i * gap}
          y={MID_Y}
          value={v}
          size={size}
          faded={used[i]}
          theme={theme}
        />
      ))}
    </g>
  );
}

function CubeView({ state, theme }: { state: GameState; theme: BoardTheme }) {
  // Tavli variants have no doubling cube by rule; in Backgammon it is always shown,
  // greyed out while unavailable (1-point match, Crawford game).
  if (!getVariant(state.variant).cube) return null;
  const { value, owner, enabled } = state.cube;
  const size = 44;
  const x = BAR_X + BAR_W / 2;
  const y = owner === null ? MID_Y : owner === 0 ? BOTTOM_Y - size / 2 - 4 : TOP_Y + size / 2 + 4;
  const offered = state.phase === "cube-offered";
  return (
    <motion.g
      initial={false}
      animate={{ x, y, scale: offered ? 1.25 : 1, opacity: enabled ? 1 : 0.35 }}
      transition={{ type: "spring", stiffness: 220, damping: 20 }}
      style={{ pointerEvents: "none" }}
    >
      <rect
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        rx={7}
        fill={theme.cube.fill}
        stroke={offered ? theme.highlight : "#00000055"}
        strokeWidth={offered ? 4 : 2}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={20}
        fontWeight={700}
        fill={theme.cube.text}
      >
        {offered ? value * 2 : value === 1 ? 64 : value}
      </text>
    </motion.g>
  );
}
