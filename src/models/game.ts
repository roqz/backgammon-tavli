import { Board } from "./board";
import { GameRulesBase } from "./gamerulesbase";

export class Game {
    constructor(
        private _rules: GameRulesBase
    ) {


    }
    public get rules(): GameRulesBase {
        return this._rules;
    }

    // public get player1(): Player {
    //     return this._rules.player1;
    // }
    // public get player2(): Player {
    //     return this._rules.player2;
    // }
    public get board(): Board {
        return this._rules.getBoard();
    }
}
