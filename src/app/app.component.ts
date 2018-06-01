import { ChangeDetectorRef, Component, OnDestroy, Renderer } from "@angular/core";
import { Store } from "@ngrx/store";
import * as _ from "lodash";
import { ISubscription } from "rxjs/Subscription";
import { fromPromise } from "rxjs/observable/fromPromise";
import { concatMap } from "rxjs/operators";
import { Helper } from "../helper/helper";
import { Board } from "../models/board";
import { Checker, CheckerColor } from "../models/checker";
import { Field } from "../models/field";
import { Game } from "../models/game";
import { GameMode } from "../models/gamemode";
import { GamerulesBackgammon } from "../models/gamerules-backgammon";
import { GameRulesBase } from "../models/gamerulesbase";
import { Move } from "../models/move";
import { PlayerComputer } from "../models/player-computer";
import { PlayerHuman } from "../models/player-human";
import { Turn } from "../models/turn";
import { DiceService } from "../services/dice.service";
import { SetBoardAction } from "./board.actions";
import { BoardState } from "./board.reducer";
import { State } from "./reducers";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"]
})
export class AppComponent implements OnDestroy {

  private subscription: ISubscription;
  title = "Backgammon Tavli";
  private game: Game;
  private board: Board;
  private currentTurn: Turn;

  private selectedChecker: Checker;
  private moveStartField: Field;
  private moveEndField: Field;
  private possibleMovesForStartField: Move[];
  constructor(public renderer: Renderer, private cdRef: ChangeDetectorRef, private store: Store<State>) {
    console.log("app component constructor");
    let rules: GameRulesBase;
    const board = new Board();
    const p1 = new PlayerHuman("Tom", CheckerColor.WHITE);
    const p2 = new PlayerComputer("PC1", CheckerColor.BLACK);
    const mode: GameMode = GameMode.BACKGAMMON;
    switch (mode) {
      case GameMode.BACKGAMMON:
        rules = new GamerulesBackgammon(board, p1, p2, new DiceService(), store);
        break;
      // case GameMode.PLAKATO:
      // case GameMode.PORTES:
      default:
        rules = new GamerulesBackgammon(board, p1, p2, new DiceService(), store);
    }
    this.game = new Game(rules);

    const boardStore = store.select("board");
    boardStore.pipe(
      concatMap(s => fromPromise(this.handleStateUpdate(s))) // concat map wartet immer bis
      // das vorherige observable fertig ist
    ).subscribe();

    store.dispatch(new SetBoardAction({
      board: _.cloneDeep(board)
    }));
    rules.start();
  }
  private async handleStateUpdate(state: BoardState) {
    // console.log("store update:");
    // console.log(state);
    if (state.turn) {
      this.currentTurn = state.turn;

    }
    if (state.move) {
      await this.showCheckerAnimation(state.move);
      this.cdRef.detectChanges();
    }
    if (state.board) {
      this.board = state.board;
      this.cdRef.detectChanges();
    }
    if (this.selectedChecker &&
      this.selectedChecker.color === this.currentTurn.player.color &&
      this.currentTurn.player instanceof PlayerHuman) {
      if (state.move) {
        const targetField = this.board.getFieldByNumber(state.move.to);
        this.selectChecker(targetField.checkers[targetField.checkers.length - 1], targetField);
      }
    } else {
      this.resetUiSelection();
    }
  }
  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
  public get rules(): GameRulesBase {
    if (!this.game) { return null; }
    return this.game.rules;
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
  public get pipCountWhite(): number {
    if (!this.board) { return null; }
    if (this.rules.getPlayer1().color === CheckerColor.WHITE) {
      return this.rules.getPlayer1PipCount();
    } else {
      return this.rules.getPlayer2PipCount();
    }
  }
  public get pipCountBlack(): number {
    if (!this.board) { return null; }
    if (this.rules.getPlayer1().color === CheckerColor.BLACK) {
      return this.rules.getPlayer1PipCount();
    } else {
      return this.rules.getPlayer2PipCount();
    }
  }
  public get roll1StillOpen(): boolean {
    return this.rollStillOpen(this.currentTurn.roll1);
  }
  public get roll2StillOpen(): boolean {
    return this.rollStillOpen(this.currentTurn.roll2);
  }
  private rollStillOpen(roll: number): boolean {
    if (!this.currentTurn) { return true; }
    if (!this.currentTurn.moves || this.currentTurn.moves.length === 0) { return true; }
    const usedroll = _.find(this.currentTurn.moves, m => {
      let diff = m.from - m.to;
      if (diff < 0) { diff = diff * -1; }
      return diff === roll;
    });
    return usedroll == null;
  }

  public get controlsEnabled(): boolean {
    return this.currentTurn.player instanceof PlayerHuman;
  }
  public get doublerCubeEnabled(): boolean {
    return this.rules.doublerCubeEnabled;
  }
  public get doublerCube(): number {
    return this.rules.doublerCube !== 1 ? this.rules.doublerCube : 64;
  }
  private doublerCubeClick() {
    if (this.rules.canPlayerDouble(this.currentTurn.player)) {
      this.rules.double(this.currentTurn.player);
    }
  }

  public selectChecker(checker: Checker, field: Field) {
    if (!this.controlsEnabled || this.currentTurn.player.color !== checker.color) { return; }
    this.selectedChecker = checker;
    this.moveStartField = field;
    this.possibleMovesForStartField = this.getPossibleMovesForSelectedField(field);
    console.log("checker selected " + this.selectedChecker.id);
  }
  public async selectTargetField(field: Field) {
    const movesForStartFieldWithCurrentRolls = this.getPossibleMovesForSelectedField(field);
    if (!movesForStartFieldWithCurrentRolls || movesForStartFieldWithCurrentRolls.length === 0) {
      console.log("no moves for this field");
    } else {
      const moveToTargetField = _.find(movesForStartFieldWithCurrentRolls, m => m.to === field.number);
      if (!moveToTargetField) {
        console.log("move to the selected field not possible");
      } else {
        this.rules.makeMove(moveToTargetField, this.currentTurn.player);
      }
    }
  }

  private resetUiSelection() {
    this.selectedChecker = null;
    this.moveStartField = null;
    this.moveEndField = null;
    this.possibleMovesForStartField = null;
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

  private async showCheckerAnimation(move: Move) {
    let checker = this.selectedChecker;
    if (!checker) {
      const fromCheckers = this.board.getFieldByNumber(move.from).checkers;
      checker = fromCheckers[fromCheckers.length - 1];
    }
    const el = document.getElementById(checker.id);
    await Helper.timeout(0); // wird benötigt, damit sicher das Binding mit dem neuen Board durch ist
    const destField = this.board.getFieldByNumber(move.to);
    const durationInSeconds = 0.5;
    this.renderer.setElementStyle(el, "transition", `${durationInSeconds}s linear`);
    const transformString = this.getTransform(destField, checker, destField.checkers.length);
    this.renderer.setElementAttribute(el, "transform", transformString);
    await Helper.timeout(durationInSeconds * 1000 + 200);
    this.renderer.setElementStyle(el, "transition", "");
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
    return `url(#${id})`;
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
