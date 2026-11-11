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

    constructor(board: Board, player1: Player, player2: Player, dice: DiceService, store: Store<State>) {
        super(board, dice, GameMode.BACKGAMMON, player1, player2, store);
        this.initBoardPositions(this.board, player1, player2);
        this._currentPlayer = this.getStartingPlayer(true);
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

    protected executeMove(move: Move, board: Board, testMove: boolean) {
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
        }
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

}


