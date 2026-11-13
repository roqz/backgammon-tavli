import {
  applyAction,
  createGame,
  type GameState,
  getVariant,
  legalMoves,
  type Player,
  rollDice,
  seededRng,
  type VariantId,
} from "@tavli/engine";
import { describe, expect, it } from "vitest";
import { checkerPos, makeView, pointX, slotAt } from "./geometry";
import { targetsFrom } from "./interaction";
import { applyMoveToLayout, layoutFromBoard, layoutMatches, stackAt, undoMoveInLayout } from "./layout";

describe("geometry", () => {
  it("maps every point centre back to its point", () => {
    for (let abs = 0; abs < 24; abs++) {
      const { y } = checkerPos(abs, 0, 1);
      expect(slotAt(pointX(abs), y)).toBe(abs);
    }
  });

  it("places white's home bottom right and its 24-point top right", () => {
    expect(pointX(0)).toBeGreaterThan(pointX(5));
    expect(pointX(23)).toBeGreaterThan(pointX(18));
    expect(checkerPos(0, 0, 1).y).toBeGreaterThan(checkerPos(23, 0, 1).y);
  });
});

describe("targetsFrom", () => {
  it("offers combined moves of one checker (24 -> 13 with 6-5)", () => {
    const g = applyAction(createGame({ variant: "backgammon" }), { type: "roll", dice: [6, 5] });
    const targets = targetsFrom(g, 23); // white's 24-point
    // 24/19 is blocked (black holds it), so the only way is 24/18/13
    expect(targets.get("12")?.map((m) => m.die)).toEqual([6, 5]);
    expect(targets.get("17")).toHaveLength(1);
  });
});

/** Random playouts keep the identity layout consistent with the engine board, including undo. */
describe("layout tracking", () => {
  const variants: VariantId[] = ["backgammon", "portes", "plakoto", "fevga", "tavla", "narde", "hypergammon"];
  for (const variant of variants) {
    it(`${variant}: stays in sync during random games`, () => {
      const rng = seededRng(42);
      let g: GameState = createGame({ variant });
      let layout = layoutFromBoard(g.board);
      for (let i = 0; i < 400 && g.phase !== "finished"; i++) {
        if (g.phase === "opening" || g.phase === "rolling") {
          g = applyAction(g, { type: "roll", dice: rollDice(rng) });
          continue;
        }
        const moves = legalMoves(g);
        if (moves.length === 0) {
          g = applyAction(g, { type: "confirm" });
          continue;
        }
        const p: Player = g.turn;
        const after = applyAction(g, { type: "move", move: moves[Math.floor(rng() * moves.length)]! });
        const played =
          after.phase === "finished"
            ? (after.history.at(-1) as { moves: GameState["played"] }).moves.at(-1)!
            : after.played.at(-1)!;
        const next = applyMoveToLayout(layout, variant, p, played);
        expect(layoutMatches(next, after.board)).toBe(true);
        // undo once in a while and redo
        if (after.phase === "moving" && rng() < 0.2) {
          const undone = applyAction(after, { type: "undo" });
          expect(layoutMatches(undoMoveInLayout(next, variant, p, played), undone.board)).toBe(true);
        }
        g = after;
        layout = next;
      }
      // ids are unique
      const all = Object.values(layout).flat();
      expect(new Set(all).size).toBe(variant === "hypergammon" ? 6 : 30);
    });
  }

  it("puts a pinned checker beneath the pinning checker", () => {
    let g = createGame({ variant: "plakoto", starter: 0 });
    g = applyAction(g, { type: "roll", dice: [3, 1] });
    const layout = layoutFromBoard({
      ...g.board,
      points: [
        g.board.points[0].map((n, i) => (i === 20 ? 1 : n)),
        g.board.points[1].map((n, i) => (i === 20 ? 1 : n)),
      ],
      pinned: g.board.pinned.map((x, i) => (i === 20 ? 1 : x)),
    });
    expect(stackAt(layout, 20).map((id) => id[0])).toEqual(["b", "w"]);
  });
});

describe("perspective", () => {
  for (const variant of ["backgammon", "plakoto", "fevga"] as const) {
    it(`${variant}: black sees its start top right and its home bottom right`, () => {
      const rules = getVariant(variant);
      const view = makeView(rules.paths, 1);
      const start = rules.paths[1][0]!;
      const lastHome = rules.paths[1][23]!;
      expect(view.toScreen(start)).toBe(23); // white's 24-point position: top right
      expect(view.toScreen(lastHome)).toBe(0); // bottom right
      for (let abs = 0; abs < 24; abs++) expect(view.fromScreen(view.toScreen(abs))).toBe(abs);
      expect(view.toScreen("off1")).toBe("off0");
      expect(view.side(1)).toBe(0);
    });
  }
  it("white's view is the identity", () => {
    const view = makeView([[], []], 0);
    expect(view.toScreen(5)).toBe(5);
    expect(view.toScreen("bar0")).toBe("bar0");
  });
});
