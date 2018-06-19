import { Store } from "@ngrx/store";
import { State } from "../app/reducers";
import { DiceService } from "../services/dice.service";
import { Board } from "./board";
import { GameMode } from "./gamemode";
<<<<<<< HEAD
import { GamerulesBackgammon } from "./gamerules-backgammon";
=======
import { GameResult } from "./gameresult";
import { GameRulesBase } from "./gamerulesbase";
import { Move } from "./move";
import { Player } from "./player";
>>>>>>> e8b837653c0930a9a951c1d717e677c8ca3105ac

export class GamerulesPortes extends GamerulesBackgammon {
    constructor(board: Board, player1: Player, player2: Player, dice: DiceService, store: Store<State>) {
        super(board, player1, player2, dice, store);
        this._doublerCubeEnabled = false;
    }
<<<<<<< HEAD
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
=======
    public start() {
        // andere start positionen
        throw new Error("Method not implemented.");
    }
    public getAllPossibleMoves(board: Board, player: Player, diceRolls: number[]): Move[] {
        // es kann immer nur ein stein auf einem feld sein
        // beide gehen in gleiche richtung
        throw new Error("Method not implemented.");
    }
    public makeMove(move: Move, player: Player) {
        // kein werfen, nur ein stein pro feld
        throw new Error("Method not implemented.");
    }
    public revertLastMove() {
        // wie tavli
        throw new Error("Method not implemented.");
    }
    public finishTurn(player: Player) {
        // wie tavli
        throw new Error("Method not implemented.");
    }
    public getResult(): GameResult {
        // wie tavli
        throw new Error("Method not implemented.");
>>>>>>> e8b837653c0930a9a951c1d717e677c8ca3105ac
    }
    protected calculatePoints(): number {

        if (this.isGammon()) { return 2; }
        return 1;
    }
}
