import { absFromOwnPoint, applyAction, canConfirm, getVariant, legalMoves } from "@tavli/engine";
import { describe, expect, it } from "vitest";
import { hintMoves, LESSONS, lessonState } from "./screens/TutorialScreen";

const lesson = (prefix: string) => LESSONS.find((l) => l.title.en.startsWith(prefix))!;

describe("tutorial", () => {
  it("every lesson is solved by its hint, and the start position is not already solved", () => {
    for (const lesson of LESSONS) {
      let s = lessonState(lesson);
      expect(lesson.goal(s), lesson.title.en).toBe(false);
      for (const move of hintMoves(lesson)) s = applyAction(s, { type: "move", move });
      expect(canConfirm(s), lesson.title.en).toBe(true);
      expect(lesson.goal(s), lesson.title.en).toBe(true);
    }
  });

  it("no lesson puts both colours on one point (except a pinned checker in Plakoto)", () => {
    for (const lesson of LESSONS) {
      const b = lessonState(lesson).board;
      for (let abs = 0; abs < 24; abs++) {
        const both = b.points[0][abs]! > 0 && b.points[1][abs]! > 0;
        expect(both && b.pinned[abs] == null, `${lesson.title.en}, point ${abs}`).toBe(false);
      }
    }
  });

  it("Tavla: the checker that hit in the home board cannot move on", () => {
    const l = lesson("7 ·");
    const rules = getVariant(l.variant);
    const [hit] = hintMoves(l);
    const s = applyAction(lessonState(l), { type: "move", move: hit! });
    expect(s.board.bar[1]).toBe(1);
    const four = absFromOwnPoint(rules, 0, 4);
    expect(legalMoves(s).some((m) => m.from === four)).toBe(false);
  });

  it("Tavla: a die that can bear off has to", () => {
    const l = lesson("8 ·");
    const [six] = hintMoves(l);
    const s = applyAction(lessonState(l), { type: "move", move: six! });
    expect(legalMoves(s).every((m) => m.to === "off")).toBe(true);
  });

  it("Narde: one checker leaves the head, two on a first double six", () => {
    const one = lesson("9 ·");
    const head = absFromOwnPoint(getVariant("narde"), 0, 24);
    const [first] = hintMoves(one);
    const s = applyAction(lessonState(one), { type: "move", move: first! });
    expect(legalMoves(s).some((m) => m.from === head)).toBe(false);
    const two = lesson("10 ·");
    const [a] = hintMoves(two);
    const t = applyAction(lessonState(two), { type: "move", move: a! });
    expect(legalMoves(t).some((m) => m.from === head)).toBe(true);
  });
});
