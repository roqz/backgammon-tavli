import { Store } from "@ngrx/store";
import { State } from "../app/reducers";
import { DiceService } from "../services/dice.service";
import { Board } from "./board";
import { GameMode } from "./gamemode";
import { GameResult } from "./gameresult";
import { GameRulesBase } from "./gamerulesbase";
import { Move } from "./move";
import { Player } from "./player";

export class GamerulesPlakato extends GameRulesBase {
    constructor(board: Board, player1: Player, player2: Player, dice: DiceService, store: Store<State>) {
        super(board, dice, GameMode.PLAKATO, player1, player2, store);
        this._doublerCubeEnabled = false;
    }
    public start() {
        // wie tavli, andere board init positionen
        throw new Error("Method not implemented.");
    }
    public getAllPossibleMoves(board: Board, player: Player, diceRolls: number[]): Move[] {
        // wie tavli, unterschied: blockierte steine können nicht bewegt werden
        throw new Error("Method not implemented.");
    }
    public makeMove(move: Move, player: Player) {
        // unterschied: kein werfen sondern blockieren
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
    }

    // is game over prüfung ergänzen: wenn der 1 steine blockiert ist und der gegner keinen stein mehr auf der 1 hat immediate loss

}
