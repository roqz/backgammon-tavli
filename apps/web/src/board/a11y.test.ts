import { applyAction, createGame } from "@tavli/engine";
import { describe, expect, it } from "vitest";
import { DICTS } from "../i18n";
import { ALL_CELLS, cellAt, cellLabel, navigate, positionSummary, posOf } from "./a11y";
import { pointX } from "./geometry";

const de = DICTS.de;
const en = DICTS.en;
const none = { movable: false, target: false, selected: false };

describe("keyboard grid", () => {
  it("covers every point, the bar and the tray exactly once", () => {
    expect(new Set(ALL_CELLS).size).toBe(26);
    for (let p = 0; p < 24; p++) expect(cellAt(posOf(p))).toBe(p);
  });

  it("orders each row by the drawn x position", () => {
    for (const row of [0, 1] as const) {
      const xs = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12].map((col) => pointX(cellAt({ row, col }) as number));
      expect(xs).toEqual([...xs].sort((a, b) => a - b));
    }
  });

  it("moves right on screen, also when mirrored or turned for portrait", () => {
    const start = posOf(5); // bottom row, right of the bar
    expect(cellAt(navigate(start, "ArrowRight", false, false)!)).toBe(4);
    expect(cellAt(navigate(start, "ArrowRight", false, true)!)).toBe("bar");
    expect(cellAt(navigate(start, "ArrowUp", false, false)!)).toBe(18);
    // portrait: columns run downwards, the top row is on the right
    expect(cellAt(navigate(start, "ArrowDown", true, false)!)).toBe(4);
    expect(cellAt(navigate(start, "ArrowRight", true, false)!)).toBe(18);
  });

  it("stops at the edges and passes bar and tray in both rows", () => {
    expect(navigate({ row: 0, col: 0 }, "ArrowLeft", false, false)).toEqual({ row: 0, col: 0 });
    expect(cellAt(navigate(posOf(17), "ArrowRight", false, false)!)).toBe("bar");
    expect(cellAt(navigate({ row: 1, col: 6 }, "ArrowRight", false, false)!)).toBe(5);
    expect(navigate(posOf(3), "Tab", false, false)).toBeNull();
  });
});

describe("labels", () => {
  const g = createGame({ variant: "backgammon" });

  it("names a point with its checkers and state", () => {
    expect(cellLabel(de, g.board, { abs: 12 }, 13, { ...none, target: true })).toBe(
      "Punkt 13: 5 weiße Steine, Ziel möglich",
    );
    expect(cellLabel(en, g.board, { abs: 23 }, 24, { ...none, movable: true })).toBe(
      "Point 24: 2 white checkers, can move",
    );
    expect(cellLabel(en, g.board, { abs: 1 }, 2, none)).toBe("Point 2: empty");
    expect(cellLabel(de, g.board, "bar", null, none)).toBe("Bar: leer");
  });

  it("summarises turn, dice, pips and the last move", () => {
    const rolled = applyAction({ ...g, phase: "rolling", turn: 0 }, { type: "roll", dice: [3, 1] });
    const moved = applyAction(rolled, { type: "move", move: { from: 7, to: 4, die: 3 } });
    const text = positionSummary(de, moved);
    expect(text).toContain("Weiß ist am Zug");
    expect(text).toContain("Würfel 3 1, übrig 1");
    expect(text).toContain("Pips: Weiß 164, Schwarz 167");
    expect(text).toContain("Letzter Zug Weiß: 8/5");
  });
});
