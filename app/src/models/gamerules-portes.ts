import { Store } from "@ngrx/store";
import { State } from "../app/reducers";
import { DiceService } from "../services/dice.service";
import { Board } from "./board";
import { GameMode } from "./gamemode";

import { GamerulesBackgammon } from "./gamerules-backgammon";

import { GameResult } from "./gameresult";
import { GameRulesBase } from "./gamerulesbase";
import { Move } from "./move";
import { Player } from "./player";

export class GamerulesPortes extends GamerulesBackgammon {
    constructor(board: Board, player1: Player, player2: Player, dice: DiceService, store: Store<State>) {
        super(board, player1, player2, dice, store);
        this._doublerCubeEnabled = false;
    }
    protected getStartingPlayer(): Player {
        let player1Roll = this.dice.roll();
        let player2Roll = this.dice.roll();
        let equalRoll = true;
        while (equalRoll) {
            player1Roll = this.dice.roll();
            player2Roll = this.dice.roll();
            equalRoll = player1Roll === player2Roll;
        }
        if (player1Roll > player2Roll) {
            this._currentPlayer = this.player1;
        } else {
            this._currentPlayer = this.player2;
        }
        this.addPlayerTurn();
        return this._currentPlayer;
    }
    protected calculatePoints(): number {

        if (this.isGammon()) { return 2; }
        return 1;
    }
}
