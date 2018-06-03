import {
  ActionReducer,
  ActionReducerMap,
  createFeatureSelector,
  createSelector,
  MetaReducer
} from "@ngrx/store";
import { environment } from "../../environments/environment";
import { Board } from "../../models/board";
import { BoardState, boardReducer } from "../board.reducer";
import { PlayerState, playerdReducer } from "../player.reducer";

export interface State {
  board: BoardState;
  players: PlayerState;
}

export const reducers: ActionReducerMap<State> = {
  board: boardReducer,
  players: playerdReducer
};


export const metaReducers: MetaReducer<State>[] = !environment.production ? [] : [];
