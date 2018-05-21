import {
  ActionReducer,
  ActionReducerMap,
  createFeatureSelector,
  createSelector,
  MetaReducer
} from "@ngrx/store";
import { environment } from "../../environments/environment";
import { Board } from "../../models/board";
import { BoardState, reducer } from "../board.reducer";

export interface State {
  board: BoardState;
}

export const reducers: ActionReducerMap<State> = {
  board: reducer
};


export const metaReducers: MetaReducer<State>[] = !environment.production ? [] : [];
