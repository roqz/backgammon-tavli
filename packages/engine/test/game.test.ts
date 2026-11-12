import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyActions,
  boardFromSpec,
  canConfirm,
  canDouble,
  createGame,
  formatHistory,
  getVariant,
  IllegalActionError,
  isClosedOut,
  maxResultLevel,
  playerToAct,
} from "../src";
import { mv, play, position } from "./helpers";

const BG = "backgammon";

describe("game flow", () => {
  it("re-rolls ties in the opening and plays the opening dice in backgammon", () => {
    let g = createGame({ variant: BG });
    expect(g.phase).toBe("opening");
    g = applyAction(g, { type: "roll", dice: [4, 4] });
    expect(g.phase).toBe("opening");
    g = applyAction(g, { type: "roll", dice: [3, 1] });
    expect(g).toMatchObject({ phase: "moving", turn: 0, remaining: [3, 1] });
  });

  it("plays, confirms and records a turn in standard notation", () => {
    let g = applyAction(createGame({ variant: BG }), { type: "roll", dice: [3, 1] });
    g = play(g, mv(BG, 0, 8, 5, 3), mv(BG, 0, 6, 5, 1));
    expect(canConfirm(g)).toBe(true);
    g = applyAction(g, { type: "confirm" });
    expect(g).toMatchObject({ phase: "rolling", turn: 1 });
    expect(formatHistory(g)).toEqual(["White: 31: 8/5 6/5"]);
  });

  it("cannot confirm while moves are still possible", () => {
    const g = applyAction(createGame({ variant: BG }), { type: "roll", dice: [3, 1] });
    expect(() => applyAction(g, { type: "confirm" })).toThrow(IllegalActionError);
  });

  it("undo restores board and dice", () => {
    const g0 = applyAction(createGame({ variant: BG }), { type: "roll", dice: [6, 5] });
    const g1 = play(g0, mv(BG, 0, 24, 18, 6));
    const g2 = applyAction(g1, { type: "undo" });
    expect(g2.board).toEqual(g0.board);
    expect([...g2.remaining].sort()).toEqual([5, 6]);
    expect(g2.played).toEqual([]);
  });

  it("rejects illegal moves", () => {
    const g = applyAction(createGame({ variant: BG }), { type: "roll", dice: [6, 5] });
    expect(() => play(g, mv(BG, 0, 24, 13, 6))).toThrow(IllegalActionError);
  });

  it("records a turn without any legal move as 'no play'", () => {
    let g = position(
      BG,
      { white: { 13: 14 }, black: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 }, bar: [1, 0] },
      0,
      [3, 4],
    );
    g = applyAction(g, { type: "confirm" });
    expect(formatHistory(g)).toEqual(["White: 34: no play"]);
  });
});

describe("closed out", () => {
  const closed = { white: { 13: 14 }, black: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 }, bar: [1, 0] as const };

  it("skips the turn without rolling when every entry point is blocked", () => {
    const g = createGame({ variant: BG, starter: 0, board: boardFromSpec(getVariant(BG), closed) });
    expect(isClosedOut(g)).toBe(true);
    const after = applyAction(g, { type: "pass" });
    expect(after).toMatchObject({ phase: "rolling", turn: 1 });
    expect(formatHistory(after)).toEqual(["White: closed out"]);
  });

  it("is not allowed with an open entry point", () => {
    const board = boardFromSpec(getVariant(BG), { ...closed, black: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1 } });
    const g = createGame({ variant: BG, starter: 0, board });
    expect(isClosedOut(g)).toBe(false);
    expect(() => applyAction(g, { type: "pass" })).toThrow(IllegalActionError);
  });
});

describe("doubling cube", () => {
  const rolling = () => createGame({ variant: BG, starter: 0 });

  it("doubles, takes and transfers cube ownership", () => {
    let g = rolling();
    expect(canDouble(g)).toBe(true);
    g = applyAction(g, { type: "double" });
    expect(g.phase).toBe("cube-offered");
    expect(playerToAct(g)).toBe(1);
    g = applyAction(g, { type: "take" });
    expect(g.cube).toMatchObject({ value: 2, owner: 1 });
    expect(g.phase).toBe("rolling");
    expect(canDouble(g)).toBe(false); // white no longer owns the cube
  });

  it("drop ends the game for the current cube value", () => {
    const g = applyActions(rolling(), [{ type: "double" }, { type: "drop" }]);
    expect(g.result).toMatchObject({ winner: 0, points: 1, reason: "drop" });
  });

  it("is not available when disabled (Crawford) or in tavli variants", () => {
    expect(canDouble(createGame({ variant: BG, starter: 0, cube: false }))).toBe(false);
    expect(canDouble(createGame({ variant: "portes", starter: 0 }))).toBe(false);
  });

  it("multiplies the result by the cube value", () => {
    let g = applyActions(rolling(), [{ type: "double" }, { type: "take" }]);
    g = applyAction(g, { type: "resign", player: 1, level: 2 });
    expect(g.result).toMatchObject({ winner: 0, level: 2, cube: 2, points: 4 });
  });
});

describe("results", () => {
  const finishWith = (black: Record<number, number>, extra: object = {}, jacoby = false) => {
    const s = position(BG, { white: { 2: 1 }, black, off: [14, 0], ...extra }, 0, [2, 1]);
    return play({ ...s, jacoby }, mv(BG, 0, 2, "off", 2)).result;
  };

  it("single game when the loser has borne off", () => {
    expect(finishWith({ 1: 14 }, { off: [14, 1] })?.level).toBe(1);
  });

  it("gammon when the loser has not borne off", () => {
    expect(finishWith({ 13: 15 })?.level).toBe(2);
  });

  it("backgammon with a checker in the winner's home board", () => {
    expect(finishWith({ 13: 14, 24: 1 })?.level).toBe(3);
  });

  it("backgammon with a checker on the bar", () => {
    expect(finishWith({ 13: 14 }, { bar: [0, 1] })?.level).toBe(3);
  });

  it("Jacoby rule: no gammon with centred cube", () => {
    expect(finishWith({ 13: 15 }, {}, true)?.level).toBe(1);
  });
});

describe("resignation levels", () => {
  const max = (spec: Parameters<typeof position>[1], variant: Parameters<typeof position>[0] = BG) =>
    maxResultLevel(position(variant, spec, 0, [2, 1]), 0);

  it("no backgammon once the race is on and the loser is out of the winner's home", () => {
    expect(max({ white: { 2: 5, 3: 10 }, black: { 13: 15 } })).toBe(2);
  });

  it("backgammon still possible with contact, a checker in the winner's home or on the bar", () => {
    expect(max({ white: { 13: 1, 3: 14 }, black: { 13: 15 } })).toBe(3);
    expect(max({ white: { 3: 15 }, black: { 13: 14, 24: 1 } })).toBe(3);
    expect(max({ white: { 3: 15 }, black: { 13: 14 }, bar: [0, 1] })).toBe(3);
  });

  it("single only after the loser bore off; at most a gammon in tavli variants", () => {
    expect(max({ white: { 3: 15 }, black: { 13: 14 }, off: [0, 1] })).toBe(1);
    expect(max({ white: { 13: 1, 3: 14 }, black: { 13: 15 } }, "portes")).toBe(2);
  });

  it("a resignation never concedes more than the game can still end with", () => {
    const race = position(BG, { white: { 2: 5, 3: 10 }, black: { 13: 15 } }, 1, [2, 1]);
    expect(applyAction(race, { type: "resign", player: 1, level: 3 }).result?.level).toBe(2);
    const offer = applyAction(race, { type: "offer-resign", player: 1, level: 3 });
    expect(offer.resignOffer?.level).toBe(2);
  });
});
