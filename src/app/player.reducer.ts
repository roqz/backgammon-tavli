import { Action } from "@ngrx/store";
import { BoardActions, BoardActionTypes, GetBoardAction } from "./board.actions";
import { Board } from "../models/board";
import { Move } from "../models/move";
import { Turn } from "../models/turn";
import { Player } from "../models/player";
import { PlayerActionTypes, PlayerActions } from "./player.actions";

export interface PlayerState {
    player1: Player;
    player2: Player;
    action: PlayerActionTypes;
}

export const initialState: PlayerState = {
    player1: null,
    player2: null,
    action: null
};

export function playerdReducer(state = initialState, action: PlayerActions): PlayerState {
    switch (action.type) {

        case PlayerActionTypes.SetPlayers:
            return { ...state, action: action.type, ...action.payload };
        default:
            return state;
    }
}
