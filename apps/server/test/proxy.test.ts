import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/server";
import { api, start } from "./helpers";

describe("client address behind two reverse proxies", () => {
  let server: RunningServer;
  afterEach(async () => {
    await server.close();
  });

  it("takes the second entry from the end of X-Forwarded-For (rate limit per client)", async () => {
    server = await start({}, {}, {}, undefined, { trustProxy: 2 });
    // shared Caddy appended the client, the app's Caddy appended the shared Caddy
    const register = (forwarded: string, n: number) =>
      api(server, "/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": forwarded },
        body: JSON.stringify({ name: `P${n}` }),
      });
    for (let i = 0; i < 10; i++) await register("203.0.113.7, 172.18.0.5", i);
    await expect(register("203.0.113.7, 172.18.0.5", 10)).rejects.toThrow(/429/);
    // a forged entry in front does not help the same client
    await expect(register("198.51.100.1, 203.0.113.7, 172.18.0.5", 11)).rejects.toThrow(/429/);
    // another client is not affected
    await expect(register("198.51.100.9, 172.18.0.5", 12)).resolves.toBeTruthy();
  });
});
