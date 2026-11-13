import type { NetModel } from "../nn";

/**
 * Trained networks, loaded on demand (separate chunks in the browser). Models without a
 * trained network play with the heuristic evaluation.
 */
export const NET_LOADERS: Partial<Record<NetModel, () => Promise<string>>> = {
  backgammon: () => import("./backgammon").then((m) => m.default),
};
