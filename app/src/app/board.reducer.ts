import { Action } from "@ngrx/store";
import { BoardActions, BoardActionTypes, GetBoardAction } from "./board.actions";
import { Board } from "../models/board";
import { Move } from "../models/move";
import { Turn } from "../models/turn";

export interface BoardState {
  board: Board;
  gameOver: boolean;
  doublerCube: number;
  history: Turn[];
  // move und turn eigentlich kein state?
  move: Move;
  turn: Turn;
  rolls: number[];
  action: BoardActionTypes;
}

export const initialState: BoardState = {
  board: null,
  doublerCube: 1,
  move: null,
  turn: null,
  history: null,
  rolls: [],
  gameOver: false,
  action: null
};

export function boardReducer(state = initialState, action: BoardActions): BoardState {
  switch (action.type) {

    case BoardActionTypes.GetBoard:
      return { ...state, action: action.type };
    case BoardActionTypes.SetBoard:
      return { ...state, action: action.type, ...action.payload };
    case BoardActionTypes.MakeMove:
      return { ...state, action: action.type, ...action.payload };
    case BoardActionTypes.RevertMove:
      const res = action.payload.state;
      res.action = BoardActionTypes.RevertMove;
      return res;
    case BoardActionTypes.NextTurn:
      return { ...state, move: null, action: action.type, ...action.payload };
    case BoardActionTypes.DiceRoll:
      return { ...state, action: action.type, ...action.payload };
    case BoardActionTypes.OpenDiceRollUpdate:
      return { ...state, action: action.type, ...action.payload };
    case BoardActionTypes.GameOver:
      return { ...state, action: action.type, ...action.payload };
    case BoardActionTypes.DoubleAccept:
      return {
        ...state, action: action.type,
        doublerCube: action.payload.accept ? action.payload.doubleTo : state.doublerCube
      };
    case BoardActionTypes.Double:
    default:
      return state;
  }
}
