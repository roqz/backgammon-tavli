import { Action } from "@ngrx/store";
import { Board } from "../models/board";
import { Move } from "../models/move";
import { Turn } from "../models/turn";
import { Player } from "../models/player";

export enum PlayerActionTypes {
    SetPlayers = "[Player] Set Players",
}

export class SetPlayersAction implements Action {
    readonly type = PlayerActionTypes.SetPlayers;
    constructor(public payload: { player1: Player, player2: Player }) { }
}

export type PlayerActions =
    SetPlayersAction;

