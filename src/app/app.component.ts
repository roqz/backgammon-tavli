import { ChangeDetectorRef, Component, OnDestroy, Renderer } from "@angular/core";
import { Store } from "@ngrx/store";
import * as _ from "lodash";
import { Subject, interval } from "rxjs";
import { ISubscription } from "rxjs/Subscription";
import { fromPromise } from "rxjs/observable/fromPromise";
import { concatMap, takeUntil } from "rxjs/operators";
import { Helper } from "../helper/helper";
import { Board } from "../models/board";
import { Checker, CheckerColor } from "../models/checker";
import { Field } from "../models/field";
import { Game } from "../models/game";
import { GameMode } from "../models/gamemode";
import { GamerulesBackgammon } from "../models/gamerules-backgammon";
import { GameRulesBase } from "../models/gamerulesbase";
import { Move } from "../models/move";
import { Player } from "../models/player";
import { PlayerComputer } from "../models/player-computer";
import { PlayerHuman } from "../models/player-human";
import { Turn } from "../models/turn";
import { DiceService } from "../services/dice.service";
import { AppSettings } from "./app.settings";
import { BoardActionTypes } from "./board.actions";
import { BoardState } from "./board.reducer";
import { State } from "./reducers";
import { GamerulesTavli } from "../models/gamerules-tavli";
import { GamerulesPlakato } from "../models/gamerules-plakato";
import { GamerulesPortes } from "../models/gamerules-portes";

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
  private openRolls: number[];
  private currentTurn: Turn;
  private player1: Player;
  private player2: Player;
  private history: Turn[];
  private _doublerCube = 1;

  // ab hier ui helper
  private _settings: AppSettings = new AppSettings();
  private selectedChecker: Checker;
  private moveStartField: Field;
  private moveEndField: Field;
  private possibleMovesForStartField: Move[];
  constructor(public renderer: Renderer, private cdRef: ChangeDetectorRef, private store: Store<State>) {
    this.restartGame(GameMode.BACKGAMMON);
  }
  private initStoreSubscriptions(store: Store<State>) {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    const playerStore = store.select("players").subscribe(players => {
      this.player1 = players.player1;
      this.player2 = players.player2;
    });
    const boardStore = store.select("board");
    this.subscription = boardStore.pipe(concatMap(s => fromPromise(this.handleStateUpdate(s))) // concat map wartet immer bis
      // das vorherige observable fertig ist
    ).subscribe();
  }

  private async handleStateUpdate(state: BoardState) {
    // console.log("store update:");
    // console.log(state);
    switch (state.action) {
      case BoardActionTypes.NextTurn:
        this.currentTurn = state.turn;
        this.history = state.history;
        this.autoRollIfRequired();
        break;
      case BoardActionTypes.MakeMove:
        await this.showCheckerAnimation(state.move);
        this.board = state.board;
        this.currentTurn = state.turn;
        this.cdRef.detectChanges();
        break;
      case BoardActionTypes.RevertMove:
        // await this.showCheckerAnimation(state.move);
        await Helper.timeout(0);
        this.board = state.board;
        this.openRolls = state.rolls;
        this.currentTurn = state.turn;
        this.cdRef.detectChanges();
        await Helper.timeout(0);
        break;
      case BoardActionTypes.SetBoard:
        await Helper.timeout(0);
        this.board = state.board;
        this.cdRef.detectChanges();
        await Helper.timeout(0);
        break;
      case BoardActionTypes.DiceRoll:
        await this.showDiceRollAnimation(state.turn);
        this.currentTurn = state.turn;
        this.openRolls = state.rolls;
        await Helper.timeout(500);
        break;
      case BoardActionTypes.OpenDiceRollUpdate:
        this.openRolls = state.rolls;
        break;
      case BoardActionTypes.Double:
        break;
      case BoardActionTypes.DoubleAccept:
        this._doublerCube = state.doublerCube;
        break;
      case BoardActionTypes.GameOver:
        this.subscription.unsubscribe();
        break;
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
  public get barCheckers(): Checker[] {
    if (!this.board) { return null; }
    return this.board.bar.checkers;
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
    if (!this.board || !this.player1) { return null; }
    if (this.player1.color === CheckerColor.WHITE) {
      return this.rules.getPipCount(this.player1, this.board);
    } else {
      return this.rules.getPipCount(this.player2, this.board);
    }
  }
  public get pipCountBlack(): number {
    if (!this.board || !this.player1) { return null; }
    if (this.player1.color === CheckerColor.BLACK) {
      return this.rules.getPipCount(this.player1, this.board);
    } else {
      return this.rules.getPipCount(this.player2, this.board);
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
    return this.currentTurn && this.currentTurn.player instanceof PlayerHuman;
  }
  public get doublerCubeEnabled(): boolean {
    return this.rules.doublerCubeEnabled;
  }
  public get doublerCube(): number {
    return this._doublerCube !== 1 ? this._doublerCube : 64;
  }
  private doublerCubeClick() {
    if (this.rules.canPlayerDouble(this.currentTurn.player)) {
      this.rules.double(this.currentTurn.player);
    }
  }

  private rollDiceClick() {
    if (!this.controlsEnabled) { return; }
    this.cancelAutoRollClick();
    this.rules.rollDices();
  }
  private finishTurnClick() {
    if (!this.controlsEnabled) { return; }
    this.cancelAutoFinishClick();
    this.rules.finishTurn(this.currentTurn.player);
  }
  private revertMoveClick() {
    if (!this.controlsEnabled) { return; }
    this.cancelAutoFinishClick();
    this.rules.revertLastMove();
  }

  public selectChecker(checker: Checker, field: Field) {
    if (!this.controlsEnabled ||
      this.currentTurn.player.color !== checker.color ||
      !this.openRolls ||
      this.openRolls.length === 0) { return; }
    this.selectedChecker = checker;
    this.moveStartField = field;
    this.possibleMovesForStartField = this.getPossibleMovesForSelectedField(field);
  }
  public async selectTargetField(field: Field) {
    const movesForStartFieldWithCurrentRolls = this.getPossibleMovesForSelectedField(this.moveStartField);
    if (!movesForStartFieldWithCurrentRolls || movesForStartFieldWithCurrentRolls.length === 0) {
      console.log("no moves for this field");
    } else {
      const moveToTargetField = _.find(movesForStartFieldWithCurrentRolls, m => m.to === field.number);
      if (!moveToTargetField) {
        console.log("move to the selected field not possible");
      } else {
        this.rules.makeMove(moveToTargetField, this.currentTurn.player);
        this.autoFinishTurnIfRequired();
      }
    }
  }
  private autoFinishTick = 0;
  private endAutoFinish$: Subject<string>;
  private autoFinishTurnIfRequired() {
    if (!this._settings.autoFinishTurnEnabled) { return; }
    if (this.openRolls.length === 0 && this.currentTurn.player instanceof PlayerHuman) {
      this.endAutoFinish$ = new Subject<string>();
      const obs = interval(1000).pipe(takeUntil(this.endAutoFinish$));
      obs.subscribe(tick => {
        this.autoFinishTick = 3 - tick;
        if (tick === 3) {
          this.endAutoFinish$.next("finish");
          this.endAutoFinish$.next("finish");
          this.finishTurnClick();
        }
      });
    }
    const possibleMoves = this.rules.getAllPossibleMoves(this.board, this.currentTurn.player, this.openRolls);
    if (!possibleMoves || possibleMoves.length === 0) {

    }
  }
  private cancelAutoFinishClick() {
    this.autoFinishTick = 0;
    if (this.endAutoFinish$) { this.endAutoFinish$.next("finish"); }
  }
  private autoRollTick = 0;
  private endAutoRoll$: Subject<string>;
  private autoRollIfRequired() {
    if (!this._settings.autoRollDiceEnabled) { return; }
    if (!this.currentTurn.roll1 && !this.currentTurn.roll2 && this.currentTurn.player instanceof PlayerHuman) {
      this.endAutoRoll$ = new Subject<string>();
      const obs = interval(1000).pipe(takeUntil(this.endAutoRoll$));
      obs.subscribe(tick => {
        this.autoRollTick = 3 - tick;
        if (tick >= 3) {
          this.endAutoRoll$.next("finish");
          this.autoRollTick = 0;
          this.rollDiceClick();
        }
      });
    }
  }
  private cancelAutoRollClick() {
    this.autoRollTick = 0;
    if (this.endAutoRoll$) { this.endAutoRoll$.next("finish"); }
  }

  private get rollDiceButtonEnabled() {
    return this.controlsEnabled && !this.currentTurn.roll1 && !this.currentTurn.roll2;
  }
  private get revertMoveButtonEnabled() {
    return this.controlsEnabled && this.currentTurn.moves && this.currentTurn.moves.length > 0;
  }
  private get finishTurnButtonEnabled() {
    return this.controlsEnabled &&
      !this.rollDiceButtonEnabled &&
      (this.openRolls.length === 0 || (
        this.board &&
        this.rules.getAllPossibleMoves(this.board, this.currentTurn.player, this.openRolls).length === 0)
      );
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

  private restartGame(mode: GameMode) {
    this.initStoreSubscriptions(this.store);

    let rules: GameRulesBase;
    const board = new Board();
    const p1 = new PlayerHuman("Tom", CheckerColor.WHITE);
    const p2 = new PlayerComputer("PC1", CheckerColor.BLACK);

    switch (mode) {
      case GameMode.BACKGAMMON:
        rules = new GamerulesBackgammon(board, p1, p2, new DiceService(), this.store);
        break;
      case GameMode.TAVLI:
        rules = new GamerulesTavli(board, p1, p2, new DiceService(), this.store);
        break;
      case GameMode.PLAKATO:
        rules = new GamerulesPlakato(board, p1, p2, new DiceService(), this.store);
        break;
      case GameMode.PORTES:
        rules = new GamerulesPortes(board, p1, p2, new DiceService(), this.store);
        break;
      default:
        rules = new GamerulesBackgammon(board, p1, p2, new DiceService(), this.store);
    }
    this.game = new Game(rules);

    rules.start();
  }

  private async showCheckerAnimation(move: Move) {
    if (!this.board) { return; }
    let checker = this.selectedChecker;
    const fromCheckers = this.board.getFieldByNumber(move.from).checkers;
    if (!checker || !_.find(fromCheckers, c => c.id === checker.id)) {
      checker = fromCheckers[fromCheckers.length - 1];
    }
    try {
      const el = document.getElementById(checker.id);
      await Helper.timeout(0); // wird benötigt, damit sicher das Binding mit dem neuen Board durch ist
      const destField = this.board.getFieldByNumber(move.to);
      const durationInSeconds = 0.5;
      this.renderer.setElementStyle(el, "transition", `${durationInSeconds}s linear`);
      const transformString = this.getTransform(destField, checker, destField.checkers.length);
      this.renderer.setElementAttribute(el, "transform", transformString);
      await Helper.timeout(durationInSeconds * 1000 + 200);
      this.renderer.setElementStyle(el, "transition", "");
    } catch (e) {
      console.log(e);
    }
  }

  private async showDiceRollAnimation(turn: Turn) {
    // tslint:disable-next-line:max-line-length
    // <animateTransform attributeType="xml" attributeName="transform" type="rotate" from="0 177.252 115.591" to="360 191.122 129.461" dur="0.5s"
    // additive="sum" repeatCount="indefinite" />

    // tslint:disable-next-line:max-line-length
    // <animateTransform attributeName="transform" type="rotate" from="0 18 18" to="360 18 18" begin="0s" dur="0.85s" repeatCount="5" ></animateTransform>
    const el = document.getElementById("dice4");
    //   await Helper.timeout(0);
    // var a = svg.createElementNS("http://www.w3.org/2000/svg", "animateTransform");
    // var bb = el.getBBox();
    // var cx = bb.x + bb.width/2;
    // var cy = bb.y + bb.height/2;
    // a.setAttributeNS(null, "attributeName", "transform");
    // a.setAttributeNS(null, "attributeType", "XML");
    // a.setAttributeNS(null, "type", "rotate");
    // a.setAttributeNS(null, "dur", dur + "s");
    // a.setAttributeNS(null, "repeatCount", "indefinite");
    // a.setAttributeNS(null, "from", "0 "+cx+" "+cy);
    // a.setAttributeNS(null, "to", 360*dir+" "+cx+" "+cy);
    // el.appendChild(a);
    // a.beginElement();
    //   await Helper.timeout(durationInSeconds * 1000 + 200);
    //   el.removeChild(a);
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
    if (!field || !checker) { return 0; }
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
    if (!field) { return 0; }
    if (field.number < 13) {
      return 130;
    } else {
      return 10;
    }
  }

  private getXByField(field: Field): number {
    if (!field) { return 0; }
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
