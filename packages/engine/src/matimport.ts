import { applyAction, createGame, turnOptions } from "./game";
import type { MatGame } from "./mat";
import type { Board, GameState, Player, ResultLevel } from "./types";
import { absFromOwnPoint, getVariant } from "./variants";
import { XgidError } from "./xgid";

export interface ImportedMatch {
  readonly length: number;
  readonly players: readonly [string, string];
  readonly games: readonly (MatGame & { readonly result: NonNullable<MatGame["result"]> | null })[];
}

const RULES = getVariant("backgammon");

type Action =
  | { kind: "move"; dice: [number, number]; text: string }
  | { kind: "double" }
  | { kind: "take" }
  | { kind: "drop" }
  | { kind: "wins"; points: number };

const TOKEN =
  /(\d)(\d):((?:\s+(?:bar|\d{1,2})(?:\/(?:off|bar|\d{1,2})\*?)+(?:\(\d\))?)*)|Doubles\s*=>\s*\d+|Takes|Drops|Wins\s+(\d+)\s+points?|Beavers?|Raccoons?/gi;

const toAction = (m: RegExpExecArray): Action | null => {
  const s = m[0];
  if (m[1]) return { kind: "move", dice: [Number(m[1]), Number(m[2])], text: m[3] ?? "" };
  if (/^Doubles/i.test(s)) return { kind: "double" };
  if (/^Takes/i.test(s)) return { kind: "take" };
  if (/^Drops/i.test(s)) return { kind: "drop" };
  if (/^Wins/i.test(s)) return { kind: "wins", points: Number(m[4]) };
  return null; // beavers etc. are not supported
};

/** The board after the moves of a notation like "24/18* 13/11(2) bar/22 6/off". */
const applyNotation = (board: Board, player: Player, text: string): Board => {
  const points = [board.points[0].slice(), board.points[1].slice()] as [number[], number[]];
  const bar: [number, number] = [board.bar[0], board.bar[1]];
  const off: [number, number] = [board.off[0], board.off[1]];
  const opp = (player === 0 ? 1 : 0) as Player;
  for (const part of text.trim().split(/\s+/).filter(Boolean)) {
    const times = Number(/\((\d)\)$/.exec(part)?.[1] ?? 1);
    const stops = part.replace(/\(\d\)$/, "").split("/");
    for (let k = 0; k < times; k++) {
      for (let i = 0; i + 1 < stops.length; i++) {
        const from = stops[i]!.replace("*", "");
        const to = stops[i + 1]!.replace("*", "");
        if (from === "bar" || from === "25") bar[player]--;
        else points[player][absFromOwnPoint(RULES, player, Number(from))]!--;
        if (to === "off" || to === "0") off[player]++;
        else {
          const abs = absFromOwnPoint(RULES, player, Number(to));
          if (points[opp][abs] === 1) {
            points[opp][abs] = 0;
            bar[opp]++;
          }
          points[player][abs]!++;
        }
      }
    }
  }
  return { ...board, points, bar, off };
};

const sameBoard = (a: Board, b: Board) =>
  a.points.every((row, p) => row.every((n, i) => n === b.points[p]![i])) &&
  a.bar[0] === b.bar[0] &&
  a.bar[1] === b.bar[1] &&
  a.off[0] === b.off[0] &&
  a.off[1] === b.off[1];

/** Plays a turn given in notation: picks the legal option that leads to the noted position. */
const playTurn = (s: GameState, dice: [number, number], text: string, where: string): GameState => {
  let g = applyAction(s, { type: "roll", dice });
  if (g.phase !== "moving") return g;
  const target = applyNotation(g.board, g.turn, text);
  const options = turnOptions(g);
  const option = options.find((o) => sameBoard(o.board, target));
  if (!option) {
    if (options.length === 0 && text.trim() === "")
      return g.phase === "moving" ? applyAction(g, { type: "confirm" }) : g;
    throw new XgidError(`${where}: move "${text.trim() || "–"}" is not legal with ${dice.join("")}`);
  }
  for (const move of option.moves) g = applyAction(g, { type: "move", move });
  return g.phase === "moving" ? applyAction(g, { type: "confirm" }) : g;
};

/**
 * Imports a .mat file (Jellyfish / GNU Backgammon / eXtreme Gammon text export) of a backgammon
 * match. Every move is checked with the engine; beavers are not supported.
 */
export const fromMat = (text: string): ImportedMatch => {
  const lines = text.split(/\r?\n/);
  const length = Number(/(\d+)\s+point match/i.exec(text)?.[1] ?? 0);
  const games: ImportedMatch["games"][number][] = [];
  let players: [string, string] = ["White", "Black"];
  let i = 0;
  while (i < lines.length) {
    if (!/^\s*Game\s+\d+/i.test(lines[i]!)) {
      i++;
      continue;
    }
    const header = lines[i + 1] ?? "";
    const names = [...header.matchAll(/\s*(.+?)\s*:\s*(\d+)/g)];
    if (names.length < 2) throw new XgidError(`game ${games.length + 1}: missing player line`);
    players = [names[0]![1]!.trim(), names[1]![1]!.trim()];
    const score: [number, number] = [Number(names[0]![2]), Number(names[1]![2])];
    // the right column starts where the second name starts
    const split = header.indexOf(names[1]![1]!.trim(), names[0]![0]!.length - 1);
    i += 2;
    const actions: { player: Player; action: Action }[] = [];
    for (; i < lines.length && !/^\s*Game\s+\d+/i.test(lines[i]!); i++) {
      const line = lines[i]!;
      const start = line.indexOf(")");
      if (!/^\s*\d+\)/.test(line) || start < 0) continue;
      for (const m of line.slice(start + 1).matchAll(TOKEN)) {
        const action = toAction(m);
        if (!action) throw new XgidError(`unsupported: ${m[0]}`);
        const column = start + 1 + (m.index ?? 0);
        actions.push({ player: column >= split - 1 ? 1 : 0, action });
      }
    }
    const firstMove = actions.find((a) => a.action.kind === "move");
    if (!firstMove) continue;
    let s = createGame({ variant: "backgammon", starter: firstMove.player, cube: length !== 1 });
    const where = `game ${games.length + 1}`;
    for (const { player, action } of actions) {
      if (s.phase === "finished") break;
      switch (action.kind) {
        case "move":
          if (s.turn !== player) throw new XgidError(`${where}: unexpected move order`);
          s = playTurn(s, action.dice, action.text, where);
          break;
        case "double":
          s = applyAction(s, { type: "double" });
          break;
        case "take":
          s = applyAction(s, { type: "take" });
          break;
        case "drop":
          s = applyAction(s, { type: "drop" });
          break;
        case "wins": {
          // a resignation: the loser concedes points / cube
          const loser = (player === 0 ? 1 : 0) as Player;
          const level = Math.min(3, Math.max(1, Math.round(action.points / s.cube.value))) as ResultLevel;
          s = applyAction(s, { type: "resign", player: loser, level });
          break;
        }
      }
    }
    games.push({ history: s.history, result: s.result, score });
  }
  if (games.length === 0) throw new XgidError("no games found");
  return { length, players, games };
};
