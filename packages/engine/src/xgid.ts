import { CHECKERS_PER_PLAYER, cloneBoard, emptyBoard } from "./board";
import { applyAction, createGame } from "./game";
import type { Board, Dice, GameState, Player, VariantId } from "./types";
import { absFromOwnPoint, getVariant, ownPoint } from "./variants";

/**
 * XGID position IDs (eXtreme Gammon, also read by GNU Backgammon and most other programs), e.g.
 * `XGID=-b----E-C---eE---c-e----B-:0:0:1:00:0:0:0:0:10` for the starting position.
 *
 * Mapping: the bottom player ("X", uppercase letters) is white, the top player (lowercase) black.
 * XGID point n is white's own point n and black's own point 25 - n. Only variants with opposite
 * directions and hitting can be expressed (Backgammon, Portes).
 */
export const XGID_VARIANTS: readonly VariantId[] = ["backgammon", "portes"];

export interface XgidMatchInfo {
  /** Match score [white, black]. */
  readonly score: readonly [number, number];
  /** 0 = money game. */
  readonly length: number;
  readonly crawford: boolean;
}

export interface XgidPosition extends XgidMatchInfo {
  readonly board: Board;
  /** Player on turn (for an offered double: the doubler). */
  readonly turn: Player;
  readonly cube: { readonly value: number; readonly owner: Player | null };
  /** Dice already rolled, or null when the player still has to roll (or double). */
  readonly dice: Dice | null;
  /** The player on turn has doubled; the opponent must take or drop. */
  readonly doubled: boolean;
  readonly jacoby: boolean;
}

export class XgidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XgidError";
  }
}

const RULES = getVariant("backgammon");

const countChar = (n: number, upper: boolean): string => {
  if (n === 0) return "-";
  const c = String.fromCharCode(96 + n);
  return upper ? c.toUpperCase() : c;
};

/** The board the player on turn started the turn with (XGID cannot express half-played turns). */
const turnStartBoard = (s: GameState): Board =>
  s.phase === "moving" && s.undoStack.length > 0 ? s.undoStack[0]! : s.board;

/** XGID of a game state (Backgammon or Portes); match info defaults to a money game. */
export const toXgid = (
  s: GameState,
  info: XgidMatchInfo = { score: [0, 0], length: 0, crawford: false },
): string => {
  if (!XGID_VARIANTS.includes(s.variant)) throw new XgidError(`XGID does not support ${s.variant}`);
  const b = turnStartBoard(s);
  const chars: string[] = new Array<string>(26).fill("-");
  chars[0] = countChar(b.bar[1], false);
  chars[25] = countChar(b.bar[0], true);
  for (let abs = 0; abs < 24; abs++) {
    const w = b.points[0][abs]!;
    const k = b.points[1][abs]!;
    const n = ownPoint(RULES, 0, abs);
    if (w > 0) chars[n] = countChar(w, true);
    else if (k > 0) chars[n] = countChar(k, false);
  }
  const cubeExp = Math.round(Math.log2(s.cube.value));
  const cubePos = s.cube.owner === null ? 0 : s.cube.owner === 0 ? 1 : -1;
  const turn = s.turn === 0 ? 1 : -1;
  const dice =
    s.phase === "cube-offered" ? "D" : s.phase === "moving" && s.dice ? `${s.dice[0]}${s.dice[1]}` : "00";
  const flags = info.length > 0 ? (info.crawford ? 1 : 0) : s.jacoby ? 1 : 0;
  return `XGID=${chars.join("")}:${cubeExp}:${cubePos}:${turn}:${dice}:${info.score[0]}:${info.score[1]}:${flags}:${info.length}:10`;
};

const parseCount = (c: string): { player: Player; n: number } | null => {
  if (c === "-") return null;
  const code = c.charCodeAt(0);
  if (code >= 65 && code <= 79) return { player: 0, n: code - 64 }; // A..O
  if (code >= 97 && code <= 111) return { player: 1, n: code - 96 }; // a..o
  throw new XgidError(`invalid checker character "${c}"`);
};

const int = (v: string | undefined, name: string, min: number, max: number): number => {
  const n = Number(v);
  if (v === undefined || v === "" || !Number.isInteger(n) || n < min || n > max)
    throw new XgidError(`invalid ${name}: ${v}`);
  return n;
};

/** Parses an XGID (with or without the `XGID=` prefix). */
export const parseXgid = (text: string): XgidPosition => {
  const raw = text.trim().replace(/^XGID=/i, "");
  const parts = raw.split(":");
  if (parts.length < 9) throw new XgidError("an XGID has at least 9 fields");
  const pos = parts[0]!;
  if (pos.length !== 26) throw new XgidError("the position must have 26 characters");

  const b = cloneBoard(emptyBoard());
  const top = parseCount(pos[0]!);
  const bottom = parseCount(pos[25]!);
  if (top && top.player !== 1) throw new XgidError("the top bar holds black (lowercase) checkers");
  if (bottom && bottom.player !== 0) throw new XgidError("the bottom bar holds white (uppercase) checkers");
  b.bar = [bottom?.n ?? 0, top?.n ?? 0];
  for (let n = 1; n <= 24; n++) {
    const c = parseCount(pos[n]!);
    if (c) b.points[c.player][absFromOwnPoint(RULES, 0, n)] = c.n;
  }
  for (const p of [0, 1] as Player[]) {
    const onBoard = b.points[p].reduce((x, y) => x + y, 0) + b.bar[p];
    if (onBoard > CHECKERS_PER_PLAYER) throw new XgidError("more than 15 checkers");
    b.off[p] = CHECKERS_PER_PLAYER - onBoard;
  }
  if (b.off[0] === CHECKERS_PER_PLAYER || b.off[1] === CHECKERS_PER_PLAYER)
    throw new XgidError("the game is already over");

  const cubeExp = int(parts[1], "cube", 0, 12);
  const cubePos = int(parts[2], "cube position", -1, 1);
  const turnField = int(parts[3], "turn", -1, 1);
  if (turnField === 0) throw new XgidError("invalid turn: 0");
  const diceField = parts[4]!;
  let dice: Dice | null = null;
  let doubled = false;
  if (diceField === "D" || diceField === "B" || diceField === "R") doubled = true;
  else if (/^[1-6]{2}$/.test(diceField)) dice = [Number(diceField[0]), Number(diceField[1])];
  else if (diceField !== "00") throw new XgidError(`invalid dice: ${diceField}`);
  const score: [number, number] = [int(parts[5], "score", 0, 999), int(parts[6], "score", 0, 999)];
  const flags = int(parts[7], "Crawford/Jacoby", 0, 3);
  const length = int(parts[8], "match length", 0, 999);

  return {
    board: b,
    turn: turnField === 1 ? 0 : 1,
    cube: { value: 2 ** cubeExp, owner: cubePos === 0 ? null : cubePos === 1 ? 0 : 1 },
    dice,
    doubled,
    score,
    length,
    crawford: length > 0 && (flags & 1) === 1,
    jacoby: length === 0 && (flags & 1) === 1,
  };
};

/** A game in the parsed position, ready to be played on (rolled dice and offered doubles applied). */
export const gameFromXgid = (x: XgidPosition, variant: VariantId = "backgammon"): GameState => {
  if (!XGID_VARIANTS.includes(variant)) throw new XgidError(`XGID does not support ${variant}`);
  const rules = getVariant(variant);
  let g = createGame({
    variant,
    board: x.board,
    starter: x.turn,
    cube: rules.cube && !x.crawford && x.length !== 1,
    jacoby: x.jacoby,
    cubeAt: rules.cube ? x.cube : undefined,
  });
  try {
    if (x.doubled) g = applyAction(g, { type: "double" });
    else if (x.dice) g = applyAction(g, { type: "roll", dice: x.dice });
  } catch (e) {
    throw new XgidError(e instanceof Error ? e.message : String(e));
  }
  return g;
};
