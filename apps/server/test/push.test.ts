import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import type { RegisterResponse } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { encryptPayload, isPushServiceUrl } from "../src/push";
import type { RunningServer } from "../src/server";
import { api, register, start, TestClient } from "./helpers";

/** A browser's side of a subscription: key pair and auth secret, able to decrypt (RFC 8291). */
const userAgent = () => {
  const ecdh = createECDH("prime256v1");
  const pub = ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    keys: { p256dh: pub.toString("base64url"), auth: auth.toString("base64url") },
    decrypt(body: Buffer): string {
      const salt = body.subarray(0, 16);
      const idlen = body.readUInt8(20);
      const asPublic = body.subarray(21, 21 + idlen);
      const data = body.subarray(21 + idlen);
      const shared = ecdh.computeSecret(asPublic);
      const info = Buffer.concat([Buffer.from("WebPush: info\0"), pub, asPublic]);
      const ikm = Buffer.from(hkdfSync("sha256", shared, auth, info, 32));
      const cek = Buffer.from(
        hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
      );
      const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
      const d = createDecipheriv("aes-128-gcm", cek, nonce);
      d.setAuthTag(data.subarray(data.length - 16));
      const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
      expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
      return plain.subarray(0, plain.length - 1).toString("utf8");
    },
  };
};

/** Checks the VAPID JWT signature against the advertised public key and returns its claims. */
const checkVapid = (authorization: string, publicKey: string) => {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(authorization);
  expect(m?.[2]).toBe(publicKey);
  const [h, c, s] = m![1]!.split(".") as [string, string, string];
  const raw = Buffer.from(publicKey, "base64url");
  const key = createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: raw.subarray(1, 33).toString("base64url"),
      y: raw.subarray(33).toString("base64url"),
    },
    format: "jwk",
  });
  const ok = verify(
    "sha256",
    Buffer.from(`${h}.${c}`),
    { key, dsaEncoding: "ieee-p1363" },
    Buffer.from(s, "base64url"),
  );
  expect(ok).toBe(true);
  return JSON.parse(Buffer.from(c, "base64url").toString()) as { aud: string; exp: number; sub: string };
};

describe("web push crypto", () => {
  it("encrypts so that the subscriber can decrypt", () => {
    const ua = userAgent();
    const body = encryptPayload(Buffer.from("hällo 🏆"), ua.keys.p256dh, ua.keys.auth);
    expect(body.readUInt32BE(16)).toBe(4096);
    expect(ua.decrypt(body)).toBe("hällo 🏆");
  });

  it("only accepts endpoints of the known push services", () => {
    expect(isPushServiceUrl("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushServiceUrl("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isPushServiceUrl("https://web.push.apple.com/Q")).toBe(true);
    expect(isPushServiceUrl("https://wns2-db5p.notify.windows.com/w/?token=1")).toBe(true);
    expect(isPushServiceUrl("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushServiceUrl("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isPushServiceUrl("https://127.0.0.1/x")).toBe(false);
    expect(isPushServiceUrl("not a url")).toBe(false);
  });
});

describe("push notifications", () => {
  let server: RunningServer;
  let receiver: ReturnType<typeof createServer> | null = null;
  const clients: TestClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
    await new Promise((r) => (receiver ? receiver.close(r) : r(null)));
    receiver = null;
  });

  const auth = (p: RegisterResponse) => ({ Authorization: `Bearer ${p.id}.${p.token}` });

  it("rejects endpoints outside the push services", async () => {
    server = await start();
    const p = await register(server, "Ann");
    const ua = userAgent();
    await expect(
      api(server, "/api/push/subscribe", {
        method: "POST",
        headers: auth(p),
        body: JSON.stringify({ endpoint: "https://example.com/hook", keys: ua.keys, lang: "de" }),
      }),
    ).rejects.toThrow(/400/);
  });

  it("notifies an offline player when their tournament match is ready", async () => {
    const got: { headers: IncomingHttpHeaders; body: Buffer }[] = [];
    const arrived = new Promise<void>((resolve) => {
      receiver = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          got.push({ headers: req.headers, body: Buffer.concat(chunks) });
          res.statusCode = 201;
          res.end();
          resolve();
        });
      });
    });
    await new Promise<void>((r) => receiver!.listen(0, "127.0.0.1", r));
    const endpoint = `http://127.0.0.1:${(receiver!.address() as AddressInfo).port}/push/1`;

    server = await start({}, {}, {}, undefined, {
      tournaments: { startDelayMs: 0, noShowMs: 60_000 },
      push: { allowEndpoint: () => true, subject: "mailto:test@example.com" },
    });
    const { publicKey } = await api<{ publicKey: string }>(server, "/api/push/key");
    const names = ["A", "B", "C", "D"];
    const players: RegisterResponse[] = [];
    const conns: TestClient[] = [];
    for (const n of names) {
      const p = await register(server, n);
      players.push(p);
      const c = await TestClient.connect(server, p);
      conns.push(c);
      clients.push(c);
    }
    const ua = userAgent();
    await api(server, "/api/push/subscribe", {
      method: "POST",
      headers: auth(players[3]!),
      body: JSON.stringify({ endpoint, keys: ua.keys, lang: "de" }),
    });
    conns[0]!.send({ t: "tournament-create", name: "Cup", variant: "backgammon", length: 1, size: 4 });
    const t = (await conns[0]!.next("tournament")).tournament;
    // B and D join, D closes the app, C fills the tournament
    for (const c of [conns[1]!, conns[3]!]) {
      c.send({ t: "tournament-join", id: t.id });
      await c.next("tournament");
    }
    await conns[3]!.close();
    conns[2]!.send({ t: "tournament-join", id: t.id });
    await arrived;
    expect(got).toHaveLength(1);
    const { headers, body } = got[0]!;
    expect(headers["content-encoding"]).toBe("aes128gcm");
    expect(Number(headers.ttl)).toBeGreaterThan(0);
    const claims = checkVapid(String(headers.authorization), publicKey);
    expect(claims.aud).toBe(new URL(endpoint).origin);
    expect(claims.sub).toBe("mailto:test@example.com");
    const msg = JSON.parse(ua.decrypt(body)) as { title: string; body: string; url: string; tag: string };
    expect(msg.title).toBe("🏆 Cup");
    expect(msg.body).toMatch(/^Runde 1\/2: Dein Match gegen [ABC] ist bereit/);
    expect(msg.url).toBe(`./?tournament=${t.id}`);
  }, 20_000);
});
