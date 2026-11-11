import {
  applyAction,
  createGame,
  type GameResult,
  type GameState,
  type Player,
  type Rng,
  rollDice,
  type VariantId,
} from "@tavli/engine";
import { type BotLevel, chooseMoves, shouldDouble, shouldTake } from "../src";

/** Plays one game between two bot levels (index = player) and returns the result. */
export const playGame = (
  variant: VariantId,
  levels: readonly [BotLevel, BotLevel],
  rng: Rng,
  onState?: (s: GameState) => void,
  cube = true,
): GameResult => {
  let s = createGame({ variant, cube });
  for (let guard = 0; guard < 4000; guard++) {
    onState?.(s);
    switch (s.phase) {
      case "finished":
        return s.result!;
      case "opening":
        s = applyAction(s, { type: "roll", dice: rollDice(rng) });
        break;
      case "rolling":
        s = shouldDouble(s, levels[s.turn])
          ? applyAction(s, { type: "double" })
          : applyAction(s, { type: "roll", dice: rollDice(rng) });
        break;
      case "cube-offered": {
        const taker: Player = s.turn === 0 ? 1 : 0;
        s = applyAction(s, { type: shouldTake(s, levels[taker]) ? "take" : "drop" });
        break;
      }
      case "moving": {
        for (const move of chooseMoves(s, levels[s.turn], rng)) s = applyAction(s, { type: "move", move });
        if (s.phase === "moving") s = applyAction(s, { type: "confirm" });
        break;
      }
    }
  }
  throw new Error("game did not finish");
};

/** Points won by each side over n games, alternating colours. */
export const duel = (variant: VariantId, a: BotLevel, b: BotLevel, games: number, rng: Rng) => {
  const points = { [a]: 0, [b]: 0 } as Record<string, number>;
  let aWins = 0;
  for (let i = 0; i < games; i++) {
    const levels: [BotLevel, BotLevel] = i % 2 === 0 ? [a, b] : [b, a];
    const r = playGame(variant, levels, rng);
    const winnerLevel = levels[r.winner];
    points[winnerLevel] = (points[winnerLevel] ?? 0) + r.points;
    if (r.winner === (i % 2 === 0 ? 0 : 1)) aWins++;
  }
  return { aWins, games, points };
};
