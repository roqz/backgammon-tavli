import { Player } from "./player";
import { Board } from "./board";
import { CheckerColor } from "./checker";
import * as _ from "lodash";
import { Field } from "./field";
import { DiceService } from "../services/dice.service";
import { GameMode } from "./gamemode";
import { Move } from "./move";
import { Turn } from "./turn";
import { HistoryMoveEntry } from "./history-move-entry";
import { Store } from "@ngrx/store";
import { State } from "../app/reducers";
import { MakeMoveAction, NextTurnAction } from "../app/board.actions";


export abstract class GameRulesBase {
    protected startWhite = 1;
    protected _currentPlayer: Player;
    protected _openDiceRolls: number[];
    protected _turnHistory: Turn[] = [];
    constructor(protected board: Board, protected dice: DiceService, public gameMode: GameMode,
        protected player1: Player, protected player2: Player, protected store: Store<State>) {

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
    public getFirstFieldNumber(color: CheckerColor): number {
        if (color === CheckerColor.WHITE) {
            return this.startWhite;
        }
        return 25 - this.startWhite;
    }

    public getLastFieldNumber(color: CheckerColor): number {
        const ownStartField = this.getFirstFieldNumber(color);
        return 25 - ownStartField;
    }

    public get history(): Turn[] {
        return _.cloneDeep(this._turnHistory);
    }
    protected addMoveToHistory(move: Move, hitOpponent: boolean) {
        this._turnHistory[this._turnHistory.length - 1].moves.push(new HistoryMoveEntry(move, hitOpponent));
    }
    protected nextPlayerTurn() {
        if (this._currentPlayer === this.player1) {
            this._currentPlayer = this.player2;
        } else {
            this._currentPlayer = this.player1;
        }
        this._openDiceRolls = this.rollDices();
        this.addPlayerTurn();
    }
    protected addPlayerTurn() {
        if (!this._turnHistory) {
            this._turnHistory = [];
        }
        const turn = new Turn(this._currentPlayer, this._openDiceRolls[0], this._openDiceRolls[1], new Array<HistoryMoveEntry>());
        this._turnHistory.push(turn);
        this.store.dispatch(new NextTurnAction({ turn: turn }));
    }

    protected sortBoardFieldsByPlayingDirection(board: Board, player: Player): Field[] {
        const startPos = this.getFirstFieldNumber(player.color);
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
        const lastField = this.getLastFieldNumber(player.color);

        return this.board.getSectorOfField(lastField);
    }
    protected getStartSector(board: Board, player: Player): Field[] {
        const startField = this.getFirstFieldNumber(player.color);
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
