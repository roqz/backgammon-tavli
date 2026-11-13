import { startServer } from "./server";

const env = process.env;
const server = await startServer({
  port: Number(env.PORT ?? 2567),
  host: env.HOST,
  dbPath: env.DB_PATH ?? "./tavli.db",
  corsOrigin: env.CORS_ORIGIN ?? "*",
  // Daily database copies (VACUUM INTO); copy them off the server, too.
  backupDir: env.BACKUP_DIR || undefined,
  backupKeep: env.BACKUP_KEEP ? Number(env.BACKUP_KEEP) : undefined,
  // Spectators see matches this many seconds later (tournaments separately; default live).
  spectatorDelay: {
    matchMs: Number(env.SPECTATOR_DELAY_SECONDS ?? 0) * 1000,
    ...(env.TOURNAMENT_SPECTATOR_DELAY_SECONDS
      ? { tournamentMs: Number(env.TOURNAMENT_SPECTATOR_DELAY_SECONDS) * 1000 }
      : {}),
  },
  // Guests need this many finished matches before creating a tournament (default 3).
  ...(env.TOURNAMENT_GUEST_MIN_MATCHES
    ? { tournaments: { guestMinMatches: Number(env.TOURNAMENT_GUEST_MIN_MATCHES) } }
    : {}),
  // Behind reverse proxies: how many (1 = one proxy in front, 2 = e.g. a shared Caddy in front of
  // the app's own Caddy); the client address is taken from X-Forwarded-For accordingly.
  trustProxy: env.TRUST_PROXY === "true" ? 1 : Number(env.TRUST_PROXY ?? 0) || 0,
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

// A bug in one match must not take every other match down: log and keep serving.
process.on("uncaughtException", (e) =>
  console.error(`[${new Date().toISOString()}] uncaught: ${e.stack ?? String(e)}`),
);
process.on("unhandledRejection", (e) =>
  console.error(`[${new Date().toISOString()}] unhandled rejection: ${String(e)}`),
);

const shutdown = async () => {
  console.log("shutting down…");
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
