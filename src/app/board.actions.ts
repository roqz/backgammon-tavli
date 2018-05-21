import { Action } from "@ngrx/store";
import { Board } from "../models/board";
import { Move } from "../models/move";
import { Turn } from "../models/turn";

export enum BoardActionTypes {
  GetBoard = "[Board] Get Board",
  SetBoard = "[Board] Set Board",
  MakeMove = "[Board] Make Move",
  NextTurn = "[Board] Next Turn"
}

export class GetBoardAction implements Action {
  readonly type = BoardActionTypes.GetBoard;
  constructor(public payload: {}) { }
}
export class SetBoardAction implements Action {
  readonly type = BoardActionTypes.SetBoard;
  constructor(public payload: { board: Board }) { }
}
export class MakeMoveAction implements Action {
  readonly type = BoardActionTypes.MakeMove;
  constructor(public payload: { board: Board, move: Move }) { }
}

export class NextTurnAction implements Action {
  readonly type = BoardActionTypes.NextTurn;
  constructor(public payload: { turn: Turn }) { }
}

export type BoardActions = GetBoardAction | SetBoardAction | MakeMoveAction | NextTurnAction;

