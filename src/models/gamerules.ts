import * as _ from "lodash";
import { Board } from "./board";
import { Player } from "./player";
import { CheckerColor, Checker } from "./checker";
import { Move } from "./move";
import { Field } from "./field";
import { DiceService } from "../services/dice.service";
import { timeout } from "q";

export class Gamerules {
    private startWhite = 1;

    private _currentPlayer: Player;
    private openDiceRolls: number[];

    constructor(private board: Board, private player1: Player, private player2: Player, private dice: DiceService) {
        this.initBoardPositions(board, this.player1, this.player2);
        this._currentPlayer = this.getStartingPlayer();
        this.start();
    }
    public getBoard(): Board {
        return _.cloneDeep(this.board);
    }
    public getOpenRollsOrRoll(player: Player): number[] {
        if (player !== this._currentPlayer) {
            return [];
        }
        return this.openDiceRolls;
    }

    public get openRolls(): number[] {
        return this.openDiceRolls;
    }

    public get currentPlayer(): Player {
        return this._currentPlayer;
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
        const possibleMoves = this.getAllPossibleMoves(this.board, this._currentPlayer, this.openDiceRolls);
        if (_.find(possibleMoves, m => m.from === move.from && m.to === move.to)) {
            const startField = this.board.getFieldByNumber(move.from);
            const idx = _.findIndex(startField.checkers, c => c.color === this._currentPlayer.color);
            const checker = startField.checkers.splice(idx, 1);
            if (!checker || checker.length === 0) {
                throw new Error("checker not found on start field: " +
                    idx + " startfield: " + move.from + " color: " + this._currentPlayer.colorString);
            }
            const targetField = this.board.getFieldByNumber(move.to);
            // achtung: rule spezifische logik, muss hier raus
            if (targetField.checkers.length === 1 && targetField.checkers[0].color !== this._currentPlayer.color) {
                const hitChecker = targetField.checkers.pop();
                if (!hitChecker) {
                    throw new Error("hit checker not found on target field " + targetField.number);
                }
                this.board.bar.checkers.push(hitChecker);
            }
            targetField.checkers.push(checker[0]);
            const executedRoll = this.openDiceRolls.indexOf(move.roll);
            if (executedRoll === -1) {
                throw new Error("mit dem würfel is was hin, roll: " + move.roll);
            }
            this.openDiceRolls.splice(executedRoll, 1);
            console.log(this.currentPlayer.colorString + " made move - roll: " + move.roll);
            this.checkIfMustSwitchPlayersOrGameOver();
        } else {
            this.checkIfMustSwitchPlayersOrGameOver();
            console.log("wanted to make move but move not found ?! Color:" + player.colorString + ",From:" +
                move.from + ",To:" + move.to + ",Roll:" + move.roll);
        }
    }

    private checkIfMustSwitchPlayersOrGameOver() {
        if (!this.isAnyMovePossible()) {
            if (!this.gameOver()) {
                this.nextPlayer();
            } else {
                console.log("game over! winner: " + this._currentPlayer.colorString);
                console.log(this.board);
            }
        }
    }

    private gameOver() {
        const offCheckers = _.filter(this.board.off.checkers, c => c.color === this._currentPlayer.color);
        console.log("off checkers: " + offCheckers.length + ", color: " + this._currentPlayer.colorString);
        if (offCheckers.length === 15) {
            return true;
        }
        return false;
    }

    private async start() {
        await this.timeout(500);
        if (this.isAnyMovePossible()) {
            this._currentPlayer.play(_.cloneDeep(this.board), this, this.openDiceRolls);
        } else {
            this.nextPlayer();
        }
    }
    private timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private fieldHasOwnChecker(field: Field, player: Player): boolean {
        field.checkers.forEach(c => {
            if (!c) {
                throw new Error(field.number + " field has null checker object");
            }
        });
        return _.find(field.checkers, c => c.color === player.color) != null;
    }

    private isAnyMovePossible(): boolean {
        if (this.openDiceRolls.length === 0) {
            return false;
        }
        const possibleMovesLength = this.getAllPossibleMoves(this.board, this._currentPlayer, this.openDiceRolls).length;
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
                moves.push(new Move(Board.barNumber, roll - 1, roll));
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
        return moves;
    }



    private getPossibleMovesForField(sortedBoard: Field[], field: Field, player: Player, rolls: number[], moves: Move[]) {
        const currentFieldIdx = sortedBoard.indexOf(field);
        if (!_.find(field.checkers, c => c.color === player.color)) {
            return;
        }
        const tmpMoves = [];
        rolls.forEach(roll => {
            const idxDestination1 = currentFieldIdx + roll;

            if (idxDestination1 < 24) {
                const destField = sortedBoard[idxDestination1];
                if (this.canMoveToField(destField, player)) {
                    tmpMoves.push(new Move(field.number, destField.number, roll));

                }
            } else {
                if (this.canMoveOut()) {
                    tmpMoves.push(new Move(field.number, Board.offNumber, roll));
                } else {
                    // console.log(player.colorString + " can not move out with roll " + roll);
                }
            }
        });

        tmpMoves.forEach(roll => {
            if (!_.find(moves, m => m.to === roll.to)) {
                moves.push(roll);
            }
        });
    }



    private canMoveToField(field: Field, player: Player): boolean {
        if (field.checkers.length === 0) {
            return true;
        }
        const opponentCheckers = _.filter(field.checkers, c => c.color === this.getOpponentColor(player));
        if (opponentCheckers.length <= 1) {
            return true;
        }
        return false;
    }

    private getOpponentColor(player: Player): CheckerColor {
        if (player.color === CheckerColor.BLACK) {
            return CheckerColor.WHITE;
        }
        return CheckerColor.BLACK;
    }

    private sortBoardFieldsByPlayingDirection(board: Board, player: Player): Field[] {
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

    private canMoveOut(): boolean {
        const home = this.getHomeSector(this.board, this._currentPlayer);
        const checkersInHome = _.flatMap(home, h => h.checkers);
        const currentPlayerCheckersInHome = _.filter(checkersInHome, c => c.color === this._currentPlayer.color);
        const ownCheckersAlreadyOff = _.filter(this.board.off.checkers, c => c.color === this._currentPlayer.color);
        return currentPlayerCheckersInHome.length + ownCheckersAlreadyOff.length === 15;
    }

    private getHomeSector(board: Board, player: Player): Field[] {
        const lastField = this.getLastFieldNumber(player);

        return this.getSectorOfStartfield(board, lastField);
    }
    private getStartSector(board: Board, player: Player): Field[] {
        const startField = this.getFirstFieldNumber(player);
        return this.getSectorOfStartfield(board, startField);
    }

    private getSectorOfStartfield(board: Board, fieldNumber: number): Field[] {
        if (fieldNumber === 1 || fieldNumber === 6) {
            return _.filter(board.fields, f => 1 <= f.number && f.number <= 6);
        }
        if (fieldNumber === 12 || fieldNumber === 7) {
            return _.filter(board.fields, f => 7 <= f.number && f.number <= 12);
        }
        if (fieldNumber === 13 || fieldNumber === 18) {
            return _.filter(board.fields, f => 13 <= f.number && f.number <= 18);
        }
        if (fieldNumber === 24 || fieldNumber === 19) {
            return _.filter(board.fields, f => 19 <= f.number && f.number <= 24);
        }
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
    private getLastFieldNumber(player: Player): number {
        const ownStartField = this.getFirstFieldNumber(player);
        return 25 - ownStartField;
    }
    private getFirstFieldNumber(player: Player): number {
        if (player.color === CheckerColor.WHITE) {
            return this.startWhite;
        }
        return 25 - this.startWhite;
    }
    private getSecondFieldNumber(player: Player): number {
        const firstFieldNumber = this.getFirstFieldNumber(player);
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
        const firstFieldNumber = this.getFirstFieldNumber(player);
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
        const firstFieldNumber = this.getFirstFieldNumber(player);
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
        const firstFieldNumber = this.getFirstFieldNumber(player);
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
        this.openDiceRolls = [player1Roll, player2Roll];
        return this._currentPlayer;
    }
    private nextPlayer() {
        if (this._currentPlayer === this.player1) {
            this._currentPlayer = this.player2;
        } else {
            this._currentPlayer = this.player1;
        }
        this.openDiceRolls = this.rollDices();
        const possibleMoves = this.getAllPossibleMoves(this.board, this._currentPlayer, this.openDiceRolls);
        if (possibleMoves && possibleMoves.length > 0) {
            this._currentPlayer.play(_.cloneDeep(this.board), this);
        } else {
            console.log("no moves possible, next player");
            this.nextPlayer();
        }

    }
    private rollDices(): number[] {
        const dice1 = this.dice.roll();
        const dice2 = this.dice.roll();
        if (dice1 === dice2) {
            return [dice1, dice1, dice1, dice1];
        }
        return [dice1, dice2];
    }
}

export enum GameMode {
    BACKGAMMON, PORTES, PLAKATO, FEVGA
}
