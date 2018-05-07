import { Component, NgZone } from "@angular/core";
import { Field } from "../models/field";
import { Board } from "../models/board";
import { Player } from "../models/player";
import { CheckerColor, Checker } from "../models/checker";
import { GamerulesBackgammon } from "../models/gamerules-backgammon";
import * as _ from "lodash";
import { DiceService } from "../services/dice.service";
import { PlayerComputer } from "../models/player-computer";
import { PlayerHuman } from "../models/player-human";
import { Move } from "../models/move";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"]
})
export class AppComponent {
  title = "Backgammon Tavli";
  private rules: GamerulesBackgammon;
  public board: Board;
  public rolls: number[];
  private selectedChecker: Checker;
  private moveStartField: Field;
  private moveEndField: Field;
  private possibleMovesForStartField: Move[];
  constructor() {
    console.log("app component constructor");
    const board = new Board();
    const p1 = new PlayerHuman("Tom", CheckerColor.WHITE);
    const p2 = new PlayerComputer("PC1", CheckerColor.BLACK);

    this.board = board;
    this.rules = new GamerulesBackgammon(board, p1, p2, new DiceService());
    this.rolls = this.rules.openRolls;

    console.log(this.board);
    console.log(this.rules.currentPlayer);
  }

  public get fields(): Field[] {
    if (!this.board) { return null; }
    return this.board.fields;
  }
  public get bar(): Field {
    if (!this.board) { return null; }
    return this.board.bar;
  }
  public get barCheckersWhite(): number {
    if (!this.board) { return null; }
    return _.filter(this.board.bar.checkers, c => c.color === CheckerColor.WHITE).length;
  }
  public get barCheckersBlack(): number {
    if (!this.board) { return null; }
    return _.filter(this.board.bar.checkers, c => c.color === CheckerColor.BLACK).length;
  }
  public get off(): Field {
    if (!this.board) { return null; }
    return this.board.off;
  }
  public get offWhite(): Checker[] {
    if (!this.board) { return null; }
    return _.filter(this.board.off.checkers, c => c.color === CheckerColor.WHITE);
  }
  public get offBlack(): Checker[] {
    if (!this.board) { return null; }
    return _.filter(this.board.off.checkers, c => c.color === CheckerColor.BLACK);
  }
  public get offCheckersWhite(): number {
    if (!this.board) { return null; }
    return _.filter(this.board.off.checkers, c => c.color === CheckerColor.WHITE).length;
  }
  public get offCheckersBlack(): number {
    if (!this.board) { return null; }
    return _.filter(this.board.off.checkers, c => c.color === CheckerColor.BLACK).length;
  }

  public get controlsEnabled(): boolean {
    return this.rules.currentPlayer instanceof PlayerHuman;
  }

  public selectChecker(checker: Checker, field: Field, idx: number) {
    if (!this.controlsEnabled || this.rules.currentPlayer.color !== checker.color) { return; }
    this.selectedChecker = checker;
    this.moveStartField = field;
    this.possibleMovesForStartField = this.getPossibleMovesForSelectedField(field);
    console.log("checker selected");
  }
  public selectTargetField(field: Field) {
    const movesForStartFieldWithCurrentRolls = this.getPossibleMovesForSelectedField(field);
    if (!movesForStartFieldWithCurrentRolls || movesForStartFieldWithCurrentRolls.length === 0) {
      console.log("no moves for this field");
    } else {
      const moveToTargetField = _.find(movesForStartFieldWithCurrentRolls, m => m.to === field.number);
      if (!moveToTargetField) {
        console.log("move to the selected field not possible");
      } else {
        this.rules.makeMove(moveToTargetField, this.rules.currentPlayer);
        this.selectedChecker = null;
        this.moveStartField = null;
        this.moveEndField = null;
        this.possibleMovesForStartField = null;
      }
    }
  }

  private getPossibleMovesForSelectedField(field: Field): Move[] {
    if (!this.controlsEnabled) { return; }
    if (!this.selectedChecker) { return; }
    if (!this.moveStartField) { return; }
    const possibleMoves = this.rules.getAllPossibleMoves(this.rules.getBoard(), this.rules.currentPlayer, this.rules.openRolls);
    const movesForStartField = _.filter(possibleMoves, p => p.from === this.moveStartField.number);
    const movesForStartFieldWithCurrentRolls = _.filter(movesForStartField, m => _.findIndex(this.rules.openRolls, o => o === m.roll) > -1);
    return movesForStartFieldWithCurrentRolls;
  }

  private getRectFill(field: Field): number {
    if (this.possibleMovesForStartField) {
      if (_.findIndex(this.possibleMovesForStartField, p => p.to === field.number) > -1) {
        return 0.2;
      }
    }
    return 0;
  }

  private getFill(checker: Checker): string {
    let id = "B";
    if (checker.color === CheckerColor.WHITE) {
      id = "R";
    }
    return `url(#${id}`;
  }
  private getBorder(checker: Checker): string {
    let id = "checkerGradientBorderBlack";
    if (checker.color === CheckerColor.WHITE) {
      id = "checkerGradientBorderWhite";
    }
    if (checker === this.selectedChecker) {
      id = "checkerGradientBorderSelected";
    }
    return `url(#${id})`;
  }
  private getTransform(field: Field, checker: Checker, index: number): string {
    const xAxis = this.getXByField(field);
    const yAxis = this.getYByField(field, index, checker);
    return `matrix(.945 0 0 .945 ${xAxis} ${yAxis})`;
  }

  private getYByField(field: Field, index: number, checker: Checker): number {
    const ySpace = 19.252;
    const startBottom = 200.778;
    const startTop = 1.022;
    if (index >= 5 && index < 10) {
      index = index - 4.5;
    } else if (index >= 10) {
      index = index - 12.5;
    }
    if (field.number <= 12) {
      if (field.number === Board.offNumber) {
        const lastField = this.rules.getLastFieldNumber(checker.color);
        if (lastField === 24) {
          return startTop + ySpace * index;
        }
      }
      return startBottom - ySpace * index;
    } else {
      return startTop + ySpace * index;
    }
  }

  private getYOutsideByField(field: Field): number {
    if (field.number < 13) {
      return 130;
    } else {
      return 10;
    }
  }

  private getXByField(field: Field): number {
    const xSpace = 19.252;
    const startRight = 10.711;
    const startLeft = -32.281;
    switch (field.number) {
      case 1:
      case 24:
        return startRight + xSpace * 5;
      case 2:
      case 23:
        return startRight + xSpace * 4;
      case 3:
      case 22:
        return startRight + xSpace * 3;
      case 4:
      case 21:
        return startRight + xSpace * 2;
      case 5:
      case 20:
        return startRight + xSpace;
      case 6:
      case 19:
        return startRight;

      case 7:
      case 18:
        return startLeft;
      case 8:
      case 17:
        return startLeft - xSpace;
      case 9:
      case 16:
        return startLeft - xSpace * 2;
      case 10:
      case 15:
        return startLeft - xSpace * 3;
      case 11:
      case 14:
        return startLeft - xSpace * 4;
      case 12:
      case 13:
        return startLeft - xSpace * 5;
      case 25: // bar
        return startLeft + xSpace;
      case 0: // off
        return startRight + xSpace * 6;
    }

    return -120;
  }

}
