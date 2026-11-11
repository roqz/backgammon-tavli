import type { Board, PlayedMove, Player, VariantId } from "@tavli/engine";
import { getVariant } from "@tavli/engine";
import { barSlot, offSlot, type Slot } from "./geometry";

/**
 * The engine only knows checker counts. For smooth animations the UI tracks checker identities:
 * every slot holds a stack of checker ids, index 0 = outermost (bottom of the stack).
 */
export type Layout = Readonly<Record<string, readonly string[]>>;

export const checkerOwner = (id: string): Player => (id.startsWith("w") ? 0 : 1);

const key = (slot: Slot) => String(slot);

/** Mutable stack of a slot in a working copy, created on first access. */
const stackOf = (out: Record<string, string[]>, slot: Slot): string[] => {
  const k = key(slot);
  if (!out[k]) out[k] = [];
  return out[k];
};

export const stackAt = (layout: Layout, slot: Slot): readonly string[] => layout[key(slot)] ?? [];

/** Build a fresh layout from a board (pinned Plakoto checkers go to the bottom of their stack). */
export const layoutFromBoard = (board: Board): Layout => {
  const next = [0, 0];
  const take = (p: Player) => `${p === 0 ? "w" : "b"}${next[p]!++}`;
  const out: Record<string, string[]> = {};
  const fill = (slot: Slot, p: Player, n: number) => {
    const stack = stackOf(out, slot);
    for (let i = 0; i < n; i++) stack.push(take(p));
  };
  for (let abs = 0; abs < 24; abs++) {
    const pinned = board.pinned[abs];
    if (pinned !== null && pinned !== undefined) {
      fill(abs, pinned, board.points[pinned][abs]!);
      fill(abs, pinned === 0 ? 1 : 0, board.points[pinned === 0 ? 1 : 0][abs]!);
    } else {
      fill(abs, 0, board.points[0][abs]!);
      fill(abs, 1, board.points[1][abs]!);
    }
  }
  for (const p of [0, 1] as Player[]) {
    fill(barSlot(p), p, board.bar[p]);
    fill(offSlot(p), p, board.off[p]);
  }
  return out;
};

const sourceSlot = (p: Player, m: PlayedMove): Slot => (m.from === "bar" ? barSlot(p) : m.from);
const targetSlot = (p: Player, m: PlayedMove): Slot => (m.to === "off" ? offSlot(p) : m.to);

const clone = (layout: Layout): Record<string, string[]> =>
  Object.fromEntries(Object.entries(layout).map(([k, v]) => [k, v.slice()]));

export const applyMoveToLayout = (layout: Layout, variant: VariantId, p: Player, m: PlayedMove): Layout => {
  const out = clone(layout);
  const from = stackOf(out, sourceSlot(p, m));
  const to = stackOf(out, targetSlot(p, m));
  const id = from.pop();
  if (!id) return layout;
  if (m.hit && getVariant(variant).blots === "hit") {
    const opp: Player = p === 0 ? 1 : 0;
    const hitId = to.pop();
    if (hitId) stackOf(out, barSlot(opp)).push(hitId);
  }
  to.push(id);
  return out;
};

export const undoMoveInLayout = (layout: Layout, variant: VariantId, p: Player, m: PlayedMove): Layout => {
  const out = clone(layout);
  const to = stackOf(out, targetSlot(p, m));
  const from = stackOf(out, sourceSlot(p, m));
  const id = to.pop();
  if (!id) return layout;
  if (m.hit && getVariant(variant).blots === "hit") {
    const opp: Player = p === 0 ? 1 : 0;
    const hitId = out[key(barSlot(opp))]?.pop();
    if (hitId) to.push(hitId);
  }
  from.push(id);
  return out;
};

/** True if the layout matches the board's counts (guards against drift; rebuild otherwise). */
export const layoutMatches = (layout: Layout, board: Board): boolean => {
  const count = (slot: Slot, p: Player) =>
    stackAt(layout, slot).filter((id) => checkerOwner(id) === p).length;
  for (const p of [0, 1] as Player[]) {
    for (let abs = 0; abs < 24; abs++) if (count(abs, p) !== board.points[p][abs]) return false;
    if (count(barSlot(p), p) !== board.bar[p] || count(offSlot(p), p) !== board.off[p]) return false;
  }
  return true;
};
