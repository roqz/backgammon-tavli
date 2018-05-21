import * as _ from "lodash";
import { Board } from "./board";
import { Player } from "./player";
import { CheckerColor, Checker } from "./checker";
import { Move } from "./move";
import { Field } from "./field";
import { DiceService } from "../services/dice.service";
import { timeout } from "q";
import { Helper } from "../helper/helper";
import { GameRulesBase } from "./gamerulesbase";
import { GameMode } from "./gamemode";
import { Store } from "@ngrx/store";
import { State } from "../app/reducers";
import { BoardActionTypes, MakeMoveAction } from "../app/board.actions";

export class GamerulesBackgammon extends GameRulesBase {

    constructor(board: Board, player1: Player, player2: Player, dice: DiceService, store: Store<State>) {
        super(board, dice, GameMode.BACKGAMMON, player1, player2, store);
        this.initBoardPositions(this.board, player1, player2);
        this._currentPlayer = this.getStartingPlayer();
        this.start();
    }

    public getAllPossibleMoves(board: Board, player: Player, diceRolls: number[]): Move[] {
        if (player !== this._currentPlayer) {
            return [];
        }
        const ownCheckersOnBar = _.filter(board.bar.checkers, c => c.color === player.color);
        if (ownCheckersOnBar.length > 0) {
            return this.getPossibleBarMoves(board, player, diceRolls);
        }
        return this.getPossibleFieldMoves(board, player, diceRolls);
    }

    public makeMove(move: Move, player: Player) {
        if (player !== this._currentPlayer) {
            return;
        }
        const possibleMoves = this.getAllPossibleMoves(this.board, this._currentPlayer, this._openDiceRolls);
        if (_.find(possibleMoves, m => m.from === move.from && m.to === move.to)) {
            this.executeMove(move);
            this.store.dispatch(new MakeMoveAction({ move: move, board: _.cloneDeep(this.board) }));
            this.checkIfMustSwitchPlayersOrGameOver();
        } else {
            this.checkIfMustSwitchPlayersOrGameOver();
            console.log("wanted to make move but move not found ?! Color:" + player.colorString + ",From:" +
                move.from + ",To:" + move.to + ",Roll:" + move.roll);
        }
    }

    private executeMove(move: Move) {
        const startField = this.board.getFieldByNumber(move.from);
        const targetField = this.board.getFieldByNumber(move.to);
        const idxCheckerToMove = startField.checkers.length - 1;
        const checkerToMove = startField.checkers.splice(idxCheckerToMove, 1);
        if (!checkerToMove || checkerToMove.length === 0) {
            throw new Error("checker not found on start field: " +
                idxCheckerToMove + " startfield: " + move.from + " color: " + this._currentPlayer.colorString);
        }
        // achtung: rule spezifische logik, muss hier raus
        const hitOpponent = this.ifOppenentCheckerOnTargetFieldMoveItToBar(targetField);
        targetField.checkers.push(checkerToMove[0]);
        this.removeDiceRollFromOpenRolls(move.roll);
        console.log(this.currentPlayer.colorString + " made move - roll: " + move.roll);
        this.addMoveToHistory(move, hitOpponent);
    }

    private removeDiceRollFromOpenRolls(roll: number) {
        const executedRoll = this._openDiceRolls.indexOf(roll);
        if (executedRoll === -1) {
            throw new Error("mit dem würfel is was hin, roll: " + roll);
        }
        this._openDiceRolls.splice(executedRoll, 1);
    }

    private ifOppenentCheckerOnTargetFieldMoveItToBar(targetField: Field): boolean {
        // achtung: rule spezifische logik, muss hier raus
        if (targetField.number !== Board.offNumber &&
            targetField.checkers.length === 1 &&
            targetField.checkers[0].color !== this._currentPlayer.color) {
            const hitChecker = targetField.checkers.pop();
            if (!hitChecker) {
                throw new Error("hit checker not found on target field " + targetField.number);
            }
            this.board.bar.checkers.push(hitChecker);
            return true;
        }
        return false;
    }

    private checkIfMustSwitchPlayersOrGameOver() {
        if (!this.isAnyMovePossible()) {
            if (!this.isGameOver()) {
                this.nextPlayer();
            } else {
                console.log("game over! winner: " + this._currentPlayer.colorString);
                console.log(this.board);
            }
        }
    }

    private async start() {
        await Helper.timeout(500);
        if (this.isAnyMovePossible()) {
            this._currentPlayer.play(_.cloneDeep(this.board), this);
        } else {
            this.nextPlayer();
        }
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
        const moves: Move[] = [];
        const sortedBoard = this.sortBoardFieldsByPlayingDirection(board, player);
        sortedBoard.forEach(field => {
            this.getPossibleMovesForField(sortedBoard, field, player, diceRolls, moves);
        });
        // raus ziehen nur erlaubt wenn direkt auf das off field rausgezogen werden kann
        // oder wenn kein anderer move mit diesem roll möglich ist
        const outMovesWithHigherRolls = _.filter(moves, m =>
            m.to === Board.offNumber &&
            ((m.from < 6 && (m.roll > m.from))) ||
            (m.from > 19 && (m.roll > 25 - m.from)));
        outMovesWithHigherRolls.forEach(outMove => {
            const movesWithinField = _.filter(moves, m => m.roll === outMove.roll && m.to !== Board.offNumber);
            if (movesWithinField.length > 0) {
                _.remove(moves, m => m === outMove);
            }
        });
        // todo züge aussortieren, die den zweiten zug unmöglich machen würden
        return moves;
    }



    private getPossibleMovesForField(sortedBoard: Field[], field: Field, player: Player, rolls: number[], moves: Move[]) {
        const currentFieldIdx = sortedBoard.indexOf(field);
        if (!_.find(field.checkers, c => c.color === player.color)) {
            return;
        }
        const tmpMoves: Move[] = [];
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

        tmpMoves.forEach(roll => {
            if (!_.find(moves, m => m.from === roll.from && m.to === roll.to && m.roll === roll.roll)) {
                moves.push(roll);
            }
        });
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

    private getStartingPlayer(): Player {
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
        this.addPlayerTurn();
        return this._currentPlayer;
    }
    private nextPlayer() {
        this.nextPlayerTurn();
        const possibleMoves = this.getAllPossibleMoves(this.board, this._currentPlayer, this._openDiceRolls);
        if (possibleMoves && possibleMoves.length > 0) {
            this._currentPlayer.play(_.cloneDeep(this.board), this);
        } else {
            console.log("no moves possible, next player");
            this.nextPlayer();
        }
    }
}


