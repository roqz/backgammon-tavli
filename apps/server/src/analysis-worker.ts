/** Worker thread for fair-play analyses (bundled separately as dist/analysis-worker.js). */
import { parentPort } from "node:worker_threads";
import { loadAllNets } from "@tavli/ai";
import { analyseMatch } from "./analysis";
import type { StoredGame } from "./db";

// the networks are bundled into this file; analyses wait until they are unpacked
const ready = loadAllNets().catch(() => {});

parentPort?.on("message", async (msg: { id: number; games: StoredGame[] }) => {
  await ready;
  let result = null;
  try {
    result = analyseMatch(msg.games);
  } catch {
    result = null;
  }
  parentPort?.postMessage({ id: msg.id, result });
});
