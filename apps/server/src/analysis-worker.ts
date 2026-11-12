/** Worker thread for fair-play analyses (bundled separately as dist/analysis-worker.js). */
import { parentPort } from "node:worker_threads";
import { analyseMatch } from "./analysis";
import type { StoredGame } from "./db";

parentPort?.on("message", (msg: { id: number; games: StoredGame[] }) => {
  let result = null;
  try {
    result = analyseMatch(msg.games);
  } catch {
    result = null;
  }
  parentPort?.postMessage({ id: msg.id, result });
});
