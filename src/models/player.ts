import { CheckerColor, Checker } from "./checker";
import { Board } from "./board";

import { Move } from "./move";
import { Gamerules } from "./gamerules";

export class Player {
    public readonly name: string;
    public readonly color: CheckerColor;
    public readonly checkers: Checker[];

    constructor(name: string, color: CheckerColor) {
        this.name = name;
        this.color = color;
        this.checkers = this.getCheckers();
    }

    private getCheckers(): Checker[] {
        const checkers = [];
        for (let i = 0; i < 15; i++) {
            checkers.push(new Checker(this.color));
        }
        return checkers;
    }

    public get colorString(): string {
        return this.color === CheckerColor.BLACK ? "black" : "white";
    }

    public async play(board: Board, gameRules: Gamerules, startDices: number[] = null) {
        let rolls = gameRules.getOpenRollsOrRoll(this);
        let possible = gameRules.getAllPossibleMoves(gameRules.getBoard(), this, rolls);
        let count = 0;
        while (rolls.length > 0 && possible.length > 0) {
            await this.timeout(200);
            gameRules.makeMove(possible[0], this);
            rolls = gameRules.getOpenRollsOrRoll(this);
            possible = gameRules.getAllPossibleMoves(gameRules.getBoard(), this, rolls);
            count++;
            if (count > 10) {
                throw new Error("oha da geht nix, rolls: " + rolls.length + ", possible moves: " + possible.length);
            }
        }

    }
    private timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

