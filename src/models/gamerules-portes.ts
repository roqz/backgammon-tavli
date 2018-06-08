import { Store } from "@ngrx/store";
import { State } from "../app/reducers";
import { DiceService } from "../services/dice.service";
import { Board } from "./board";
import { GameMode } from "./gamemode";
import { GameResult } from "./gameresult";
import { GameRulesBase } from "./gamerulesbase";
import { Move } from "./move";
import { Player } from "./player";

export class GamerulesPortes extends GameRulesBase {
    constructor(board: Board, player1: Player, player2: Player, dice: DiceService, store: Store<State>) {
        super(board, dice, GameMode.PORTES, player1, player2, store);
        this._doublerCubeEnabled = false;
    }
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
    }

}
