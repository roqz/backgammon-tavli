import type { BotLevel, MatchContext } from "@tavli/ai";
import type { GameState, Move, TurnRecord, VariantId } from "@tavli/engine";
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
  /** Answer the opponent's offer to resign (`state.resignOffer`). */
  | { readonly kind: "accept-resign"; readonly state: GameState; readonly match?: MatchContext }
  /** Review all checker-play decisions of a finished game. */
  | { readonly kind: "review"; readonly variant: VariantId; readonly history: readonly TurnRecord[] };

export type BotResponse<R extends BotRequest> = R extends { kind: "moves" }
  ? Move[]
  : R extends { kind: "review" }
    ? GameReview
    : boolean;

export interface BotEnvelope {
  readonly id: number;
  readonly request: BotRequest;
}

export interface BotReply {
  readonly id: number;
  readonly result?: Move[] | boolean | GameReview;
  readonly error?: string;
}
