import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyActions,
  boardKey,
  createGame,
  createMatch,
  gameFromXgid,
  getVariant,
  initialBoard,
  parseXgid,
  toXgid,
  XgidError,
} from "../src";

const START = "XGID=-b----E-C---eE---c-e----B-:0:0:1:00:0:0:0:0:10";

describe("XGID", () => {
  it("writes the starting position like eXtreme Gammon", () => {
    const g = createGame({ variant: "backgammon", starter: 0 });
    expect(toXgid(g)).toBe(START);
  });

  it("reads the starting position", () => {
    const x = parseXgid(START);
    expect(boardKey(x.board)).toBe(boardKey(initialBoard(getVariant("backgammon"))));
    expect(x).toMatchObject({
      turn: 0,
      dice: null,
      doubled: false,
      length: 0,
      cube: { value: 1, owner: null },
    });
  });

  it("round-trips bar, borne-off checkers, cube, dice and match score", () => {
    const id = "XGID=a-BBBBB-----------bbbbA--B:2:-1:-1:42:3:4:1:7:10";
    const x = parseXgid(id);
    expect(x.board.bar).toEqual([2, 1]);
    expect(x.board.off).toEqual([15 - 2 - 10 - 1, 15 - 1 - 8]);
    expect(x).toMatchObject({
      turn: 1,
      dice: [4, 2],
      cube: { value: 4, owner: 1 },
      score: [3, 4],
      length: 7,
      crawford: true,
    });
    const g = gameFromXgid(x);
    expect(g.phase).toBe("moving");
    expect(g.turn).toBe(1);
    expect(toXgid(g, { score: x.score, length: x.length, crawford: x.crawford })).toBe(id);
  });

  it("exports the position at the start of a half-played turn", () => {
    let g = createGame({ variant: "backgammon", starter: 0 });
    g = applyAction(g, { type: "roll", dice: [3, 1] });
    const before = toXgid(g);
    g = applyAction(g, { type: "move", move: { from: 7, to: 4, die: 3 } });
    expect(toXgid(g)).toBe(before);
    expect(before).toContain(":31:");
  });

  it("imports an offered double", () => {
    const g = gameFromXgid(parseXgid("XGID=-b----E-C---eE---c-e----B-:0:0:-1:D:0:0:0:0:10"));
    expect(g.phase).toBe("cube-offered");
    expect(g.turn).toBe(1);
  });

  it("starts a match from an imported position", () => {
    const x = parseXgid("XGID=-b----E-C---eE---c-e----B-:1:1:1:00:2:4:0:5:10");
    const m = createMatch({ variant: "backgammon", length: 5 }, { game: gameFromXgid(x), score: x.score });
    expect(m.score).toEqual([2, 4]);
    expect(m.crawford).toBe("done");
    expect(m.game.cube).toMatchObject({ value: 2, owner: 0 });
  });

  it("rejects malformed IDs", () => {
    expect(() => parseXgid("XGID=-b----E")).toThrow(XgidError);
    expect(() => parseXgid("XGID=-b----E-C---eE---c-e----Bz:0:0:1:00:0:0:0:0:10")).toThrow(XgidError);
    expect(() => parseXgid("XGID=-P----E-C---eE---c-e----B-:0:0:1:00:0:0:0:0:10")).toThrow(XgidError);
    expect(() => parseXgid("XGID=-b----E-C---eE---c-e----B-:0:0:1:77:0:0:0:0:10")).toThrow(XgidError);
    expect(() => toXgid(createGame({ variant: "plakoto" }))).toThrow(XgidError);
  });
});

describe("resignation offers", () => {
  const rolled = () =>
    applyActions(createGame({ variant: "backgammon", starter: 0 }), [{ type: "roll", dice: [6, 5] }]);

  it("the opponent decides, then the game goes on or ends", () => {
    let g = applyAction(rolled(), { type: "offer-resign", player: 0, level: 1 });
    expect(g.resignOffer).toEqual({ player: 0, level: 1 });
    expect(() => applyAction(g, { type: "move", move: { from: 23, to: 12, die: 6 } })).toThrow();
    const rejected = applyAction(g, { type: "reject-resign" });
    expect(rejected.resignOffer).toBeNull();
    expect(rejected.phase).toBe("moving");
    g = applyAction(g, { type: "accept-resign" });
    expect(g.result).toMatchObject({ winner: 1, level: 1, reason: "resign" });
    expect(g.history.at(-1)).toEqual({ kind: "resign", player: 0, level: 1 });
  });

  it("only the player on turn can offer", () => {
    expect(() => applyAction(rolled(), { type: "offer-resign", player: 1, level: 2 })).toThrow();
  });
});
