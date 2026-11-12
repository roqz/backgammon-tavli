import { boardFromSpec } from "./board";
import type { Board, Dice, GameState, Player } from "./types";
import { getVariant, ownPoint } from "./variants";
import { XgidError, type XgidMatchInfo, type XgidPosition } from "./xgid";

/**
 * GNU Backgammon "Position ID:Match ID" (e.g. `4HPwATDgc/ABMA:cAkAAAAAAAAA`).
 *
 * - Position ID: 80 bits, Base64 (14 chars). For the player NOT on roll, then the player on
 *   roll: for each point from their ace point (1) to 24 and then the bar, one 1-bit per checker
 *   followed by a 0. Bits are packed little-endian (bit 0 = lowest bit of byte 0).
 * - Match ID: 66 bits, Base64 (12 chars), same packing: cube log2 (4 bits), cube owner (2;
 *   3 = centred), dice owner (1), Crawford (1), game state (3), turn (1), double offered (1),
 *   resignation (2), die 1 (3), die 2 (3), match length (15, 0 = money), score of player 0 (15),
 *   score of player 1 (15).
 *
 * GNU Backgammon's player 1 is the bottom player; here that is White (player 0), as for XGID.
 */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const RULES = getVariant("backgammon");

const toBase64 = (bytes: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let c = 0; c < chars; c++) out += B64[(n >> (18 - 6 * c)) & 63];
  }
  return out;
};

const fromBase64 = (text: string, length: number): Uint8Array => {
  const out = new Uint8Array(length);
  let bits = 0;
  let acc = 0;
  let k = 0;
  for (const ch of text) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new XgidError(`invalid character "${ch}"`);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (k < length) out[k++] = (acc >> bits) & 0xff;
    }
  }
  return out;
};

/** Little-endian bit field writer/reader over a byte array. */
const setBits = (bytes: Uint8Array, start: number, width: number, value: number) => {
  for (let i = 0; i < width; i++) if ((value >> i) & 1) bytes[(start + i) >> 3]! |= 1 << ((start + i) & 7);
};
const getBits = (bytes: Uint8Array, start: number, width: number): number => {
  let v = 0;
  for (let i = 0; i < width; i++) if (bytes[(start + i) >> 3]! & (1 << ((start + i) & 7))) v |= 1 << i;
  return v;
};

/** gnubg player number of our player and back (White = gnubg player 1). */
const gnubgPlayer = (p: Player) => (p === 0 ? 1 : 0);
const ourPlayer = (g: number): Player => (g === 1 ? 0 : 1);

/** Checker counts of a player from their own ace point to 24, then the bar. */
const countsOf = (board: Board, p: Player): number[] => {
  const counts = new Array<number>(25).fill(0);
  for (let abs = 0; abs < 24; abs++) {
    const n = board.points[p][abs]!;
    if (n) counts[ownPoint(RULES, p, abs) - 1] = n;
  }
  counts[24] = board.bar[p];
  return counts;
};

export const positionId = (board: Board, onRoll: Player): string => {
  const bytes = new Uint8Array(10);
  let bit = 0;
  for (const p of [onRoll === 0 ? 1 : 0, onRoll] as const) {
    for (const n of countsOf(board, p)) {
      setBits(bytes, bit, n, (1 << n) - 1);
      bit += n + 1;
    }
  }
  return toBase64(bytes);
};

export const boardFromPositionId = (id: string, onRoll: Player): Board => {
  if (!/^[A-Za-z0-9+/]{14}$/.test(id)) throw new XgidError("position ID must have 14 characters");
  const bytes = fromBase64(id, 10);
  const spec: { white: Record<number, number>; black: Record<number, number>; bar: [number, number] } = {
    white: {},
    black: {},
    bar: [0, 0],
  };
  let bit = 0;
  for (const p of [onRoll === 0 ? 1 : 0, onRoll] as const) {
    let total = 0;
    for (let point = 0; point < 25; point++) {
      let n = 0;
      while (bit < 80 && getBits(bytes, bit, 1) === 1) {
        n++;
        bit++;
      }
      bit++;
      total += n;
      if (point === 24) spec.bar[p] = n;
      else if (n) (p === 0 ? spec.white : spec.black)[point + 1] = n;
    }
    if (total > 15) throw new XgidError("more than 15 checkers");
  }
  const board = boardFromSpec(RULES, spec);
  const onBoard = (p: Player) => board.points[p].reduce((s, n) => s + n, 0) + board.bar[p];
  return { ...board, off: [15 - onBoard(0), 15 - onBoard(1)] };
};

/** The board the player on turn started the turn with (half-played turns cannot be expressed). */
const turnStartBoard = (s: GameState): Board =>
  s.phase === "moving" && s.undoStack.length > 0 ? s.undoStack[0]! : s.board;

/** "PositionID:MatchID" of a backgammon or Portes game state. */
export const toGnubgId = (
  s: GameState,
  info: XgidMatchInfo = { score: [0, 0], length: 0, crawford: false },
): string => {
  const doubled = s.phase === "cube-offered";
  const onRoll: Player = s.turn;
  const m = new Uint8Array(9);
  const cube = s.cube.value;
  setBits(m, 0, 4, Math.round(Math.log2(cube)));
  setBits(m, 4, 2, s.cube.owner === null ? 3 : gnubgPlayer(s.cube.owner));
  setBits(m, 6, 1, gnubgPlayer(onRoll));
  setBits(m, 7, 1, info.crawford ? 1 : 0);
  setBits(m, 8, 3, 1);
  // during an offered double the opponent has to decide
  setBits(m, 11, 1, gnubgPlayer(doubled ? (onRoll === 0 ? 1 : 0) : onRoll));
  setBits(m, 12, 1, doubled ? 1 : 0);
  if (s.phase === "moving" && s.dice) {
    setBits(m, 15, 3, s.dice[0]);
    setBits(m, 18, 3, s.dice[1]);
  }
  setBits(m, 21, 15, info.length);
  setBits(m, 36, 15, info.score[1]);
  setBits(m, 51, 15, info.score[0]);
  return `${positionId(turnStartBoard(s), onRoll)}:${toBase64(m)}`;
};

/**
 * Parses "PositionID:MatchID" (also "GNUbg ID: …" as gnubg copies it). Without a match ID the
 * position is a money game with White on roll.
 */
export const parseGnubgId = (text: string): XgidPosition => {
  const cleaned = text.trim().replace(/^GNU\s*bg\s*ID\s*:?\s*/i, "");
  const [pos, match] = cleaned.split(":").map((x) => x.trim());
  if (!pos) throw new XgidError("missing position ID");
  if (!match) {
    return {
      board: boardFromPositionId(pos, 0),
      turn: 0,
      cube: { value: 1, owner: null },
      dice: null,
      doubled: false,
      jacoby: false,
      score: [0, 0],
      length: 0,
      crawford: false,
    };
  }
  if (!/^[A-Za-z0-9+/]{12}$/.test(match)) throw new XgidError("match ID must have 12 characters");
  const m = fromBase64(match, 9);
  const owner = getBits(m, 4, 2);
  const onRoll = ourPlayer(getBits(m, 6, 1));
  const doubled = getBits(m, 12, 1) === 1;
  const d1 = getBits(m, 15, 3);
  const d2 = getBits(m, 18, 3);
  const dice: Dice | null = d1 >= 1 && d1 <= 6 && d2 >= 1 && d2 <= 6 ? [d1, d2] : null;
  const length = getBits(m, 21, 15);
  return {
    board: boardFromPositionId(pos, onRoll),
    turn: onRoll,
    cube: { value: 2 ** getBits(m, 0, 4), owner: owner === 3 ? null : ourPlayer(owner) },
    dice: doubled ? null : dice,
    doubled,
    jacoby: false,
    score: [getBits(m, 51, 15), getBits(m, 36, 15)],
    length,
    crawford: getBits(m, 7, 1) === 1,
  };
};

/** Either format: XGID ("XGID=…") or GNU Backgammon ("PositionID:MatchID"). */
export const isGnubgId = (text: string): boolean =>
  /^\s*(GNU\s*bg\s*ID\s*:?\s*)?[A-Za-z0-9+/]{14}(:[A-Za-z0-9+/]{12})?\s*$/i.test(text);
