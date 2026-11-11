import { startServer } from "./server";

const env = process.env;
const server = await startServer({
  port: Number(env.PORT ?? 2567),
  host: env.HOST,
  dbPath: env.DB_PATH ?? "./tavli.db",
  corsOrigin: env.CORS_ORIGIN ?? "*",
  log: (msg) => console.log(`[${new Date().toISOString()}] ${msg}`),
});

const shutdown = async () => {
  console.log("shutting down…");
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
