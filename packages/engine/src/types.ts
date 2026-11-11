/**
 * Core types of the rules engine.
 *
 * Coordinates: the board has 24 points with *absolute* indices 0..23. Every player walks a
 * `path` of 24 absolute indices (defined by the variant). Path index 0 is the player's starting
 * point (their "24-point"), path index 23 is their "1-point" next to bearing off. A player's own
 * point number (as used in notation) is therefore `24 - pathIndex`.
 */

/** 0 = white, 1 = black. */
export type Player = 0 | 1;

export const WHITE: Player = 0;
export const BLACK: Player = 1;

export const opponent = (p: Player): Player => (p === 0 ? 1 : 0);

export type VariantId = "backgammon" | "portes" | "plakoto" | "fevga";

export interface Board {
  /** Checker counts per player per absolute point: `points[player][absIndex]`. */
  readonly points: readonly [readonly number[], readonly number[]];
  /** Plakoto only: which player's checker is pinned (trapped beneath the other colour) on a point. */
  readonly pinned: readonly (Player | null)[];
  readonly bar: readonly [number, number];
  readonly off: readonly [number, number];
}

export type From = number | "bar";
export type To = number | "off";

/** A single checker movement using one die. `from`/`to` are absolute point indices. */
export interface Move {
  readonly from: From;
  readonly to: To;
  readonly die: number;
}

/** A move as it was played, including whether it hit (or pinned) an opposing checker. */
export interface PlayedMove extends Move {
  readonly hit: boolean;
}

export type Dice = readonly [number, number];

export type Phase =
  /** Both players roll one die each to decide who starts. */
  | "opening"
  /** Player on turn may double (if allowed) or roll. */
  | "rolling"
  /** Player on turn moves checkers; ends with `confirm`. */
  | "moving"
  /** Player on turn offered a double; opponent must take or drop. */
  | "cube-offered"
  | "finished";

export interface Cube {
  readonly value: number;
  /** `null` = centred, either player may double. */
  readonly owner: Player | null;
  /** False for variants without cube or during a Crawford game. */
  readonly enabled: boolean;
}

/** Result multiplier before cube: 1 = single, 2 = gammon / mars, 3 = backgammon. */
export type ResultLevel = 1 | 2 | 3;

export type FinishReason = "bear-off" | "drop" | "resign" | "mana";

export interface GameResult {
  readonly winner: Player;
  readonly level: ResultLevel;
  readonly cube: number;
  readonly points: number;
  readonly reason: FinishReason;
}

export type TurnRecord =
  | {
      readonly kind: "move";
      readonly player: Player;
      readonly dice: Dice;
      readonly moves: readonly PlayedMove[];
    }
  | { readonly kind: "double"; readonly player: Player; readonly to: number }
  | { readonly kind: "take"; readonly player: Player }
  /** On the bar against a closed home board: the turn is skipped without rolling. */
  | { readonly kind: "closed-out"; readonly player: Player }
  | { readonly kind: "drop"; readonly player: Player }
  | { readonly kind: "resign"; readonly player: Player; readonly level: ResultLevel };

export interface GameState {
  readonly variant: VariantId;
  readonly board: Board;
  readonly phase: Phase;
  /** Player on turn (meaningless during `opening`). */
  readonly turn: Player;
  /** Dice rolled this turn. */
  readonly dice: Dice | null;
  /** Dice values still to be played this turn. */
  readonly remaining: readonly number[];
  /** Moves played so far this turn. */
  readonly played: readonly PlayedMove[];
  /** Boards before each move of this turn, used for undo. */
  readonly undoStack: readonly Board[];
  readonly cube: Cube;
  /** Money game Jacoby rule: gammons count only after the cube was turned. */
  readonly jacoby: boolean;
  readonly history: readonly TurnRecord[];
  readonly result: GameResult | null;
  /**
   * A player offered to resign at a given level; the opponent has to accept or reject before
   * the game goes on. Optional so that stored states from older versions stay valid.
   */
  readonly resignOffer?: ResignOffer | null;
}

export interface ResignOffer {
  readonly player: Player;
  readonly level: ResultLevel;
}

export type GameAction =
  /**
   * In `opening`: `dice[0]` is white's die, `dice[1]` black's die. Otherwise the turn player's roll.
   * Dice are supplied from outside so the engine stays deterministic (server/seeded RNG decides).
   */
  | { readonly type: "roll"; readonly dice: Dice }
  | { readonly type: "move"; readonly move: Move }
  | { readonly type: "undo" }
  /** Skip the turn without rolling when closed out (see isClosedOut). */
  | { readonly type: "pass" }
  | { readonly type: "confirm" }
  | { readonly type: "double" }
  | { readonly type: "take" }
  | { readonly type: "drop" }
  /** Immediate resignation (no answer needed). */
  | { readonly type: "resign"; readonly player: Player; readonly level: ResultLevel }
  /** The player on turn offers to resign at `level`; the opponent accepts or rejects. */
  | { readonly type: "offer-resign"; readonly player: Player; readonly level: ResultLevel }
  | { readonly type: "accept-resign" }
  | { readonly type: "reject-resign" };

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}
