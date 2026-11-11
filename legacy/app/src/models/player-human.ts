import { Player } from "./player";
import { Board } from "./board";
import { GameRulesBase } from "./gamerulesbase";
import { Helper } from "../helper/helper";

export class PlayerHuman extends Player {
    public async play(board: Board, gameRules: GameRulesBase) {
        // gameRules.rollDices();
        // let rolls = gameRules.openRolls;
        // let possible = gameRules.getAllPossibleMoves(gameRules.getBoard(), this, rolls);
        // gameRules.makeMove(possible[0], this);
        //     rolls = gameRules.openRolls;
        //     possible = gameRules.getAllPossibleMoves(gameRules.getBoard(), this, rolls);

    }
    public async respondToDouble(board: Board, gameRules: GameRulesBase, doubleTo: number) {

    }

}
