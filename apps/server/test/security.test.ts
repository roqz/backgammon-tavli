import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NameSchema, type RegisterResponse } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { Store } from "../src/db";
import { ipKey, type RunningServer, rateLimiter } from "../src/server";
import { api, register, start, TestClient } from "./helpers";

const bearer = (p: { id: string; token: string }) => ({ Authorization: `Bearer ${p.id}.${p.token}` });

describe("helpers", () => {
  it("counts IPv6 clients per /64 and keeps IPv4 addresses", () => {
    expect(ipKey("203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("2001:db8:1:2:aaaa::1")).toBe(ipKey("2001:0db8:0001:0002:ffff:1:2:3"));
    expect(ipKey("2001:db8:1:2::1")).not.toBe(ipKey("2001:db8:1:3::1"));
    expect(ipKey("::1")).toBe("0:0:0:0::/64");
  });

  it("rate limiter counts per key and can be peeked", () => {
    const allow = rateLimiter(2, 60_000);
    expect([allow("a"), allow("a"), allow("a"), allow("b")]).toEqual([true, true, false, true]);
    expect(allow.peek("a")).toBe(3);
    expect(allow.peek("c")).toBe(0);
  });

  it("names lose invisible characters; official-looking names are refused", () => {
    expect(NameSchema.parse({ name: " Ali‮ce​  Bob " }).name).toBe("Alice Bob");
    expect(NameSchema.safeParse({ name: "Admin" }).success).toBe(false);
    expect(NameSchema.safeParse({ name: "​​" }).success).toBe(false);
  });
});

describe("store: privacy and retention", () => {
  it("export contains the player's data; deletion removes personal data but keeps opponents' matches", async () => {
    const store = new Store(":memory:");
    const a = store.createPlayer("Ann");
    const b = store.createPlayer("Ben");
    await store.claimAccount(a.id, "ann_1", "secret-password", "ann@example.org");
    store.saveMatch({
      id: "m1",
      variant: "backgammon",
      length: 1,
      players: [a.id, b.id],
      winner: 0,
      score: [1, 0],
      reason: "won",
      games: [],
      startedAt: new Date().toISOString(),
      rated: true,
    });
    const data = store.exportData(a.id) as {
      player: { email: string };
      matches: unknown[];
      ratings: unknown[];
    };
    expect(data.player.email).toBe("ann@example.org");
    expect(data.matches).toHaveLength(1);
    expect(data.ratings).toHaveLength(1);

    expect(store.deletePlayer(a.id)).toBe(true);
    expect(store.authenticate(a.id, a.token)).toBeNull();
    expect(store.account(a.id)).toMatchObject({ username: null, email: null, name: "—" });
    expect(store.leaderboard("backgammon").map((e) => e.playerId)).toEqual([b.id]);
    expect(store.matchSummary("m1")?.players.map((p) => p.name)).toEqual(["—", "Ben"]);
    await expect(store.login("ann_1", "secret-password")).rejects.toThrow(/wrong/);
    expect(store.deletePlayer(a.id)).toBe(false);
    store.close();
  });

  it("removes inactive guests without matches and old fair-play data", () => {
    const store = new Store(":memory:");
    const idle = store.createPlayer("Idle");
    const active = store.createPlayer("Active");
    store.saveAnalysis("old", active.id, { decisions: 10, agree: 5, loss: 1 });
    const later = Date.now() + 200 * 24 * 60 * 60_000;
    store.db
      .prepare("UPDATE players SET last_seen = ? WHERE id = ?")
      .run(new Date(later).toISOString(), active.id);
    const r = store.prune(later);
    expect(r).toMatchObject({ guests: 1, fairPlay: 1 });
    expect(store.getPlayer(idle.id)).toBeNull();
    expect(store.getPlayer(active.id)).not.toBeNull();
    store.close();
  });

  it("writes a consistent backup copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "tavli-"));
    const store = new Store(join(dir, "live.db"));
    store.createPlayer("Ann");
    expect(store.healthy()).toBe(true);
    store.backup(join(dir, "copy.db"));
    store.close();
    const copy = new Store(join(dir, "copy.db"));
    expect((copy.db.prepare("SELECT COUNT(*) AS n FROM players").get() as { n: number }).n).toBe(1);
    copy.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("server hardening", () => {
  let server: RunningServer;
  const clients: TestClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
  });

  const claim = async (p: RegisterResponse, username: string) =>
    api(server, "/api/account/claim", {
      method: "POST",
      headers: bearer(p),
      body: JSON.stringify({ username, password: "correct horse" }),
    });
  const login = (username: string, password = "correct horse") =>
    api<RegisterResponse>(server, "/api/account/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

  it("a password change ends every other session; sessions expire", async () => {
    server = await start();
    const guest = await register(server, "Dana");
    await claim(guest, "dana_2");
    const second = await login("dana_2");
    const third = await login("dana_2");
    // the old guest token still works on the first device (now a session)
    await api(server, "/api/account", { headers: bearer(guest) });
    await api(server, "/api/account/password", {
      method: "POST",
      headers: bearer(guest),
      body: JSON.stringify({ oldPassword: "correct horse", newPassword: "battery staple" }),
    });
    await api(server, "/api/account", { headers: bearer(guest) });
    await expect(api(server, "/api/account", { headers: bearer(second) })).rejects.toThrow(/401/);
    await expect(api(server, "/api/account", { headers: bearer(third) })).rejects.toThrow(/401/);
    // idle sessions expire
    const fresh = await login("dana_2", "battery staple");
    server.store.db.prepare("UPDATE sessions SET last_used = '2000-01-01T00:00:00.000Z'").run();
    await expect(api(server, "/api/account", { headers: bearer(fresh) })).rejects.toThrow(/401/);
  });

  it("logs out other devices on request", async () => {
    server = await start();
    const guest = await register(server, "Eve");
    await claim(guest, "eve_1");
    const other = await login("eve_1");
    const r = await api<{ ended: number }>(server, "/api/account/logout-all", {
      method: "POST",
      headers: bearer(guest),
    });
    expect(r.ended).toBe(1);
    await expect(api(server, "/api/account", { headers: bearer(other) })).rejects.toThrow(/401/);
  });

  it("locks an account for a while after many wrong passwords", async () => {
    server = await start();
    const guest = await register(server, "Finn");
    await claim(guest, "finn_1");
    for (let i = 0; i < 10; i++) await expect(login("finn_1", "wrong-password")).rejects.toThrow(/401/);
    await expect(login("finn_1")).rejects.toThrow(/429/);
  }, 30_000);

  it("deletes a profile: password required for accounts, running match forfeited", async () => {
    server = await start();
    const a = await register(server, "Gil");
    const b = await register(server, "Hal");
    await claim(a, "gil_1");
    const ca = await TestClient.connect(server, a);
    const cb = await TestClient.connect(server, b);
    clients.push(ca, cb);
    ca.send({ t: "create", variant: "backgammon", length: 1 });
    const { code } = await ca.next("room-created");
    cb.send({ t: "join", code });
    await cb.next("match-start");
    await expect(
      api(server, "/api/account/delete", {
        method: "POST",
        headers: bearer(a),
        body: JSON.stringify({ password: "nope" }),
      }),
    ).rejects.toThrow(/401/);
    const ended = cb.next("match-end");
    await api(server, "/api/account/delete", {
      method: "POST",
      headers: bearer(a),
      body: JSON.stringify({ password: "correct horse" }),
    });
    expect((await ended).winner).toBe(1);
    await expect(api(server, "/api/account", { headers: bearer(a) })).rejects.toThrow(/401/);
    // guests delete without password
    await api(server, "/api/account/delete", { method: "POST", headers: bearer(b), body: "{}" });
    await expect(api(server, "/api/account", { headers: bearer(b) })).rejects.toThrow(/401/);
  });

  it("exports the player's data", async () => {
    server = await start();
    const a = await register(server, "Ida");
    const data = await api<{ player: { name: string } }>(server, "/api/account/export", {
      headers: bearer(a),
    });
    expect(data.player.name).toBe("Ida");
  });

  it("refuses a second hello and too many connections from one address", async () => {
    server = await start({}, {}, {}, undefined, { maxConnectionsPerIp: 2 });
    const a = await register(server, "Jo");
    const c1 = await TestClient.connect(server, a);
    clients.push(c1);
    c1.send({ t: "hello", playerId: a.id, token: a.token });
    expect((await c1.next("error")).message).toBe("already identified");
    const b = await register(server, "Kim");
    const c2 = await TestClient.connect(server, b);
    clients.push(c2);
    const c = await register(server, "Lu");
    await expect(TestClient.connect(server, c)).rejects.toThrow();
  });

  it("guests need some matches before creating a tournament", async () => {
    server = await start({}, {}, {}, undefined, { tournaments: { guestMinMatches: 3 } });
    const p = await register(server, "Max");
    const c = await TestClient.connect(server, p);
    clients.push(c);
    c.send({ t: "tournament-create", name: "Cup", variant: "backgammon", length: 1, size: 4 });
    expect((await c.next("error")).message).toMatch(/matches or create an account/);
  });

  it("the health check includes the database", async () => {
    server = await start();
    expect(await api<{ ok: boolean }>(server, "/api/health")).toMatchObject({ ok: true });
  });
});

describe("rating history", () => {
  it("rebuilds the rating after each rated match, oldest first", () => {
    const store = new Store(":memory:");
    const a = store.createPlayer("Ann").id;
    const b = store.createPlayer("Ben").id;
    for (let i = 0; i < 3; i++)
      store.saveMatch({
        id: `m${i}`,
        variant: "backgammon",
        length: 3,
        players: [a, b],
        winner: 0,
        score: [3, 0],
        reason: "won",
        games: [],
        startedAt: new Date().toISOString(),
        rated: true,
      });
    const h = store.profile(a)!.history!.backgammon!;
    expect(h).toHaveLength(4);
    expect(h[0]!.rating).toBe(1500);
    expect(h[3]!.rating).toBe(store.profile(a)!.ratings[0]!.rating);
    expect(h[1]!.rating).toBeGreaterThan(h[0]!.rating);
    store.close();
  });
});

describe("progress and frames", () => {
  it("merges progress from several devices; frames need their achievement", () => {
    const store = new Store(":memory:");
    const a = store.createPlayer("Ann").id;
    store.mergeProgress(a, {
      unlocked: { "first-win": "2026-11-10T00:00:00Z" },
      lessons: [0, 1],
      puzzles: { "2026-11-10": { solved: false, loss: 0.1 } },
    });
    const merged = store.mergeProgress(a, {
      unlocked: { "first-win": "2026-11-12T00:00:00Z", tutorial: "2026-11-12T00:00:00Z" },
      lessons: [1, 2],
      puzzles: { "2026-11-10": { solved: true, loss: 0 }, "2026-11-11": { solved: true, loss: 0 } },
    });
    expect(merged.unlocked["first-win"]).toBe("2026-11-10T00:00:00Z");
    expect(merged.lessons).toEqual([0, 1, 2]);
    expect(merged.puzzles["2026-11-10"]!.solved).toBe(false); // the first answer counts
    expect(store.setFrame(a, "gold")).toBe(false); // no tournament win
    expect(store.setFrame(a, "scholar")).toBe(true);
    expect(store.publicPlayer(a, "backgammon").frame).toBe("scholar");
    store.close();
  });
});
