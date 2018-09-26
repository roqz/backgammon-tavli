import { Store } from "@ngrx/store";
import * as _ from "lodash";
import {
    NextTurnAction, DoubleAction, DoubleAcceptAction,
    DiceRollAction, GameOverAction, SetBoardAction, OpenDiceRollUpdateAction, MakeMoveAction, RevertMoveAction
} from "../app/board.actions";
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
import { Helper } from "../helper/helper";


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
    protected _storeBackupBeforeMove: State[] = [];
    constructor(protected board: Board, protected dice: DiceService, public gameMode: GameMode,
        protected player1: Player, protected player2: Player, protected store: Store<State>) {
        this.store.dispatch(new SetPlayersAction({ player1: this.player1, player2: this.player2 }));
    }
    public async start() {
        if (this._alreadyStarted) { return; }

        this.store.dispatch(new SetBoardAction({
            board: _.cloneDeep(this.board)
        }));
        this._alreadyStarted = true;
        await Helper.timeout(1000);
        this._currentPlayer.play(_.cloneDeep(this.board), this);
    }
    public abstract getAllPossibleMoves(board: Board, player: Player, diceRolls: number[]): Move[];
    protected abstract executeMove(move: Move, board: Board, testMove: boolean);
    protected abstract calculatePoints();
    public getResult(): GameResult {
        if (!this.isGameOver()) { return null; }
        const result = new GameResult();
        result.player1 = this.getPlayer1();
        result.player2 = this.getPlayer2();
        result.winner = this.currentPlayer;

        result.history = this.history;
        result.points = this.calculatePoints();
        return result;
    }

    public makeMove(move: Move, player: Player) {
        if (player.color !== this._currentPlayer.color) {
            return;
        }
        if (this._doubleRequestOpen) { return; }
        const possibleMoves = this.getAllPossibleMoves(this.board, this._currentPlayer, this._openDiceRolls);
        if (_.find(possibleMoves, m => m.from === move.from && m.to === move.to)) {
            this._storeBackupBeforeMove.push(_.cloneDeep(this.getState(this.store)));
            this.executeMove(move, this.board, false);
            this.removeDiceRollFromOpenRolls(move.roll);
            this.addMoveToHistory(move, false);
            this.store.dispatch(
                new OpenDiceRollUpdateAction({ rolls: _.cloneDeep(this._openDiceRolls) }));

            this.store.dispatch(new MakeMoveAction({ move: move, board: _.cloneDeep(this.board), turn: _.cloneDeep(this.currentTurn) }));
        } else {
            this.checkIfMustSwitchPlayersOrGameOver();
            console.log("wanted to make move but move not found ?! Color:" + player.colorString + ",From:" +
                move.from + ",To:" + move.to + ",Roll:" + move.roll);
        }
    }
    public revertLastMove() {
        if (!this._storeBackupBeforeMove || this._storeBackupBeforeMove.length === 0) { return; }
        const lastMoveBackup = this._storeBackupBeforeMove.pop();
        this.board = lastMoveBackup.board.board;
        this._turnHistory[this._turnHistory.length - 1].moves.pop();
        this._openDiceRolls = lastMoveBackup.board.rolls;
        this.store.dispatch(new RevertMoveAction({ state: _.cloneDeep(lastMoveBackup.board) }));
    }
    public finishTurn(player: Player) {
        const possibleMoves = this.getAllPossibleMoves(this.board, this._currentPlayer, this._openDiceRolls);
        if (possibleMoves && possibleMoves.length > 0) {

        } else {

        }
        this.checkIfMustSwitchPlayersOrGameOver();
    }

    public getBoard(): Board {
        return _.cloneDeep(this.board);
    }
    public getPlayer1(): Player {
        return _.cloneDeep(this.player1);
    }
    public getPlayer2(): Player {
        return _.cloneDeep(this.player2);
    }
    public getPipCount(player: Player, board: Board): number {
        const sortedBoard = this.sortBoardFieldsByPlayingDirection(board, player).reverse();
        let count = 0;
        for (let i = 0; i < sortedBoard.length; i++) {
            const checkers = _.filter(sortedBoard[i].checkers, c => c.color === player.color);
            count += checkers.length * (i + 1);
        }
        const barCheckers = _.filter(board.bar.checkers, c => c.color === player.color);
        if (barCheckers.length > 0) {
            count += barCheckers.length * 25;
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
            return true;
        }
        if (!this._doubleRequestAccepted) {
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

    protected getStartingPlayer(startDiceRollsRemain: boolean = false): Player {
        let player1Roll = this.dice.roll();
        let player2Roll = this.dice.roll();
        let equalRoll = true;
        while (equalRoll) {
            player1Roll = this.dice.roll();
            player2Roll = this.dice.roll();
            equalRoll = player1Roll === player2Roll;
        }
        if (player1Roll > player2Roll) {
            this._currentPlayer = this.player1;
        } else {
            this._currentPlayer = this.player2;
        }
        if (startDiceRollsRemain) {
            this._openDiceRolls = [player1Roll, player2Roll];
            this.store.dispatch(new OpenDiceRollUpdateAction({ rolls: this._openDiceRolls }));
            this.addPlayerTurn(this._openDiceRolls[0], this._openDiceRolls[1]);
        } else {
            this.addPlayerTurn();
        }
        return this._currentPlayer;
    }
    protected removeDiceRollFromOpenRolls(roll: number) {
        const executedRoll = this._openDiceRolls.indexOf(roll);
        if (executedRoll === -1) {
            throw new Error("mit dem würfel is was hin, roll: " + roll);
        }
        this._openDiceRolls.splice(executedRoll, 1);
    }
    protected checkIfMustSwitchPlayersOrGameOver() {
        if (!this.isAnyMovePossible()) {
            this._storeBackupBeforeMove = [];
            if (!this.isGameOver()) {
                this.nextPlayerTurn(PlayAction.PLAY);
            } else {
                this.store.dispatch(new GameOverAction({ gameOver: true }));
                console.log("game over! winner: " + this._currentPlayer.colorString);
                console.log(this.board);
            }
        }
    }

    protected isAnyMovePossible(): boolean {
        if (this._openDiceRolls.length === 0) {
            return false;
        }
        const possibleMovesLength = this.getAllPossibleMoves(this.board, this._currentPlayer, this._openDiceRolls).length;
        if (possibleMovesLength === 0) {
            console.log("zero moves possible");
        }
        return possibleMovesLength > 0;
    }
    protected ifOnlyOneOfTwoMovesCanBeMadeRemoveLowerRollMove(moves: Move[], board: Board) {
        // züge aussortieren, die den zweiten zug unmöglich machen würden
        if (moves.length !== 2) { return; }
        const move1 = moves[0];
        const move2 = moves[1];
        const high = move1.roll > move2.roll ? move1 : move2;
        const low = move1.roll > move2.roll ? move2 : move1;
        let highThenLowPossible = true;
        let lowThenHighPossible = true;
        if (move1.roll === move2.roll) { return; }

        let boardCopy = _.cloneDeep(board);
        this.executeMove(high, boardCopy, true);
        let possibleMovesAfterFirst = this.getAllPossibleMoves(boardCopy, this.currentPlayer, [low.roll]);
        if (possibleMovesAfterFirst.length === 0) {
            // high possible then low not
            highThenLowPossible = false;
        }

        boardCopy = _.cloneDeep(board);
        this.executeMove(low, boardCopy, true);
        possibleMovesAfterFirst = this.getAllPossibleMoves(boardCopy, this.currentPlayer, [high.roll]);
        if (possibleMovesAfterFirst.length === 0) {
            // low possible then high not
            lowThenHighPossible = false;
        }

        if (!highThenLowPossible && !lowThenHighPossible) {
            // nur high spielen
            _.remove(moves, m => m === low);
        } else if (highThenLowPossible && !lowThenHighPossible) {
            // nur high spielen
            _.remove(moves, m => m === low);
        } else if (!highThenLowPossible && lowThenHighPossible) {
            // nur low spielen
            _.remove(moves, m => m === high);
        }
    }

    protected removeMovesToOffWithHigherRollThanNeccessaryIfOtherLegalMovePossible(movesToReturn: Move[], board: Board) {
        // raus ziehen nur erlaubt wenn direkt auf das off field rausgezogen werden kann
        // oder wenn kein anderer stein mehr im endfeld ist, der auf einem feld ist höher als der roll
        const outMovesWithHigherRolls = _.filter(movesToReturn, m => m.to === Board.offNumber &&
            (((m.from < 6 && (m.roll > m.from))) ||
                (m.from > 19 && (m.roll > 25 - m.from))));

        outMovesWithHigherRolls.forEach(outMove => {
            const sortedBoard = this.sortBoardFieldsByPlayingDirection(board, this.currentPlayer);
            const outMoveFieldIndex = sortedBoard.indexOf(board.getFieldByNumber(outMove.from));
            const fieldsBetweenMoveFieldAndRoll = [];
            for (let i = 17; i < outMoveFieldIndex; i++) {
                if (_.find(sortedBoard[i].checkers, c => c.color === this.currentPlayer.color)) {
                    _.remove(movesToReturn, m => m === outMove);
                }
            }
        });
    }

    protected getState(store: Store<State>): State {
        let state: State;
        store.subscribe(s => state = s);
        return state;
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
