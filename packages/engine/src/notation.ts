import type { GameState, PlayedMove, Player, TurnRecord, VariantId } from "./types";
import { getVariant, ownPoint } from "./variants";

/** Standard notation of a single move from the mover's perspective, e.g. `13/7*`, `bar/22`, `6/off`. */
export const formatMove = (variant: VariantId, player: Player, m: PlayedMove): string => {
  const rules = getVariant(variant);
  const from = m.from === "bar" ? "bar" : String(ownPoint(rules, player, m.from));
  const to = m.to === "off" ? "off" : String(ownPoint(rules, player, m.to));
  return `${from}/${to}${m.hit ? "*" : ""}`;
};

/** One turn, e.g. `64: 24/18 13/9`, `66: 8/2(2) 6/off(2)`, `21: no play`, `Doubles => 2`. */
export const formatTurn = (variant: VariantId, t: TurnRecord): string => {
  switch (t.kind) {
    case "double":
      return `Doubles => ${t.to}`;
    case "take":
      return "Takes";
    case "drop":
      return "Drops";
    case "resign":
      return `Resigns (${["", "single", "gammon", "backgammon"][t.level]})`;
    case "move": {
      const dice = `${t.dice[0]}${t.dice[1]}`;
      if (t.moves.length === 0) return `${dice}: no play`;
      const counts = new Map<string, number>();
      for (const m of t.moves) {
        const s = formatMove(variant, t.player, m);
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const parts = [...counts].map(([s, n]) => (n > 1 ? `${s}(${n})` : s));
      return `${dice}: ${parts.join(" ")}`;
    }
  }
};

/** Whole game history, one line per record, prefixed with the player's colour. */
export const formatHistory = (s: GameState): string[] =>
  s.history.map((t) => `${t.player === 0 ? "White" : "Black"}: ${formatTurn(s.variant, t)}`);
