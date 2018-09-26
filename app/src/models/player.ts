import { CheckerColor, Checker } from "./checker";
import { Board } from "./board";
import { Move } from "./move";
import { Helper } from "../helper/helper";
import { GameRulesBase } from "./gamerulesbase";

export abstract class Player {

    public readonly name: string;
    public readonly color: CheckerColor;
    public readonly checkers: Checker[];

    constructor(name: string, color: CheckerColor) {
        this.name = name;
        this.color = color;
        this.checkers = this.getCheckers();
    }

    public abstract async play(board: Board, gameRules: GameRulesBase);
    public abstract async respondToDouble(board: Board, gameRules: GameRulesBase, doubleTo: number);
    private getCheckers(): Checker[] {
        const checkers = [];
        for (let i = 0; i < 15; i++) {
            checkers.push(new Checker(this.color, i));
        }
        return checkers;
    }

    public get colorString(): string {
        return this.color === CheckerColor.BLACK ? "black" : "white";
    }


    public getOpponentColor(): CheckerColor {
        if (this.color === CheckerColor.BLACK) {
            return CheckerColor.WHITE;
        }
        return CheckerColor.BLACK;
    }
}

