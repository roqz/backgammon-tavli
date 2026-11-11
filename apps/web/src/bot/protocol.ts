import type { BotLevel, MatchContext } from "@tavli/ai";
import type { GameState, Move } from "@tavli/engine";

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
  | { readonly kind: "accept-resign"; readonly state: GameState };

export type BotResponse<R extends BotRequest> = R extends { kind: "moves" } ? Move[] : boolean;

export interface BotEnvelope {
  readonly id: number;
  readonly request: BotRequest;
}

export interface BotReply {
  readonly id: number;
  readonly result?: Move[] | boolean;
  readonly error?: string;
}
