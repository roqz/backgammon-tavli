import { Player } from "./player";
import { Board } from "./board";
import { CheckerColor } from "./checker";
import * as _ from "lodash";
import { Field } from "./field";
import { DiceService } from "../services/dice.service";
import { GameMode } from "./gamemode";
import { Move } from "./move";


export abstract class GameRulesBase {
    protected startWhite = 1;
    protected _currentPlayer: Player;
    protected _openDiceRolls: number[];
    constructor(protected board: Board, protected dice: DiceService, public gameMode: GameMode) {

    }
    public abstract getAllPossibleMoves(board: Board, player: Player, diceRolls: number[]): Move[];
    public abstract makeMove(move: Move, player: Player);

    public getBoard(): Board {
        return _.cloneDeep(this.board);
    }
    public get currentPlayer(): Player {
        return this._currentPlayer;
    }
    public get openRolls(): number[] {
        return this._openDiceRolls;
    }
    public getFirstFieldNumber(player: Player): number {
        if (player.color === CheckerColor.WHITE) {
            return this.startWhite;
        }
        return 25 - this.startWhite;
    }

    public getLastFieldNumber(player: Player): number {
        const ownStartField = this.getFirstFieldNumber(player);
        return 25 - ownStartField;
    }

    protected sortBoardFieldsByPlayingDirection(board: Board, player: Player): Field[] {
        const startPos = this.getFirstFieldNumber(player);
        if (startPos === 1) {
            return _.orderBy(board.fields, f => f.number);
        }
        if (startPos === 24) {
            return _.orderBy(board.fields, f => f.number, "desc");
        }
        const firstPart = board.fields.slice(0, 12);
        const secondPart = board.fields.slice(12, 24);
        if (startPos === 12) {
            return _.concat(
                _.orderBy(firstPart, f => f.number, "desc"),
                _.orderBy(secondPart, f => f.number, "desc")
            );
        }
        if (startPos === 13) {
            return _.concat(
                _.orderBy(secondPart, f => f.number, "asc"),
                _.orderBy(firstPart, f => f.number, "asc")
            );
        }
    }
    protected getHomeSector(board: Board, player: Player): Field[] {
        const lastField = this.getLastFieldNumber(player);

        return this.board.getSectorOfField(lastField);
    }
    protected getStartSector(board: Board, player: Player): Field[] {
        const startField = this.getFirstFieldNumber(player);
        return this.board.getSectorOfField(startField);
    }
    protected rollDices(): number[] {
        const dice1 = this.dice.roll();
        const dice2 = this.dice.roll();
        if (dice1 === dice2) {
            return [dice1, dice1, dice1, dice1];
        }
        return [dice1, dice2];
    }
    protected isGameOver() {
        const offCheckers = _.filter(this.board.off.checkers, c => c.color === this._currentPlayer.color);
        console.log("off checkers: " + offCheckers.length + ", color: " + this._currentPlayer.colorString);
        if (offCheckers.length === 15) {
            return true;
        }
        return false;
    }
}
