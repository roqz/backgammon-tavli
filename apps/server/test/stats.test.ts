import type { OnlineStats, PlayerStats } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/server";
import { api, register, start, TestClient } from "./helpers";

describe("player numbers", () => {
  let server: RunningServer | null = null;
  const clients: TestClient[] = [];
  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await server?.close();
    server = null;
  });

  it("counts connected players publicly and players per period for moderators", async () => {
    const ADMIN = "admin-secret-for-tests-0123";
    server = await start({}, {}, {}, undefined, { adminToken: ADMIN });
    const pa = await register(server, "Alice");
    await register(server, "Bob");
    const before = await api<OnlineStats>(server, "/api/online");
    expect(before).toEqual({ online: 0, playing: 0 });

    const a = await TestClient.connect(server, pa);
    clients.push(a);
    await expect.poll(() => api<OnlineStats>(server!, "/api/online").then((s) => s.online)).toBe(1);

    await expect(api(server, "/api/admin/stats")).rejects.toThrow();
    const stats = await api<PlayerStats>(server, "/api/admin/stats", { headers: { "X-Admin-Token": ADMIN } });
    // the server may hold players of its own (the house bot); everything here was created today
    const n = stats.total;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(stats).toMatchObject({
      online: 1,
      playing: 0,
      registered: 0,
      guests: n,
      active: { d1: n, d7: n, d30: n },
      created: { d1: n, d7: n, d30: n },
    });
  });
});
