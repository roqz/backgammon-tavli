import type { GameResult, PlayedMove, Player, TurnRecord, VariantId } from "./types";
import { getVariant, ownPoint } from "./variants";

/** One game of a match for the export, with the score before it. */
export interface MatGame {
  readonly history: readonly TurnRecord[];
  readonly result: GameResult | null | undefined;
  readonly score: readonly [number, number];
}

export interface MatMatch {
  readonly variant: VariantId;
  /** 0 = money session. */
  readonly length: number;
  readonly players: readonly [string, string];
  readonly games: readonly MatGame[];
}

/** Variants GNU Backgammon and eXtreme Gammon can import (Portes plays like backgammon without cube). */
export const MAT_VARIANTS: readonly VariantId[] = ["backgammon", "portes", "tavla"];

/** A move in .mat notation: own point numbers, bar = 25, off = 0, hits marked with `*`. */
const matMove = (variant: VariantId, player: Player, m: PlayedMove): string => {
  const rules = getVariant(variant);
  const from = m.from === "bar" ? 25 : ownPoint(rules, player, m.from);
  const to = m.to === "off" ? 0 : ownPoint(rules, player, m.to);
  return `${from}/${to}${m.hit ? "*" : ""}`;
};

const COLUMN = 28;

/**
 * Exports games in the Jellyfish/GNU Backgammon ".mat" text format, which GNU Backgammon and
 * eXtreme Gammon can import for analysis. White (player 0) is the left column.
 */
export const toMat = (match: MatMatch): string => {
  const out: string[] = [` ${match.length} point match`, ""];
  match.games.forEach((game, gi) => {
    const [a, b] = match.players;
    out.push(` Game ${gi + 1}`);
    out.push(` ${`${a} : ${game.score[0]}`.padEnd(COLUMN + 5)}${b} : ${game.score[1]}`);
    const lines: [string, string][] = [];
    const place = (p: Player, text: string) => {
      const line = lines[lines.length - 1];
      if (p === 0) {
        if (!line || line[0] || line[1]) lines.push([text, ""]);
        else line[0] = text;
      } else if (!line || line[1]) lines.push(["", text]);
      else line[1] = text;
    };
    for (const rec of game.history) {
      switch (rec.kind) {
        case "move": {
          const dice = `${rec.dice[0]}${rec.dice[1]}:`;
          const moves = rec.moves.map((m) => matMove(match.variant, rec.player, m)).join(" ");
          place(rec.player, moves ? `${dice} ${moves}` : dice);
          break;
        }
        case "double":
          place(rec.player, ` Doubles => ${rec.to}`);
          break;
        case "take":
          place(rec.player, " Takes");
          break;
        case "drop":
          place(rec.player, " Drops");
          break;
        default:
          break;
      }
    }
    const r = game.result;
    if (r) {
      const text = `Wins ${r.points} point${r.points === 1 ? "" : "s"}`;
      lines.push(r.winner === 0 ? [`      ${text}`, ""] : ["", `      ${text}`]);
    }
    lines.forEach(([left, right], i) => {
      out.push(`${String(i + 1).padStart(3)}) ${left.padEnd(COLUMN)} ${right}`.trimEnd());
    });
    out.push("");
  });
  return `${out.join("\n")}\n`;
};
