import { applyAction, createGame } from "./game";
import type { GameAction, GameResult, GameState, Player, VariantId } from "./types";
import { IllegalActionError } from "./types";
import { getVariant } from "./variants";

/** `tavli` rotates Portes -> Plakoto -> Fevga, as played in Greece. */
export type MatchVariant = VariantId | "tavli";

export const TAVLI_ROTATION: readonly VariantId[] = ["portes", "plakoto", "fevga"];

export interface MatchConfig {
  readonly variant: MatchVariant;
  /** Points needed to win. 0 = unlimited session (money play). */
  readonly length: number;
  /** Crawford rule for matches (default true). */
  readonly crawford?: boolean;
  /** Jacoby rule, only applied in unlimited sessions (default false). */
  readonly jacoby?: boolean;
}

export type CrawfordState = "pending" | "crawford-game" | "done";

export interface MatchState {
  readonly config: MatchConfig;
  readonly score: readonly [number, number];
  /** Results of completed games. */
  readonly results: readonly GameResult[];
  readonly crawford: CrawfordState;
  readonly game: GameState;
  readonly winner: Player | null;
}

export type MatchAction = GameAction | { readonly type: "next-game" };

export const variantOfGame = (config: MatchConfig, gameIndex: number): VariantId =>
  config.variant === "tavli" ? TAVLI_ROTATION[gameIndex % TAVLI_ROTATION.length]! : config.variant;

const newGameFor = (
  config: MatchConfig,
  gameIndex: number,
  isCrawford: boolean,
  previousWinner?: Player,
): GameState => {
  const variant = variantOfGame(config, gameIndex);
  const rules = getVariant(variant);
  return createGame({
    variant,
    cube: rules.cube && !isCrawford && config.length !== 1,
    jacoby: config.length === 0 && (config.jacoby ?? false),
    // Tavli tradition: the winner of the previous game starts the next one.
    starter: rules.openingRollPlayed ? undefined : previousWinner,
  });
};

export const createMatch = (config: MatchConfig): MatchState => {
  if (!Number.isInteger(config.length) || config.length < 0) throw new Error("Invalid match length");
  return {
    config,
    score: [0, 0],
    results: [],
    crawford: "pending",
    game: newGameFor(config, 0, false),
    winner: null,
  };
};

export const applyMatchAction = (m: MatchState, action: MatchAction): MatchState => {
  if (m.winner !== null) throw new IllegalActionError("match is over");

  if (action.type === "next-game") {
    if (m.game.phase !== "finished") throw new IllegalActionError("current game is not finished");
    const { config, score } = m;
    let crawford = m.crawford;
    if (crawford === "crawford-game") crawford = "done";
    const crawfordNow =
      crawford === "pending" &&
      (config.crawford ?? true) &&
      config.length > 1 &&
      (score[0] === config.length - 1 || score[1] === config.length - 1);
    if (crawfordNow) crawford = "crawford-game";
    const previous = m.results[m.results.length - 1];
    return {
      ...m,
      crawford,
      game: newGameFor(config, m.results.length, crawfordNow, previous?.winner),
    };
  }

  const game = applyAction(m.game, action);
  if (!game.result || m.game.result) return { ...m, game };

  const r = game.result;
  const score: [number, number] = [m.score[0], m.score[1]];
  score[r.winner] += r.points;
  const winner = m.config.length > 0 && score[r.winner] >= m.config.length ? r.winner : null;
  return { ...m, game, score, results: [...m.results, r], winner };
};
