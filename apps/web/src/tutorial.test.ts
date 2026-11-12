import { applyAction, canConfirm } from "@tavli/engine";
import { describe, expect, it } from "vitest";
import { hintMoves, LESSONS, lessonState } from "./screens/TutorialScreen";

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
});
