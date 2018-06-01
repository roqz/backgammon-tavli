import { Action } from "@ngrx/store";
import { BoardActions, BoardActionTypes, GetBoardAction } from "./board.actions";
import { Board } from "../models/board";
import { Move } from "../models/move";
import { Turn } from "../models/turn";

export interface BoardState {
  board: Board;
  move: Move;
  turn: Turn;
  rolls: number[];
  gameOver: boolean;
  action: BoardActionTypes;
}

export const initialState: BoardState = {
  board: null,
  move: null,
  turn: null,
  rolls: [],
  gameOver: false,
  action: null
};

export function reducer(state = initialState, action: BoardActions): BoardState {
  switch (action.type) {

    case BoardActionTypes.GetBoard:
      return { ...state, move: null, action: action.type };
    case BoardActionTypes.SetBoard:
      return { ...state, move: null, action: action.type, ...action.payload };
    case BoardActionTypes.MakeMove:
      return { ...state, turn: null, action: action.type, ...action.payload };
    case BoardActionTypes.NextTurn:
      return { ...state, board: null, move: null, action: action.type, ...action.payload };
    case BoardActionTypes.DiceRoll:
      return { ...state, move: null, action: action.type, ...action.payload };
    case BoardActionTypes.GameOver:
      return { ...state, move: null, action: action.type, ...action.payload };
    case BoardActionTypes.Double:
    case BoardActionTypes.DoubleAccept:
    default:
      return state;
  }
}
