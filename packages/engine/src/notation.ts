import type { GameState, PlayedMove, Player, TurnRecord, VariantId } from "./types";
import { getVariant, ownPoint } from "./variants";

/** Standard notation of a single move from the mover's perspective, e.g. `13/7*`, `bar/22`, `6/off`. */
export const formatMove = (variant: VariantId, player: Player, m: PlayedMove): string => {
  const rules = getVariant(variant);
  const from = m.from === "bar" ? "bar" : String(ownPoint(rules, player, m.from));
  const to = m.to === "off" ? "off" : String(ownPoint(rules, player, m.to));
  return `${from}/${to}${m.hit ? "*" : ""}`;
};

/**
 * Joins consecutive moves of the same checker: `24/23 23/20` -> `24/20`. Intermediate points
 * are kept only where a blot was hit, marked with an asterisk (e.g. 24, 23 hit, 20).
 */
const chainMoves = (variant: VariantId, player: Player, moves: readonly PlayedMove[]): string[] => {
  const rules = getVariant(variant);
  const label = (p: number | "bar" | "off") =>
    typeof p === "number" ? String(ownPoint(rules, player, p)) : p;
  const chains: { points: (number | "bar" | "off")[]; hits: boolean[] }[] = [];
  for (const m of moves) {
    const chain = chains.find((c) => c.points[c.points.length - 1] === m.from);
    if (chain) {
      chain.points.push(m.to);
      chain.hits.push(m.hit);
    } else {
      chains.push({ points: [m.from, m.to], hits: [false, m.hit] });
    }
  }
  return chains.map((c) =>
    c.points
      .map((p, i) => ({
        text: `${label(p)}${c.hits[i] ? "*" : ""}`,
        keep: i === 0 || i === c.points.length - 1 || c.hits[i],
      }))
      .filter((x) => x.keep)
      .map((x) => x.text)
      .join("/"),
  );
};

/** One turn, e.g. `64: 24/18 13/9`, `66: 8/2(2) 6/off(2)`, `21: no play`, `Doubles => 2`. */
export const formatTurn = (variant: VariantId, t: TurnRecord): string => {
  switch (t.kind) {
    case "double":
      return `Doubles => ${t.to}`;
    case "take":
      return "Takes";
    case "closed-out":
      return "closed out";
    case "drop":
      return "Drops";
    case "resign":
      return `Resigns (${["", "single", "gammon", "backgammon"][t.level]})`;
    case "move": {
      const dice = `${t.dice[0]}${t.dice[1]}`;
      if (t.moves.length === 0) return `${dice}: no play`;
      const counts = new Map<string, number>();
      for (const s of chainMoves(variant, t.player, t.moves)) counts.set(s, (counts.get(s) ?? 0) + 1);
      const parts = [...counts].map(([s, n]) => (n > 1 ? `${s}(${n})` : s));
      return `${dice}: ${parts.join(" ")}`;
    }
  }
};

/** Whole game history, one line per record, prefixed with the player's colour. */
export const formatHistory = (s: GameState): string[] =>
  s.history.map((t) => `${t.player === 0 ? "White" : "Black"}: ${formatTurn(s.variant, t)}`);
