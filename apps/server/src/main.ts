import { startServer } from "./server";

const env = process.env;
const server = await startServer({
  port: Number(env.PORT ?? 2567),
  host: env.HOST,
  dbPath: env.DB_PATH ?? "./tavli.db",
  corsOrigin: env.CORS_ORIGIN ?? "*",
  trustProxy: env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true",
  // Moderation API (reports, bans); disabled unless set.
  adminToken: env.ADMIN_TOKEN,
  // Fair-play analysis in a worker thread (falls back to inline when the worker file is missing).
  analysis: env.ANALYSIS === "off" ? "off" : "worker",
  // Web Push for tournament matches. Keys are generated and stored in the database unless pinned;
  // the subject should be a contact (mailto: or https:) for the push services.
  push:
    env.PUSH === "off"
      ? false
      : {
          ...(env.VAPID_SUBJECT ? { subject: env.VAPID_SUBJECT } : {}),
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        },
  // Allow pairing players from the same network (local testing, LAN events).
  fairPlay: { blockSameNetwork: env.ALLOW_SAME_NETWORK !== "1" },
  log: (msg) => console.log(`[${new Date().toISOString()}] ${msg}`),
});

const shutdown = async () => {
  console.log("shutting down…");
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
