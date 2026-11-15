import type { FriendInvite, FriendView, InviteInfo, RedeemResult } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/server";
import { api, register, start } from "./helpers";

describe("friend invitations", () => {
  let server: RunningServer;
  afterEach(async () => server?.close());
  const auth = (p: { id: string; token: string }) => ({ Authorization: `Bearer ${p.id}.${p.token}` });

  it("a new player redeems a code and both are friends at once", async () => {
    server = await start();
    const anna = await register(server, "Anna");
    const { code } = await api<FriendInvite>(server, "/api/friends/invite", { headers: auth(anna) });
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    // stable until renewed
    expect((await api<FriendInvite>(server, "/api/friends/invite", { headers: auth(anna) })).code).toBe(code);
    expect(await api<InviteInfo>(server, `/api/invites/${code.toLowerCase()}`)).toEqual({ name: "Anna" });

    const ben = await register(server, "Ben");
    const r = await api<RedeemResult>(server, "/api/friends/redeem", {
      method: "POST",
      body: JSON.stringify({ code: code.toLowerCase() }),
      headers: auth(ben),
    });
    expect(r).toEqual({ friend: { id: anna.id, name: "Anna" }, result: "accepted" });
    const friends = await api<FriendView[]>(server, "/api/friends", { headers: auth(anna) });
    expect(friends.map((f) => [f.name, f.status])).toEqual([["Ben", "accepted"]]);
    const again = await api<RedeemResult>(server, "/api/friends/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
      headers: auth(ben),
    });
    expect(again.result).toBe("already");
  });

  it("renewing ends the old code; own and unknown codes are refused", async () => {
    server = await start();
    const anna = await register(server, "Anna");
    const old = (await api<FriendInvite>(server, "/api/friends/invite", { headers: auth(anna) })).code;
    const fresh = (
      await api<FriendInvite>(server, "/api/friends/invite/renew", { method: "POST", headers: auth(anna) })
    ).code;
    expect(fresh).not.toBe(old);
    await expect(api(server, `/api/invites/${old}`)).rejects.toThrow(/404/);
    await expect(
      api(server, "/api/friends/redeem", {
        method: "POST",
        body: JSON.stringify({ code: fresh }),
        headers: auth(anna),
      }),
    ).rejects.toThrow(/400/);
    await expect(api(server, "/api/invites/not-a-code")).rejects.toThrow(/404/);
  });
});
