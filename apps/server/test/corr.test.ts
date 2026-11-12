import { legalMoves, type MatchState } from "@tavli/engine";
import type { CorrView, RegisterResponse } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/server";
import { api, register, start } from "./helpers";

const bearer = (p: RegisterResponse) => ({ Authorization: `Bearer ${p.id}.${p.token}` });

describe("correspondence games", () => {
  let server: RunningServer;
  afterEach(async () => {
    await server.close();
  });

  const friends = async (a: RegisterResponse, b: RegisterResponse) => {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const)
      await api(server, "/api/friends", {
        method: "POST",
        headers: bearer(x),
        body: JSON.stringify({ playerId: y.id }),
      });
  };
  const post = <T>(p: RegisterResponse, path: string, body: unknown = {}) =>
    api<T>(server, path, { method: "POST", headers: bearer(p), body: JSON.stringify(body) });

  it("invite, accept, play turns via REST, archive at the end", async () => {
    server = await start();
    const a = await register(server, "Ann");
    const b = await register(server, "Ben");
    await friends(a, b);
    const inv = await post<CorrView>(a, "/api/corr", {
      playerId: b.id,
      variant: "portes",
      length: 1,
      days: 3,
    });
    expect(inv.status).toBe("invited");
    expect((await api<CorrView[]>(server, "/api/corr", { headers: bearer(b) }))[0]!.id).toBe(inv.id);
    let g = await post<CorrView>(b, `/api/corr/${inv.id}/answer`, { accept: true });
    expect(g.status).toBe("active");
    expect(["rolling", "moving"]).toContain(g.match!.game.phase); // no opening phase left
    expect(g.deadline! - Date.now()).toBeGreaterThan(2.9 * 86_400_000);

    // play a few complete turns: each move is one request, then confirm
    const players = { 0: a, 1: b } as const;
    for (let turn = 0; turn < 4; turn++) {
      const m = g.match as MatchState;
      const actor = players[g.toAct as 0 | 1];
      if (m.game.phase === "rolling")
        g = await post<CorrView>(actor, `/api/corr/${g.id}/action`, { action: { type: "roll" } });
      while ((g.match as MatchState).game.phase === "moving") {
        const moves = legalMoves((g.match as MatchState).game);
        g = await post<CorrView>(actor, `/api/corr/${g.id}/action`, {
          action: moves.length ? { type: "move", move: moves[0] } : { type: "confirm" },
        });
      }
    }
    // not your turn
    const waiting = players[(g.toAct === 0 ? 1 : 0) as 0 | 1];
    await expect(post(waiting, `/api/corr/${g.id}/action`, { action: { type: "roll" } })).rejects.toThrow(
      /409/,
    );
    // resign ends the match and archives it
    const done = await post<CorrView>(a, `/api/corr/${g.id}/action`, {
      action: { type: "resign", level: 1 },
    });
    expect(done.status).toBe("finished");
    expect(done.winner).toBe(1);
    expect(server.store.matchSummary(g.id)?.players.map((p) => p.name)).toEqual(["Ann", "Ben"]);
  });

  it("a missed deadline loses; only friends can be invited", async () => {
    server = await start();
    const a = await register(server, "Ann");
    const b = await register(server, "Ben");
    const c = await register(server, "Cid");
    await expect(
      post(a, "/api/corr", { playerId: c.id, variant: "backgammon", length: 1, days: 1 }),
    ).rejects.toThrow(/403/);
    await friends(a, b);
    const inv = await post<CorrView>(a, "/api/corr", {
      playerId: b.id,
      variant: "backgammon",
      length: 1,
      days: 1,
    });
    const g = await post<CorrView>(b, `/api/corr/${inv.id}/answer`, { accept: true });
    server.corr.tick(Date.now() + 2 * 86_400_000);
    const after = await api<CorrView>(server, `/api/corr/${g.id}`, { headers: bearer(a) });
    expect(after.status).toBe("finished");
    expect(after.reason).toBe("abandoned");
    expect(after.winner).toBe(g.toAct === 0 ? 1 : 0);
  });
});
