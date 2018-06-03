import { Store } from "@ngrx/store";
import * as _ from "lodash";
import { NextTurnAction, DoubleAction, DoubleAcceptAction, DiceRollAction, GameOverAction } from "../app/board.actions";
import { State } from "../app/reducers";
import { DiceService } from "../services/dice.service";
import { Board } from "./board";
import { CheckerColor } from "./checker";
import { Field } from "./field";
import { GameMode } from "./gamemode";
import { GameResult } from "./gameresult";
import { HistoryMoveEntry } from "./history-move-entry";
import { Move } from "./move";
import { Player } from "./player";
import { Turn } from "./turn";
import { PlayAction } from "./playaction";
import { SetPlayersAction } from "../app/player.actions";


export abstract class GameRulesBase {
    protected startWhite = 1;
    protected _doublerCubeEnabled = true;
    protected _doublerCube = 1;
    protected _doublerCubeLastUsedBy: Player;
    protected _doubleRequestOpen: boolean;
    protected _doubleRequestAccepted = true;
    protected _currentPlayer: Player;
    protected _openDiceRolls: number[];
    protected _turnHistory: Turn[] = [];
    protected _alreadyStarted = false;
    constructor(protected board: Board, protected dice: DiceService, public gameMode: GameMode,
        protected player1: Player, protected player2: Player, protected store: Store<State>) {
        this.store.dispatch(new SetPlayersAction({ player1: this.player1, player2: this.player2 }));
    }
    public abstract async start();
    public abstract getAllPossibleMoves(board: Board, player: Player, diceRolls: number[]): Move[];
    public abstract makeMove(move: Move, player: Player);
    public abstract finishTurn(player: Player);
    public abstract getResult(): GameResult;

    public getBoard(): Board {
        return _.cloneDeep(this.board);
    }
    public getPlayer1(): Player {
        return _.cloneDeep(this.player1);
    }
    public getPlayer2(): Player {
        return _.cloneDeep(this.player2);
    }
    public getPlayer1PipCount(): number {
        return this.getPipCount(this.player1);
    }
    public getPlayer2PipCount(): number {
        return this.getPipCount(this.player2);
    }
    private getPipCount(player: Player): number {
        const sortedBoard = this.sortBoardFieldsByPlayingDirection(this.board, player).reverse();
        let count = 0;
        for (let i = 0; i < sortedBoard.length; i++) {
            const checkers = _.filter(sortedBoard[i].checkers, c => c.color === player.color);
            count += checkers.length * (i + 1);
        }
        return count;
    }
    public get currentPlayer(): Player {
        return this._currentPlayer;
    }
    public get currentTurn(): Turn {
        if (!this._turnHistory) { return null; }
        return this._turnHistory[this._turnHistory.length - 1];
    }

    public get doublerCube(): number {
        return this._doublerCube;
    }
    public get doublerCubeEnabled(): boolean {
        return this._doublerCubeEnabled;
    }
    public rollDices() {
        if (this.currentTurn.roll1) { return; }

        this._openDiceRolls = this.rollDicesInternal();
        this.currentTurn.roll1 = this._openDiceRolls[0];
        this.currentTurn.roll2 = this._openDiceRolls[1];
        this.store.dispatch(new DiceRollAction({ turn: _.cloneDeep(this.currentTurn), rolls: _.cloneDeep(this._openDiceRolls) }));
    }
    public canPlayerDouble(player: Player): boolean {
        if (this.isGameOver()) { return false; }
        if (!this.doublerCubeEnabled) { return false; }
        if (player.color !== this._currentPlayer.color) {
            return false;
        }
        if (this._doubleRequestOpen) { return false; }
        // wenn noch keiner verdoppelt hat können beide
        if (this._doublerCube === 1) {
            return true;
        }
        // ansonsten nur wenn zuletzt der Gegner verdoppelt hat
        if (this._doublerCubeLastUsedBy && this._doublerCubeLastUsedBy.color !== player.color) {
            return true;
        }
        return false;
    }

    public double(player: Player) {
        if (!this.canPlayerDouble(player)) { return; }
        this._doublerCube = this._doublerCube * 2;
        this.currentTurn.doubleToRequest = this.doublerCube;
        this._doublerCubeLastUsedBy = player;
        this._doubleRequestOpen = true;
        this.store.dispatch(
            new DoubleAction({ doubleTo: this.doublerCube, board: _.cloneDeep(this.board), turn: _.cloneDeep(this.currentTurn) }));
        this.nextPlayerTurn(PlayAction.DOUBLE);


    }
    public respondToDouble(player: Player, accept: boolean) {
        if (this.currentPlayer.color !== player.color) { return; }
        if (!this._doubleRequestOpen) { return; }
        this.currentTurn.roll1 = null;
        this.currentTurn.roll2 = null;
        this.currentTurn.doubleToRequestAccept = accept;
        this._doubleRequestOpen = false;
        if (!accept) {
            // spiel zuende requestor hat gewonnen;, cube zurücksetzen
            this._doublerCube = this._doublerCube / 2;
            this._doubleRequestAccepted = false;
        } else {
            this.nextPlayerTurn(PlayAction.PLAY);
        }
        this.store.dispatch(
            new DoubleAcceptAction({
                accept: accept,
                doubleTo: this._doublerCube, board: _.cloneDeep(this.board), turn: _.cloneDeep(this.currentTurn)
            }));
    }

    public get openRolls(): number[] {
        return this._openDiceRolls;
    }

    public get history(): Turn[] {
        return _.cloneDeep(this._turnHistory);
    }
    public isGameOver() {
        const offCheckers = _.filter(this.board.off.checkers, c => c.color === this._currentPlayer.color);
        if (offCheckers.length === 15) {
            this.store.dispatch(new GameOverAction({ gameOver: true }));
            return true;
        }
        if (!this._doubleRequestAccepted) {
            this.store.dispatch(new GameOverAction({ gameOver: true }));
            return true;
        }
        return false;
    }

    protected addMoveToHistory(move: Move, hitOpponent: boolean) {
        this._turnHistory[this._turnHistory.length - 1].moves.push(new HistoryMoveEntry(move, hitOpponent));
    }
    protected nextPlayerTurn(action: PlayAction) {
        this.switchCurrentPlayer();
        this.addPlayerTurn();
        if (action === PlayAction.PLAY) {
            this._currentPlayer.play(_.cloneDeep(this.board), this);
        } else if (action === PlayAction.DOUBLE) {
            this._currentPlayer.respondToDouble(_.cloneDeep(this.board), this, this.doublerCube);
        }

    }
    private switchCurrentPlayer() {
        if (this._currentPlayer === this.player1) {
            this._currentPlayer = this.player2;
        } else {
            this._currentPlayer = this.player1;
        }
    }

    protected addPlayerTurn(roll1 = null, roll2 = null) {
        if (!this._turnHistory) {
            this._turnHistory = [];
        }
        const turn = new Turn(this._currentPlayer, roll1, roll2, new Array<HistoryMoveEntry>());
        this.store.dispatch(new NextTurnAction({ turn: turn, history: _.cloneDeep(this._turnHistory) }));
        this._turnHistory.push(turn);
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
    protected getHomeSector(board: Board, player: Player): Field[] {
        const lastField = this.getLastFieldNumber(player.color);

        return this.board.getSectorOfField(lastField);
    }
    protected getStartSector(board: Board, player: Player): Field[] {
        const startField = this.getFirstFieldNumber(player.color);
        return this.board.getSectorOfField(startField);
    }

    private rollDicesInternal() {
        const dice1 = this.dice.roll();
        const dice2 = this.dice.roll();
        if (dice1 === dice2) {
            return [dice1, dice1, dice1, dice1];
        }
        return [dice1, dice2];
    }

}
