import { Action } from "@ngrx/store";
import { BoardActions, BoardActionTypes, GetBoardAction } from "./board.actions";
import { Board } from "../models/board";
import { Move } from "../models/move";
import { Turn } from "../models/turn";

export interface BoardState {
  board: Board;
  move: Move;
  turn: Turn;
}

export const initialState: BoardState = {
  board: null,
  move: null,
  turn: null
};

export function reducer(state = initialState, action: BoardActions): BoardState {
  switch (action.type) {

    case BoardActionTypes.GetBoard:
      return { ...state, move: null };
    case BoardActionTypes.SetBoard:
      return { ...state, move: null, ...action.payload };
    case BoardActionTypes.MakeMove:
      return { ...state, turn: null, ...action.payload };
    case BoardActionTypes.NextTurn:
      return { ...state, board: null, move: null, ...action.payload };
    default:
      return state;
  }
}
