import { GameRulesBase } from "./gamerulesbase";
import { Board } from "./board";
import { Player } from "./player";
import { Move } from "./move";
import { GameResult } from "./gameresult";
import { DiceService } from "../services/dice.service";
import { GameMode } from "./gamemode";
import { Store } from "@ngrx/store";
import { State } from "../app/reducers";

export class GamerulesPlakato extends GameRulesBase {
    constructor(board: Board, player1: Player, player2: Player, dice: DiceService, store: Store<State>) {
        super(board, dice, GameMode.PLAKATO, player1, player2, store);
        this._doublerCubeEnabled = false;
    }
    public start() {
        throw new Error("Method not implemented.");
    }
    public getAllPossibleMoves(board: Board, player: Player, diceRolls: number[]): Move[] {
        throw new Error("Method not implemented.");
    }
    public makeMove(move: Move, player: Player) {
        throw new Error("Method not implemented.");
    }
    public revertLastMove() {
        throw new Error("Method not implemented.");
    }
    public finishTurn(player: Player) {
        throw new Error("Method not implemented.");
    }
    public getResult(): GameResult {
        throw new Error("Method not implemented.");
    }

}
