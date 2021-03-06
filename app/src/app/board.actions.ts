import { Action } from "@ngrx/store";
import { Board } from "../models/board";
import { Move } from "../models/move";
import { Turn } from "../models/turn";
import { State } from "./reducers";
import { BoardState } from "./board.reducer";

export enum BoardActionTypes {
  GetBoard = "[Board] Get Board",
  SetBoard = "[Board] Set Board",
  MakeMove = "[Board] Make Move",
  RevertMove = "[Board] Revert Move",
  NextTurn = "[Board] Next Turn",
  Double = "[Board] Double",
  DoubleAccept = "[Board] Double Accept",
  DiceRoll = "[Board] DiceRoll",
  OpenDiceRollUpdate = "[Board] Open Dice Roll Update",
  GameOver = "[Board] GameOver"
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
  constructor(public payload: { board: Board, move: Move, turn: Turn }) { }
}

export class RevertMoveAction implements Action {
  readonly type = BoardActionTypes.RevertMove;
  constructor(public payload: { state: BoardState }) { }
}

export class DoubleAction implements Action {
  readonly type = BoardActionTypes.Double;
  constructor(public payload: { doubleTo: number, board: Board, turn: Turn }) { }
}
export class DoubleAcceptAction implements Action {
  readonly type = BoardActionTypes.DoubleAccept;
  constructor(public payload: { accept: boolean, doubleTo: number, board: Board, turn: Turn }) { }
}
export class NextTurnAction implements Action {
  readonly type = BoardActionTypes.NextTurn;
  constructor(public payload: { turn: Turn, history: Turn[] }) { }
}
export class DiceRollAction implements Action {
  readonly type = BoardActionTypes.DiceRoll;
  constructor(public payload: { turn: Turn, rolls: number[] }) { }
}

export class OpenDiceRollUpdateAction implements Action {
  readonly type = BoardActionTypes.OpenDiceRollUpdate;
  constructor(public payload: { rolls: number[] }) { }
}

export class GameOverAction implements Action {
  readonly type = BoardActionTypes.GameOver;
  constructor(public payload: { gameOver: boolean }) { }
}

export type BoardActions =
  GetBoardAction |
  SetBoardAction |
  MakeMoveAction |
  RevertMoveAction |
  NextTurnAction |
  DoubleAction |
  DoubleAcceptAction |
  DiceRollAction |
  OpenDiceRollUpdateAction |
  GameOverAction;

