import { type BotLevel, chooseMoves } from "@tavli/ai";
import { applyAction, createGame, playerToAct, rollDice, seededRng } from "@tavli/engine";
import type { ModerationInfo, ModerationSignals, ServerMessage } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { analyseMatch } from "../src/analysis";
import { type FinishedMatch, Store, type StoredGame } from "../src/db";
import type { RunningServer } from "../src/server";
import { api, register, start, TestClient } from "./helpers";

/** A finished bot-vs-bot game (no cube) as the server stores it. */
const botGame = (levels: [BotLevel, BotLevel], seed: number, maxTurns = 30): StoredGame => {
  const rng = seededRng(seed);
  let s = createGame({ variant: "portes", cube: false });
  for (let turns = 0; s.phase !== "finished" && turns < maxTurns * 3; turns++) {
    if (s.phase === "moving") {
      for (const move of chooseMoves(s, levels[s.turn], rng)) s = applyAction(s, { type: "move", move });
      if (s.phase === "moving") s = applyAction(s, { type: "confirm" });
    } else s = applyAction(s, { type: "roll", dice: rollDice(rng) });
  }
  return { variant: "portes", history: s.history, result: s.result };
};

describe("fair-play analysis", () => {
  it("a player who copies the strong bot agrees on every decision, a weak one much less", () => {
    const [hard, easy] = analyseMatch([botGame(["hard", "easy"], 11)]);
    expect(hard.decisions).toBeGreaterThan(10);
    expect(hard.agree).toBe(hard.decisions);
    expect(easy.decisions).toBeGreaterThan(10);
    expect(easy.agree / easy.decisions).toBeLessThan(0.7);
    expect(easy.loss / easy.decisions).toBeGreaterThan(hard.loss / hard.decisions);
  }, 60_000);

  it("signals bot-like play, frequent forfeits and repeated cheap losses to one opponent", () => {
    const store = new Store(":memory:");
    const a = store.createPlayer("Ann").id;
    const b = store.createPlayer("Ben").id;
    const c = store.createPlayer("Cid").id;
    store.saveAnalysis("m-bot", a, { decisions: 200, agree: 194, loss: 0.4 });
    store.saveAnalysis("m-bot", c, { decisions: 200, agree: 140, loss: 6 });
    let n = 0;
    const match = (winner: string, loser: string, reason: FinishedMatch["reason"]) =>
      store.saveMatch({
        id: `m${n++}`,
        variant: "backgammon",
        length: 1,
        players: [winner, loser],
        winner: 0,
        score: [1, 0],
        reason,
        games: [],
        startedAt: new Date().toISOString(),
        rated: true,
      });
    for (let i = 0; i < 3; i++) match(a, b, "forfeit"); // Ben dumps three matches to Ann
    for (let i = 0; i < 5; i++) match(b, c, "won");
    const s: ModerationSignals = store.signals();
    expect(s.botLike.map((x) => x.player.name)).toEqual(["Ann"]);
    expect(s.botLike[0]!.agreement).toBeCloseTo(0.97, 2);
    expect(s.forfeits.map((x) => x.player.name)).toEqual(["Ben"]);
    expect(s.dumping).toEqual([
      {
        loser: { id: b, name: "Ben", banned: false },
        winner: { id: a, name: "Ann", banned: false },
        matches: 3,
      },
    ]);
    expect(store.moderationInfo(a)?.analysis).toMatchObject({ decisions: 200, agreement: 0.97 });
    store.close();
  });

  describe("on the server", () => {
    let server: RunningServer;
    const clients: TestClient[] = [];
    afterEach(async () => {
      await Promise.all(clients.splice(0).map((c) => c.close()));
      await server.close();
    });

    it("analyses finished matches in the background", async () => {
      const ADMIN = "admin-secret-for-tests-0123";
      server = await start({}, {}, {}, undefined, { adminToken: ADMIN, analysis: "inline" });
      const pa = await register(server, "Alice");
      const pb = await register(server, "Bob");
      const a = await TestClient.connect(server, pa);
      const b = await TestClient.connect(server, pb);
      clients.push(a, b);
      a.send({ t: "create", variant: "portes", length: 1 });
      const { code } = await a.next("room-created");
      b.send({ t: "join", code });
      let state = await a.next("state");
      const seats = [a, b];
      // both play the medium bot's moves for a few turns, then Bob resigns
      type State = Extract<ServerMessage, { t: "state" }>;
      for (let i = 0; i < 400 && state.match.game.history.length < 8; i++) {
        const g = state.match.game;
        const actor = playerToAct(g);
        if (actor === null) {
          state = await a.next("state");
          continue;
        }
        const next = a.next("state");
        const c = seats[actor]!;
        if (g.phase === "rolling") c.send({ t: "action", action: { type: "roll" } });
        else if (g.phase === "moving") {
          const [move] = chooseMoves(g, "medium", seededRng(i));
          c.send({ t: "action", action: move ? { type: "move", move } : { type: "confirm" } });
        }
        state = (await next) as State;
      }
      const end = a.next("match-end");
      b.send({ t: "action", action: { type: "resign", level: 1 } });
      await end;
      const admin = { "X-Admin-Token": ADMIN };
      let info: ModerationInfo | null = null;
      for (let i = 0; i < 100 && !info?.analysis; i++) {
        await new Promise((r) => setTimeout(r, 100));
        info = await api<ModerationInfo>(server, `/api/admin/players/${pa.id}`, { headers: admin });
      }
      expect(info?.analysis?.decisions).toBeGreaterThan(0);
      const signals = await api<ModerationSignals>(server, "/api/admin/signals", { headers: admin });
      expect(signals.thresholds.botLikeAgreement).toBe(0.92);
    }, 60_000);
  });
});
