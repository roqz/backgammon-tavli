import {
  applyMoveUnchecked,
  type Board,
  type Cube,
  createGame,
  type GameState,
  getVariant,
  initialBoard,
  type PlayedMove,
  type Player,
  type TurnRecord,
  type VariantId,
} from "@tavli/engine";

/** One displayable step of a replay. */
export interface ReplayFrame {
  /** Synthetic, read-only game state for the board renderer. */
  readonly state: GameState;
  /** Index into the history this frame belongs to (-1 = start position). */
  readonly recordIndex: number;
  /** The move that led to this frame, for layout animation. */
  readonly move: PlayedMove | null;
  readonly mover: Player | null;
}

/**
 * Rebuilds every position of a game from its turn records: one frame after each single move,
 * plus frames for cube actions.
 */
export const buildFrames = (variant: VariantId, history: readonly TurnRecord[]): ReplayFrame[] => {
  const rules = getVariant(variant);
  const base = createGame({ variant, starter: 0 });
  let board: Board = initialBoard(rules);
  let cube: Cube = base.cube;
  const frames: ReplayFrame[] = [
    { state: { ...base, board, phase: "rolling" }, recordIndex: -1, move: null, mover: null },
  ];
  history.forEach((rec, i) => {
    switch (rec.kind) {
      case "move": {
        const dice = rec.dice;
        const played: PlayedMove[] = [];
        const all = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
        const frameFor = (move: PlayedMove | null): ReplayFrame => {
          const remaining = all.slice();
          for (const m of played) remaining.splice(remaining.indexOf(m.die), 1);
          return {
            state: {
              ...base,
              board,
              cube,
              phase: "moving",
              turn: rec.player,
              dice,
              remaining,
              played: [...played],
            },
            recordIndex: i,
            move,
            mover: move ? rec.player : null,
          };
        };
        if (rec.moves.length === 0) frames.push(frameFor(null));
        for (const m of rec.moves) {
          board = applyMoveUnchecked(rules, board, rec.player, m).board;
          played.push(m);
          frames.push(frameFor(m));
        }
        break;
      }
      case "take":
      case "beaver":
      case "raccoon":
        cube = { ...cube, value: rec.kind === "take" ? cube.value * 2 : rec.to, owner: rec.player };
        frames.push({
          state: { ...base, board, cube, phase: "rolling", turn: rec.player },
          recordIndex: i,
          move: null,
          mover: null,
        });
        break;
      default:
        frames.push({
          state: { ...base, board, cube, phase: "rolling", turn: rec.player },
          recordIndex: i,
          move: null,
          mover: null,
        });
    }
  });
  return frames;
};
