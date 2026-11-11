import { GameRulesBase } from "./gamerulesbase";
import { Board } from "./board";
import { Player } from "./player";
import { Move } from "./move";
import { GameResult } from "./gameresult";
import { GamerulesBackgammon } from "./gamerules-backgammon";
import { DiceService } from "../services/dice.service";
import { Store } from "@ngrx/store";
import { State } from "../app/reducers";

export class GamerulesFevga extends GamerulesBackgammon {
    constructor(board: Board, player1: Player, player2: Player, dice: DiceService, store: Store<State>) {
        super(board, player1, player2, dice, store);
        this._doublerCubeEnabled = false;
    }
    protected calculatePoints(): number {

        if (this.isGammon()) { return 2; }
        return 1;
    }
}
