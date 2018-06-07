import { Store } from "@ngrx/store";
import * as _ from "lodash";
import { MakeMoveAction, OpenDiceRollUpdateAction, RevertMoveAction, SetBoardAction, GameOverAction } from "../app/board.actions";
import { State } from "../app/reducers";
import { Helper } from "../helper/helper";
import { DiceService } from "../services/dice.service";
import { Board } from "./board";
import { CheckerColor } from "./checker";
import { Field } from "./field";
import { GameMode } from "./gamemode";
import { GameResult } from "./gameresult";
import { GameRulesBase } from "./gamerulesbase";
import { Move } from "./move";
import { PlayAction } from "./playaction";
import { Player } from "./player";

export class GamerulesBackgammon extends GameRulesBase {
    private _storeBackupBeforeMove: State[] = [];
    constructor(board: Board, player1: Player, player2: Player, dice: DiceService, store: Store<State>) {
        super(board, dice, GameMode.BACKGAMMON, player1, player2, store);
        this.initBoardPositions(this.board, player1, player2);
        this._currentPlayer = this.getStartingPlayer();
    }

    public getAllPossibleMoves(board: Board, player: Player, diceRolls: number[]): Move[] {
        if (player.color !== this._currentPlayer.color) {
            return [];
        }
        const ownCheckersOnBar = _.filter(board.bar.checkers, c => c.color === player.color);
        if (ownCheckersOnBar.length > 0) {
            return this.getPossibleBarMoves(board, player, diceRolls);
        }
        return this.getPossibleFieldMoves(board, player, diceRolls);
    }

    public makeMove(move: Move, player: Player) {
        if (player.color !== this._currentPlayer.color) {
            return;
        }
        if (this._doubleRequestOpen) { return; }
        const possibleMoves = this.getAllPossibleMoves(this.board, this._currentPlayer, this._openDiceRolls);
        if (_.find(possibleMoves, m => m.from === move.from && m.to === move.to)) {
            this._storeBackupBeforeMove.push(_.cloneDeep(this.getState(this.store)));
            this.executeMove(move, this.board);
            this.store.dispatch(new MakeMoveAction({ move: move, board: _.cloneDeep(this.board), turn: _.cloneDeep(this.currentTurn) }));
        } else {
            this.checkIfMustSwitchPlayersOrGameOver();
            console.log("wanted to make move but move not found ?! Color:" + player.colorString + ",From:" +
                move.from + ",To:" + move.to + ",Roll:" + move.roll);
        }
    }
    private getState(store: Store<State>): State {
        let state: State;
        store.subscribe(s => state = s);
        return state;
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
    protected calculatePoints(): number {

        let multiplier = 1;
        if (!this._doubleRequestAccepted) { return this.doublerCube; }
        if (this.isGammon()) { multiplier = 2; }
        if (this.isBackGammon()) { multiplier = 3; }
        return this.doublerCube * multiplier;
    }

    protected isGammon(): boolean {
        if (!this.isGameOver()) { return false; }
        const loserColor = this._currentPlayer.getOpponentColor();
        if (!_.find(this.getBoard().off.checkers, c => c.color === loserColor)) {
            return true;
        }
        return false;
    }

    private isBackGammon(): boolean {
        if (!this.isGameOver()) { return false; }
        const winner = this._currentPlayer;
        const loserColor = this._currentPlayer.getOpponentColor();
        if (_.find(this.getBoard().bar.checkers, c => c.color === loserColor)) {
            return true;
        }
        const homeFields = this.getHomeSector(this.getBoard(), winner);
        if (_.find(homeFields, f => {
            if (_.find(f.checkers, c => c.color === loserColor)) {
                return true;
            }
            return false;
        })) {
            return true;
        }
        return false;
    }

    private executeMove(move: Move, board: Board, testMove: boolean = false) {
        const startField = board.getFieldByNumber(move.from);
        const targetField = board.getFieldByNumber(move.to);
        const idxCheckerToMove = startField.checkers.length - 1;
        const checkerToMove = startField.checkers.splice(idxCheckerToMove, 1);
        if (!checkerToMove || checkerToMove.length === 0) {
            throw new Error("checker not found on start field: " +
                idxCheckerToMove + " startfield: " + move.from + " color: " + this._currentPlayer.colorString);
        }
        const hitOpponent = this.ifOppenentCheckerOnTargetFieldMoveItToBar(targetField, board);
        targetField.checkers.push(checkerToMove[0]);
        if (!testMove) {
            this.removeDiceRollFromOpenRolls(move.roll);
            this.addMoveToHistory(move, hitOpponent);
            this.store.dispatch(
                new OpenDiceRollUpdateAction({ rolls: _.cloneDeep(this._openDiceRolls) }));
        }
    }

    private removeDiceRollFromOpenRolls(roll: number) {
        const executedRoll = this._openDiceRolls.indexOf(roll);
        if (executedRoll === -1) {
            throw new Error("mit dem würfel is was hin, roll: " + roll);
        }
        this._openDiceRolls.splice(executedRoll, 1);
    }

    private ifOppenentCheckerOnTargetFieldMoveItToBar(targetField: Field, board: Board): boolean {
        // achtung: rule spezifische logik, muss hier raus
        if (targetField.number !== Board.offNumber &&
            targetField.checkers.length === 1 &&
            targetField.checkers[0].color !== this._currentPlayer.color) {
            const hitChecker = targetField.checkers.pop();
            if (!hitChecker) {
                throw new Error("hit checker not found on target field " + targetField.number);
            }
            board.bar.checkers.push(hitChecker);
            return true;
        }
        return false;
    }

    private checkIfMustSwitchPlayersOrGameOver() {
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

    public async start() {
        if (this._alreadyStarted) { return; }

        this.store.dispatch(new SetBoardAction({
            board: _.cloneDeep(this.board)
        }));
        this._alreadyStarted = true;
        await Helper.timeout(1000);
        this._currentPlayer.play(_.cloneDeep(this.board), this);
    }


    private isAnyMovePossible(): boolean {
        if (this._openDiceRolls.length === 0) {
            return false;
        }
        const possibleMovesLength = this.getAllPossibleMoves(this.board, this._currentPlayer, this._openDiceRolls).length;
        if (possibleMovesLength === 0) {
            console.log("zero moves possible");
        }
        return possibleMovesLength > 0;
    }

    private getPossibleBarMoves(board: Board, player: Player, diceRolls: number[]): Move[] {
        const moves: Move[] = [];
        const sortedBoard = this.sortBoardFieldsByPlayingDirection(board, player);
        const ownCheckers = _.filter(board.bar.checkers, c => c.color === player.color);
        diceRolls.forEach(roll => {
            if (!_.find(moves, m => m.to === roll) && this.canMoveToField(sortedBoard[roll - 1], player)) {
                moves.push(new Move(Board.barNumber, sortedBoard[roll - 1].number, roll));
            }
        });
        return moves;
    }
    private getPossibleFieldMoves(board: Board, player: Player, diceRolls: number[]): Move[] {
        const movesToReturn: Move[] = [];
        const sortedBoard = this.sortBoardFieldsByPlayingDirection(board, player);
        for (const field of sortedBoard) {
            const tmpMoves = this.getPossibleMovesForField(sortedBoard, field, player, diceRolls);
            for (const move of tmpMoves) {
                if (_.findIndex(movesToReturn, m => m.from === move.from && m.to === move.to && m.roll === move.roll) < 0) {
                    movesToReturn.push(new Move(move.from, move.to, move.roll));
                }
            }
        }


        this.removeMovesToOffWithHigherRollThanNeccessaryIfOtherLegalMovePossible(movesToReturn, board);
        this.ifOnlyOneOfTwoMovesCanBeMadeRemoveLowerRollMove(movesToReturn, board);

        return movesToReturn;
    }

    private ifOnlyOneOfTwoMovesCanBeMadeRemoveLowerRollMove(moves: Move[], board: Board) {
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

    private removeMovesToOffWithHigherRollThanNeccessaryIfOtherLegalMovePossible(movesToReturn: Move[], board: Board) {
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

    private getPossibleMovesForField(sortedBoard: Field[], field: Field, player: Player, rolls: number[]): Move[] {
        const tmpMoves: Move[] = [];
        if (!_.find(field.checkers, c => c.color === player.color)) {
            return tmpMoves;
        }
        const currentFieldIdx = _.findIndex(sortedBoard, f => f.number === field.number);
        rolls.forEach(roll => {
            const idxDestination1 = currentFieldIdx + roll;

            if (idxDestination1 < 24) {
                const destField = sortedBoard[idxDestination1];
                if (this.canMoveToField(destField, player)) {
                    tmpMoves.push(new Move(field.number, destField.number, roll));
                }
            } else {
                if (this.canMoveOut(roll)) {
                    tmpMoves.push(new Move(field.number, Board.offNumber, roll));
                }
            }
        });

        return tmpMoves;
    }

    private canMoveToField(field: Field, player: Player): boolean {
        if (field.checkers.length === 0) {
            return true;
        }
        const opponentCheckers = _.filter(field.checkers, c => c.color === player.getOpponentColor());
        if (opponentCheckers.length <= 1) {
            return true;
        }
        return false;
    }

    private canMoveOut(roll: number): boolean {
        const home = this.getHomeSector(this.board, this._currentPlayer);
        // alle steine müssen sich im Home Feld befinden
        const checkersInHome = _.flatMap(home, h => h.checkers);
        const currentPlayerCheckersInHome = _.filter(checkersInHome, c => c.color === this._currentPlayer.color);
        const ownCheckersAlreadyOff = _.filter(this.board.off.checkers, c => c.color === this._currentPlayer.color);
        const allCheckersInHomeOrOff = currentPlayerCheckersInHome.length + ownCheckersAlreadyOff.length === 15;
        return allCheckersInHomeOrOff;
    }
    private initBoardPositions(board: Board, player1: Player, player2: Player): Board {
        let white = player1;
        let black = player2;
        if (white.color !== CheckerColor.WHITE) {
            white = player2;
            black = player1;
        }
        this.initPlayer(board, white);
        this.initPlayer(board, black);
        return board;
    }

    private getSecondFieldNumber(player: Player): number {
        const firstFieldNumber = this.getFirstFieldNumber(player.color);
        let secondFieldNumber = 12;
        if (firstFieldNumber === 12) {
            secondFieldNumber = 1;
        } else if (firstFieldNumber === 13) {
            secondFieldNumber = 24;
        } else if (firstFieldNumber === 24) {
            secondFieldNumber = 13;
        }
        return secondFieldNumber;
    }
    private getThirdFieldNumber(player: Player): number {
        const firstFieldNumber = this.getFirstFieldNumber(player.color);
        let thirdFieldNumber = 17;
        if (firstFieldNumber === 12) {
            thirdFieldNumber = 19;
        } else if (firstFieldNumber === 13) {
            thirdFieldNumber = 5;
        } else if (firstFieldNumber === 24) {
            thirdFieldNumber = 8;
        }
        return thirdFieldNumber;
    }
    private getFourthFieldNumber(player: Player): number {
        const firstFieldNumber = this.getFirstFieldNumber(player.color);
        let fourthFieldNumber = 19;
        if (firstFieldNumber === 12) {
            fourthFieldNumber = 18;
        } else if (firstFieldNumber === 13) {
            fourthFieldNumber = 7;
        } else if (firstFieldNumber === 24) {
            fourthFieldNumber = 6;
        }
        return fourthFieldNumber;
    }
    private initPlayer(board: Board, player: Player) {
        const firstFieldNumber = this.getFirstFieldNumber(player.color);
        const firstField = board.getFieldByNumber(firstFieldNumber);
        firstField.checkers.push(player.checkers[0]);
        firstField.checkers.push(player.checkers[1]);

        const secondFieldNumber = this.getSecondFieldNumber(player);
        const secondField = board.getFieldByNumber(secondFieldNumber);
        secondField.checkers.push(player.checkers[2]);
        secondField.checkers.push(player.checkers[3]);
        secondField.checkers.push(player.checkers[4]);
        secondField.checkers.push(player.checkers[5]);
        secondField.checkers.push(player.checkers[6]);

        const thirdFieldNumber = this.getThirdFieldNumber(player);
        const thirdField = board.getFieldByNumber(thirdFieldNumber);
        thirdField.checkers.push(player.checkers[7]);
        thirdField.checkers.push(player.checkers[8]);
        thirdField.checkers.push(player.checkers[9]);

        const fourthFieldNumber = this.getFourthFieldNumber(player);
        const fourthField = board.getFieldByNumber(fourthFieldNumber);
        fourthField.checkers.push(player.checkers[10]);
        fourthField.checkers.push(player.checkers[11]);
        fourthField.checkers.push(player.checkers[12]);
        fourthField.checkers.push(player.checkers[13]);
        fourthField.checkers.push(player.checkers[14]);
    }

    protected getStartingPlayer(): Player {
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
        this._openDiceRolls = [player1Roll, player2Roll];
        this.store.dispatch(new OpenDiceRollUpdateAction({ rolls: this._openDiceRolls }));
        this.addPlayerTurn(this._openDiceRolls[0], this._openDiceRolls[1]);
        return this._currentPlayer;
    }

}


