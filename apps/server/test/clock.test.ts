import { legalMoves, type MatchState, playerToAct } from "@tavli/engine";
import type { ClockView, ServerMessage } from "@tavli/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Conn, MatchRoom } from "../src/room";
import { DEFAULT_TIMINGS } from "../src/server";

type State = Extract<ServerMessage, { t: "state" }>;

/** A room with two fake connections that record what they receive. */
const setup = (timeControl: "standard" | "blitz", length = 1) => {
  const inbox: [ServerMessage[], ServerMessage[]] = [[], []];
  const conn = (i: 0 | 1): Conn => ({ send: (m) => inbox[i].push(m), close: () => {} });
  const ended: { reason: string; winner: number }[] = [];
  const room = new MatchRoom(
    "backgammon",
    { variant: "backgammon", length, crawford: true, jacoby: false },
    [
      { id: "a", name: "Ann", rating: 1500 },
      { id: "b", name: "Ben", rating: 1500 },
    ],
    {
      timings: DEFAULT_TIMINGS,
      timeControl,
      onEnd: (_r, result) => {
        ended.push({ reason: result.reason, winner: result.winner });
        return [0, 0];
      },
    },
  );
  room.attach(0, conn(0));
  room.attach(1, conn(1));
  room.start();
  vi.advanceTimersByTime(DEFAULT_TIMINGS.seedWaitMs);
  const last = (): State => inbox[0].filter((m): m is State => m.t === "state").at(-1)!;
  return { room, inbox, ended, last };
};

/** Plays the whole turn of the player to act (roll if needed, first legal moves, confirm). */
const playTurn = (room: MatchRoom, state: () => State) => {
  const seat = playerToAct(state().match.game)!;
  if (state().match.game.phase === "rolling") room.handle(seat, { type: "roll" });
  for (let i = 0; i < 4; i++) {
    const g = (state().match as MatchState).game;
    const [m] = legalMoves(g);
    if (!m || g.phase !== "moving") break;
    room.handle(seat, { type: "move", move: m });
  }
  room.handle(seat, { type: "confirm" });
  return seat;
};

describe("chess clock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("blitz: the delay is free, only the time beyond it comes off the reserve", () => {
    const { room, inbox, last } = setup("blitz", 3);
    expect(inbox[0].find((m) => m.t === "match-start")).toMatchObject({ timeControl: "blitz" });
    const clock = last().clock as ClockView;
    expect(clock).toMatchObject({ control: "blitz", delayMs: 8_000, reserve: [180_000, 180_000] });
    const seat = clock.running!;
    // 5 s (inside the delay): nothing is charged
    vi.advanceTimersByTime(5_000);
    playTurn(room, last);
    expect(last().clock!.reserve[seat]).toBe(180_000);
    // the opponent thinks 20 s: 12 s come off
    const other = last().clock!.running!;
    expect(other).not.toBe(seat);
    vi.advanceTimersByTime(20_000);
    playTurn(room, last);
    const r = last().clock!.reserve[other];
    // a forced turn costs nothing, so the charge is 12 s or 0
    expect([168_000, 180_000]).toContain(r);
    room.dispose();
  });

  it("the flag falls when delay and reserve are used up: the match is lost on time", () => {
    const { last, ended } = setup("blitz", 1);
    const seat = last().clock!.running!;
    expect(last().deadline! - Date.now()).toBe(8_000 + 60_000);
    vi.advanceTimersByTime(68_001);
    expect(ended).toEqual([{ reason: "time", winner: seat === 0 ? 1 : 0 }]);
  });
});
