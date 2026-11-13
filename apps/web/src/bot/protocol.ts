import type { BotLevel, MatchContext } from "@tavli/ai";
import type { GameState, Move, TurnRecord, VariantId } from "@tavli/engine";
import type { Puzzle } from "../puzzle";
import type { GameReview } from "../review";

export type BotRequest =
  | { readonly kind: "moves"; readonly state: GameState; readonly level: BotLevel }
  | {
      readonly kind: "double";
      readonly state: GameState;
      readonly level: BotLevel;
      readonly match: MatchContext;
    }
  | {
      readonly kind: "take";
      readonly state: GameState;
      readonly level: BotLevel;
      readonly match: MatchContext;
    }
  /** Money play with beavers: beaver a double / raccoon a beaver. */
  | { readonly kind: "beaver"; readonly state: GameState; readonly level: BotLevel }
  | { readonly kind: "raccoon"; readonly state: GameState; readonly level: BotLevel }
  /** Answer the opponent's offer to resign (`state.resignOffer`). */
  | { readonly kind: "accept-resign"; readonly state: GameState; readonly match?: MatchContext }
  /** Review all checker-play decisions of a finished game. */
  | { readonly kind: "review"; readonly variant: VariantId; readonly history: readonly TurnRecord[] }
  /** The puzzle of a day (deterministic). */
  | { readonly kind: "puzzle"; readonly date: string };

export type BotResponse<R extends BotRequest> = R extends { kind: "moves" }
  ? Move[]
  : R extends { kind: "review" }
    ? GameReview
    : R extends { kind: "puzzle" }
      ? Puzzle
      : boolean;

export interface BotEnvelope {
  readonly id: number;
  readonly request: BotRequest;
}

export interface BotReply {
  readonly id: number;
  readonly result?: Move[] | boolean | GameReview | Puzzle;
  readonly error?: string;
}
