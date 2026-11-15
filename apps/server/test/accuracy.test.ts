import { describe, expect, it } from "vitest";
import { Store } from "../src/db";

describe("own accuracy", () => {
  it("sums the last 90 days, the 90 before for the trend, and lists the analysed matches", () => {
    const store = new Store(":memory:");
    const a = store.createPlayer("Ann").id;
    const b = store.createPlayer("Ben").id;
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const at = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();
    const put = (id: string, player: string, d: number, agree: number, loss: number, daysAgo: number) => {
      store.saveAnalysis(id, player, { decisions: d, agree, loss });
      store.db
        .prepare("UPDATE analyses SET created_at = ? WHERE match_id = ? AND player_id = ?")
        .run(at(daysAgo), id, player);
    };
    expect(store.accuracy(a)).toEqual({ summary: null, before: null, matches: [] });

    put("m1", a, 40, 30, 2, 2);
    put("m2", a, 60, 30, 3, 10);
    put("m0", a, 50, 20, 5, 120); // the quarter before
    put("m1", b, 40, 39, 0.1, 2); // the opponent's numbers stay theirs

    const r = store.accuracy(a, now);
    expect(r.summary?.decisions).toBe(100);
    expect(r.summary?.agreement).toBeCloseTo(0.6);
    expect(r.summary?.averageLoss).toBeCloseTo(0.05);
    expect(r.before?.agreement).toBeCloseTo(0.4);
    expect(r.matches.map((m) => m.matchId)).toEqual(["m1", "m2", "m0"]);
    expect(r.matches[0]?.agreement).toBeCloseTo(0.75);
  });
});
