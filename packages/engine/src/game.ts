import { HOME_START, initialBoard, POINTS } from "./board";
import { applyMoveUnchecked, diceToPlay, gameEndAfterMove, MoveGenerator, sameMove } from "./movegen";
import type {
  Board,
  Dice,
  FinishReason,
  GameAction,
  GameResult,
  GameState,
  Move,
  PlayedMove,
  Player,
  ResultLevel,
  TurnRecord,
  VariantId,
} from "./types";
import { IllegalActionError, opponent } from "./types";
import { getVariant, type VariantRules } from "./variants";

export interface NewGameOptions {
  readonly variant: VariantId;
  /** Doubling cube available (default: variant supports it). Set false for Crawford games. */
  readonly cube?: boolean;
  /** Money-game Jacoby rule (default false). */
  readonly jacoby?: boolean;
  /** Skip the opening roll: this player rolls first (e.g. winner of the previous Tavli game). */
  readonly starter?: Player;
  /** Start from a custom position instead of the variant's initial setup. */
  readonly board?: Board;
}

export const createGame = (opts: NewGameOptions): GameState => {
  const rules = getVariant(opts.variant);
  return {
    variant: opts.variant,
    board: opts.board ?? initialBoard(rules),
    phase: opts.starter === undefined ? "opening" : "rolling",
    turn: opts.starter ?? 0,
    dice: null,
    remaining: [],
    played: [],
    undoStack: [],
    cube: { value: 1, owner: null, enabled: (opts.cube ?? true) && rules.cube },
    jacoby: opts.jacoby ?? false,
    history: [],
    result: null,
  };
};

const generators = new WeakMap<VariantRules, [MoveGenerator, MoveGenerator]>();

/** Shared, cached move generator for a variant and player. */
export const moveGenerator = (variant: VariantId, player: Player): MoveGenerator => {
  const rules = getVariant(variant);
  let pair = generators.get(rules);
  if (!pair) {
    pair = [new MoveGenerator(rules, 0), new MoveGenerator(rules, 1)];
    generators.set(rules, pair);
  }
  return pair[player];
};

/** Legal single moves for the player on turn (empty unless phase is `moving`). */
export const legalMoves = (s: GameState): Move[] =>
  s.phase === "moving" ? moveGenerator(s.variant, s.turn).legalMoves(s.board, s.remaining) : [];

/** The turn can be confirmed once no further move is possible. */
export const canConfirm = (s: GameState): boolean => s.phase === "moving" && legalMoves(s).length === 0;

export const canUndo = (s: GameState): boolean => s.phase === "moving" && s.undoStack.length > 0;

export const canDouble = (s: GameState): boolean =>
  s.phase === "rolling" && s.cube.enabled && (s.cube.owner === null || s.cube.owner === s.turn);

/** The player who has to act next (for `cube-offered` that is the opponent of the doubler). */
export const playerToAct = (s: GameState): Player | null => {
  switch (s.phase) {
    case "opening":
    case "finished":
      return null;
    case "cube-offered":
      return opponent(s.turn);
    default:
      return s.turn;
  }
};

const isValidDie = (d: number) => Number.isInteger(d) && d >= 1 && d <= 6;

/** Result level when `winner` has borne off all checkers. */
export const bearOffLevel = (s: GameState, winner: Player): ResultLevel => {
  const rules = getVariant(s.variant);
  const loser = opponent(winner);
  const b = s.board;
  if (b.off[loser] > 0) return 1;
  if (s.jacoby && s.cube.enabled && s.cube.value === 1) return 1;
  if (rules.backgammons) {
    if (b.bar[loser] > 0) return 3;
    const winnerPath = rules.paths[winner];
    for (let k = HOME_START; k < POINTS; k++) if (b.points[loser][winnerPath[k]!]! > 0) return 3;
  }
  return 2;
};

const finish = (
  s: GameState,
  winner: Player,
  level: ResultLevel,
  reason: FinishReason,
  extraHistory: TurnRecord[] = [],
): GameState => {
  const result: GameResult = { winner, level, cube: s.cube.value, points: level * s.cube.value, reason };
  return {
    ...s,
    phase: "finished",
    remaining: [],
    undoStack: [],
    history: [...s.history, ...extraHistory],
    result,
  };
};

const moveRecord = (s: GameState, played: readonly PlayedMove[]): TurnRecord => ({
  kind: "move",
  player: s.turn,
  dice: s.dice!,
  moves: played,
});

const startMoving = (s: GameState, player: Player, dice: Dice): GameState => ({
  ...s,
  phase: "moving",
  turn: player,
  dice,
  remaining: diceToPlay(dice[0], dice[1]),
  played: [],
  undoStack: [],
});

/** Pure reducer: returns the next state or throws {@link IllegalActionError}. */
export const applyAction = (s: GameState, action: GameAction): GameState => {
  const illegal = (why: string): never => {
    throw new IllegalActionError(`${action.type} not allowed: ${why}`);
  };
  if (s.phase === "finished") illegal("game is finished");

  switch (action.type) {
    case "roll": {
      const [a, b] = action.dice;
      if (!isValidDie(a) || !isValidDie(b)) illegal("invalid dice");
      if (s.phase === "opening") {
        if (a === b) return s; // tie: roll again
        const starter: Player = a > b ? 0 : 1;
        return getVariant(s.variant).openingRollPlayed
          ? startMoving(s, starter, action.dice)
          : { ...s, phase: "rolling", turn: starter };
      }
      if (s.phase !== "rolling") illegal(`phase is ${s.phase}`);
      return startMoving(s, s.turn, action.dice);
    }

    case "move": {
      if (s.phase !== "moving") illegal(`phase is ${s.phase}`);
      const legal = legalMoves(s).find((m) => sameMove(m, action.move));
      if (!legal) illegal("move is not legal");
      const rules = getVariant(s.variant);
      const { board, hit } = applyMoveUnchecked(rules, s.board, s.turn, legal!);
      const remaining = s.remaining.slice();
      remaining.splice(remaining.indexOf(legal!.die), 1);
      const played = [...s.played, { ...legal!, hit }];
      const next: GameState = {
        ...s,
        board,
        remaining,
        played,
        undoStack: [...s.undoStack, s.board],
      };
      const end = gameEndAfterMove(rules, board, s.turn, legal!, hit);
      if (end === "bear-off") {
        return finish(next, s.turn, bearOffLevel(next, s.turn), "bear-off", [moveRecord(s, played)]);
      }
      if (end === "mana") return finish(next, s.turn, 2, "mana", [moveRecord(s, played)]);
      return next;
    }

    case "undo": {
      if (!canUndo(s)) illegal("nothing to undo");
      const last = s.played[s.played.length - 1]!;
      return {
        ...s,
        board: s.undoStack[s.undoStack.length - 1]!,
        undoStack: s.undoStack.slice(0, -1),
        played: s.played.slice(0, -1),
        remaining: [...s.remaining, last.die].sort((x, y) => y - x),
      };
    }

    case "confirm": {
      if (!canConfirm(s)) illegal("moves are still possible");
      return {
        ...s,
        phase: "rolling",
        turn: opponent(s.turn),
        dice: null,
        remaining: [],
        played: [],
        undoStack: [],
        history: [...s.history, moveRecord(s, s.played)],
      };
    }

    case "double": {
      if (!canDouble(s)) illegal("doubling not possible");
      return {
        ...s,
        phase: "cube-offered",
        history: [...s.history, { kind: "double", player: s.turn, to: s.cube.value * 2 }],
      };
    }

    case "take": {
      if (s.phase !== "cube-offered") illegal("no double offered");
      const taker = opponent(s.turn);
      return {
        ...s,
        phase: "rolling",
        cube: { ...s.cube, value: s.cube.value * 2, owner: taker },
        history: [...s.history, { kind: "take", player: taker }],
      };
    }

    case "drop": {
      if (s.phase !== "cube-offered") illegal("no double offered");
      return finish(s, s.turn, 1, "drop", [{ kind: "drop", player: opponent(s.turn) }]);
    }

    case "resign": {
      return finish(s, opponent(action.player), action.level, "resign", [
        { kind: "resign", player: action.player, level: action.level },
      ]);
    }
  }
};

/** Convenience: apply several actions in order. */
export const applyActions = (s: GameState, actions: readonly GameAction[]): GameState =>
  actions.reduce(applyAction, s);
