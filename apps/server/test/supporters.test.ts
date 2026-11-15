import {
  type AccountResponse,
  type AdminSupportOverview,
  SUPPORTER_LIFETIME,
  type SupportInfo,
} from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { Store } from "../src/db";
import type { RunningServer } from "../src/server";
import { extend, Supporters } from "../src/supporters";
import { api, register, start } from "./helpers";

describe("supporters", () => {
  it("grants add up from the end of a running period; lifetime stays; revoke ends it now", () => {
    const store = new Store(":memory:");
    const sup = new Supporters(store, { url: "https://ko-fi.com/example" });
    const a = store.createPlayer("Ann").id;
    const jan = new Date("2026-01-15T10:00:00.000Z");
    sup.grant(a, 3, "admin", "Ko-fi", jan);
    expect(store.account(a)?.supporter).toMatchObject({
      since: jan.toISOString(),
      until: "2026-04-15T10:00:00.000Z",
    });
    // renewed early: added to the end, "since" kept
    sup.grant(a, 1, "admin", "", new Date("2026-03-01T00:00:00.000Z"));
    expect(store.account(a)?.supporter).toMatchObject({
      since: jan.toISOString(),
      until: "2026-05-15T10:00:00.000Z",
    });
    sup.grant(a, 0, "admin", "patron");
    expect(store.account(a)?.supporter?.until).toBe(SUPPORTER_LIFETIME);
    sup.grant(a, 1, "admin");
    expect(store.account(a)?.supporter?.until).toBe(SUPPORTER_LIFETIME);
    expect(store.isSupporter(a)).toBe(true);
    expect(sup.revoke(a)).toBe(true);
    expect(store.isSupporter(a)).toBe(false);
    expect(store.account(a)?.supporter?.active).toBe(false);
    expect(sup.overview().supporters[0]?.grants).toHaveLength(4);
    expect(extend(new Date("2026-01-31T00:00:00.000Z"), 12)).toBe("2027-01-31T00:00:00.000Z");
  });

  it("codes work once, for anyone, and are kept only as hashes", () => {
    const store = new Store(":memory:");
    const sup = new Supporters(store, { url: "https://ko-fi.com/example" });
    const a = store.createPlayer("Ann").id;
    const b = store.createPlayer("Ben").id;
    const [code] = sup.createCodes(1, 12, "Spende Dezember");
    expect(code).toMatch(/^SUPP-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(sup.overview().openCodes).toHaveLength(1);
    expect(JSON.stringify(store.db.prepare("SELECT * FROM supporter_codes").all())).not.toContain(
      code!.slice(5, 9),
    );
    expect(sup.redeem(a, code!.toLowerCase().replace(/-/g, " "))).toBe(12);
    expect(() => sup.redeem(b, code!)).toThrow(/code not valid/);
    expect(store.isSupporter(a)).toBe(true);
    expect(sup.overview().openCodes).toHaveLength(0);
  });

  it("badge, frame and the opt-in thank-you list; the status ends with the profile", () => {
    const store = new Store(":memory:");
    const sup = new Supporters(store, { url: "https://ko-fi.com/example", monthlyCost: 8 });
    const a = store.createPlayer("Ann").id;
    const b = store.createPlayer("Ben").id;
    store.befriend(a, b);
    store.befriend(b, a);
    expect(store.setFrame(a, "patron")).toBe(false);
    sup.grant(a, 6, "admin");
    expect(store.setFrame(a, "patron")).toBe(true);
    expect(store.publicPlayer(a, "backgammon").supporter).toBe(true);
    expect(store.publicPlayer(b, "backgammon").supporter).toBeUndefined();
    expect(store.friendsOf(b)[0]).toMatchObject({ name: "Ann", supporter: true });
    expect(sup.info()).toEqual({
      enabled: true,
      url: "https://ko-fi.com/example",
      monthlyCost: 8,
      supporters: 1,
      names: [],
    });
    sup.setPublic(a, true);
    expect(sup.info().names).toEqual(["Ann"]);
    store.deletePlayer(a);
    expect(sup.info()).toMatchObject({ supporters: 0, names: [] });
  });
});

describe("supporters without configuration", () => {
  it("are off: nobody counts as supporter and the API says nothing", async () => {
    const store = new Store(":memory:");
    const sup = new Supporters(store);
    const a = store.createPlayer("Ann").id;
    sup.grant(a, 6, "admin");
    expect(store.isSupporter(a)).toBe(false);
    expect(store.account(a)?.supporter).toBeNull();
    expect(store.publicPlayer(a, "backgammon").supporter).toBeUndefined();
    expect(store.setFrame(a, "patron")).toBe(false);
    expect(sup.info()).toEqual({ enabled: false, url: null, monthlyCost: null, supporters: 0, names: [] });
  });

  it("turns the routes off", async () => {
    const server = await start({}, {}, {}, undefined, { adminToken: "a-long-enough-admin-token" });
    try {
      expect(await api<SupportInfo>(server, "/api/support")).toMatchObject({ enabled: false });
      await expect(
        api(server, "/api/admin/supporters", { headers: { "X-Admin-Token": "a-long-enough-admin-token" } }),
      ).rejects.toThrow(/404/);
      const p = await register(server, "Pia");
      await expect(
        api(server, "/api/account/supporter/redeem", {
          method: "POST",
          headers: { Authorization: `Bearer ${p.id}.${p.token}` },
          body: JSON.stringify({ code: "SUPP-AAAA-BBBB-CCCC" }),
        }),
      ).rejects.toThrow(/404/);
    } finally {
      await server.close();
    }
  });
});

describe("supporter API", () => {
  let server: RunningServer;
  afterEach(async () => server?.close());
  const auth = (p: { id: string; token: string }) => ({ Authorization: `Bearer ${p.id}.${p.token}` });
  const admin = { "X-Admin-Token": "a-long-enough-admin-token" };

  it("the operator creates codes, a player redeems one and shows up in the overview", async () => {
    server = await start({}, {}, {}, undefined, {
      adminToken: "a-long-enough-admin-token",
      support: { url: "https://liberapay.com/example" },
    });
    expect(await api<SupportInfo>(server, "/api/support")).toMatchObject({
      url: "https://liberapay.com/example",
      supporters: 0,
    });
    const { codes } = await api<{ codes: string[] }>(server, "/api/admin/supporter-codes", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ count: 2, months: 0 }),
    });
    expect(codes).toHaveLength(2);
    const p = await register(server, "Pia");
    const acc = await api<AccountResponse>(server, "/api/account/supporter/redeem", {
      method: "POST",
      headers: auth(p),
      body: JSON.stringify({ code: codes[0] }),
    });
    expect(acc.supporter).toMatchObject({ active: true, until: SUPPORTER_LIFETIME, public: false });
    const overview = await api<AdminSupportOverview>(server, "/api/admin/supporters", { headers: admin });
    expect(overview.supporters.map((s) => s.name)).toEqual(["Pia"]);
    expect(overview.openCodes).toHaveLength(1);
    await expect(
      api(server, "/api/admin/supporters", {
        method: "POST",
        body: JSON.stringify({ player: "x", months: 1 }),
      }),
    ).rejects.toThrow(/401/);
  });
});
