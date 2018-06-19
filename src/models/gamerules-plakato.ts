import { GameRulesBase } from "./gamerulesbase";
import { Board } from "./board";
import { Player } from "./player";
import { Move } from "./move";
import { GameResult } from "./gameresult";
import { DiceService } from "../services/dice.service";
import { GameMode } from "./gamemode";
import { Store } from "@ngrx/store";
import { State } from "../app/reducers";
import { CheckerColor } from "./checker";
import * as _ from "lodash";
import { Field } from "./field";
import { OpenDiceRollUpdateAction, MakeMoveAction } from "../app/board.actions";

export class GamerulesPlakato extends GameRulesBase {

    constructor(board: Board, player1: Player, player2: Player, dice: DiceService, store: Store<State>) {
        super(board, dice, GameMode.PLAKATO, player1, player2, store);
        this._doublerCubeEnabled = false;
        this.initBoardPositions(this.board, player1, player2);
        this._currentPlayer = this.getStartingPlayer();
    }

    public getAllPossibleMoves(board: Board, player: Player, diceRolls: number[]): Move[] {
        if (player.color !== this._currentPlayer.color) {
            return [];
        }
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
        if (this.isCheckerOnFieldBlockedByOpponent(field, player)) {
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
    private isCheckerOnFieldBlockedByOpponent(field: Field, player: Player) {
        return field.checkers[field.checkers.length - 1].color !== player.color;
    }

    private canMoveToField(field: Field, player: Player): boolean {
        if (field.checkers.length === 0) {
            return true;
        }
        const opponentCheckers = _.filter(field.checkers, c => c.color === player.getOpponentColor());
        if (opponentCheckers.length > 1) {
            return false;
        } else if (opponentCheckers.length === 1 && field.checkers[0].color === player.getOpponentColor()) {
            return true;
        } else if (opponentCheckers.length === 0) {
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

    protected executeMove(move: Move, board: Board, testMove: boolean = false) {
        const startField = board.getFieldByNumber(move.from);
        const targetField = board.getFieldByNumber(move.to);
        const idxCheckerToMove = startField.checkers.length - 1;
        const checkerToMove = startField.checkers.splice(idxCheckerToMove, 1);
        if (!checkerToMove || checkerToMove.length === 0) {
            throw new Error("checker not found on start field: " +
                idxCheckerToMove + " startfield: " + move.from + " color: " + this._currentPlayer.colorString);
        }
        targetField.checkers.push(checkerToMove[0]);
        if (!testMove) {
        }
    }

    private initBoardPositions(board: Board, player1: Player, player2: Player): any {
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
    private initPlayer(board: Board, player: Player) {
        const firstFieldNumber = this.getFirstFieldNumber(player.color);
        const firstField = board.getFieldByNumber(firstFieldNumber);
        for (let i = 0; i < 15; i++) {
            firstField.checkers.push(player.checkers[i]);
        }
    }
    protected calculatePoints(): number {

        if (this.noOpponentCheckerInOff()) { return 2; }
        return 1;
    }
    private noOpponentCheckerInOff(): boolean {
        const opponentColor = this.currentPlayer.getOpponentColor();
        const opponentCheckers = _.filter(this.board.off.checkers, c => c.color === opponentColor);
        return opponentCheckers.length === 0;
    }
}
