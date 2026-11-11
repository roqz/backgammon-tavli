import { applyAction, type From, type GameState, legalMoves, type Move, type To } from "@tavli/engine";

export const fromKey = (f: From): string => String(f);
export const toKey = (t: To): string => String(t);

/** Points (or the bar) the player on turn can move a checker from right now. */
export const movableSources = (s: GameState): Set<string> =>
  new Set(legalMoves(s).map((m) => fromKey(m.from)));

/**
 * All destinations one checker on `from` can reach this turn, each with the shortest chain of
 * single moves to get there (e.g. 24 -> 13 with 6 and 5). For equally short chains the lower
 * die is preferred, keeping the higher die for later.
 */
export const targetsFrom = (s: GameState, from: From): Map<string, Move[]> => {
  const result = new Map<string, Move[]>();
  let frontier: { state: GameState; pos: From; chain: Move[] }[] = [{ state: s, pos: from, chain: [] }];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      const moves = legalMoves(node.state)
        .filter((m) => m.from === node.pos)
        .sort((a, b) => a.die - b.die);
      for (const m of moves) {
        const chain = [...node.chain, m];
        const k = toKey(m.to);
        if (!result.has(k)) result.set(k, chain);
        if (m.to === "off") continue;
        const after = applyAction(node.state, { type: "move", move: m });
        if (after.phase === "moving") next.push({ state: after, pos: m.to, chain });
      }
    }
    frontier = next;
  }
  return result;
};
