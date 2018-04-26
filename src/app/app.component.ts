import { Component, NgZone } from "@angular/core";
import { Field } from "../models/field";
import { Board } from "../models/board";
import { Player } from "../models/player";
import { CheckerColor, Checker } from "../models/checker";
import { GamerulesBackgammon } from "../models/gamerules-backgammon";
import _ = require("lodash");
import { DiceService } from "../services/dice.service";

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
  public currentPlayer: Player;

  constructor() {
    console.log("app component constructor");
    const board = new Board();
    const p1 = new Player("Tom", CheckerColor.WHITE);
    const p2 = new Player("PC1", CheckerColor.BLACK);

    this.board = board;
    this.rules = new GamerulesBackgammon(board, p1, p2, new DiceService());
    this.rolls = this.rules.openRolls;
    this.currentPlayer = this.rules.currentPlayer;
    console.log(this.board);
    console.log(this.currentPlayer);
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
  public get offCheckersWhite(): number {
    if (!this.board) { return null; }
    return _.filter(this.board.off.checkers, c => c.color === CheckerColor.WHITE).length;
  }
  public get offCheckersBlack(): number {
    if (!this.board) { return null; }
    return _.filter(this.board.off.checkers, c => c.color === CheckerColor.BLACK).length;
  }

  private getFill(checker: Checker): string {
    let id = "B";
    if (checker.color === CheckerColor.WHITE) {
      id = "R";
    }
    return `url(#${id}`;
  }
  private getUrl(checker: Checker): string {
    let id = "Q";
    if (checker.color === CheckerColor.WHITE) {
      id = "S";
    }
    return `url(#${id})`;
  }
  private getTransform(field: Field, checker: Checker, index: number): string {
    const xAxis = this.getXByField(field);
    const yAxis = this.getYByField(field, index);
    return `matrix(.945 0 0 .945 ${xAxis} ${yAxis})`;
  }

  private getYByField(field: Field, index: number): number {
    const ySpace = 19.252;
    const startBottom = 200.778;
    const startTop = 1.022;
    if (index >= 5) {
      index = index - 4.5;
    }
    if (field.number <= 12) {
      return startBottom - ySpace * index;
    } else {
      return startTop + ySpace * index;
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

  private showBottomRightDot(diceValue: number): string {
    if (diceValue === 2 || diceValue === 3 || diceValue === 4 || diceValue === 5 || diceValue === 6) {
      return "visible";
    }
    return "hidden";
  }
  private showMiddleRightDot(diceValue: number): string {
    if (diceValue === 6) {
      return "visible";
    }
    return "hidden";
  }
  private showTopRightDot(diceValue: number): string {
    if (diceValue === 4 || diceValue === 5 || diceValue === 6) {
      return "visible";
    }
    return "hidden";
  }
  private showTopLeftDot(diceValue: number): string {
    if (diceValue === 2 || diceValue === 3 || diceValue === 4 || diceValue === 5 || diceValue === 6) {
      return "visible";
    }
    return "hidden";
  }
  private showMiddleLeftDot(diceValue: number): string {
    if (diceValue === 6) {
      return "visible";
    }
    return "hidden";
  }
  private showBottomLeftDot(diceValue: number): string {
    if (diceValue === 4 || diceValue === 5 || diceValue === 6) {
      return "visible";
    }
    return "hidden";
  }
  private showMiddleDot(diceValue: number): string {
    if (diceValue === 1 || diceValue === 3 || diceValue === 5) {
      return "visible";
    }
    return "hidden";
  }

}
