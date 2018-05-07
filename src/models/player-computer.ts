import { Player } from "./player";
import { GameRulesBase } from "./gamerulesbase";
import { Board } from "./board";
import { Helper } from "../helper/helper";

export class PlayerComputer extends Player {

    public async play(board: Board, gameRules: GameRulesBase) {
        let rolls = gameRules.openRolls;
        let possible = gameRules.getAllPossibleMoves(gameRules.getBoard(), this, rolls);
        let count = 0;
        while (rolls.length > 0 && possible.length > 0) {
            await Helper.timeout(200);
            gameRules.makeMove(possible[0], this);
            rolls = gameRules.openRolls;
            possible = gameRules.getAllPossibleMoves(gameRules.getBoard(), this, rolls);
            count++;
            if (count > 10) {
                throw new Error("oha da geht nix, rolls: " + rolls.length + ", possible moves: " + possible.length);
            }
        }

    }
}
