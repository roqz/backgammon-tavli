import { ChangeDetectorRef, Component, OnDestroy, Renderer, OnInit } from "@angular/core";
import { NgbModal, ModalDismissReasons } from "@ng-bootstrap/ng-bootstrap";
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
import { GamerulesFevga } from "../models/gamerules-fevga";
import { GamerulesPlakato } from "../models/gamerules-plakato";
import { GamerulesPortes } from "../models/gamerules-portes";
import { LOCATION_INITIALIZED } from "@angular/common";
import { SettingsModalComponent } from "./settings-modal/settings-modal.component";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"]
})
export class AppComponent {

  title = "Backgammon Tavli";

  constructor(public renderer: Renderer, private cdRef: ChangeDetectorRef, private store: Store<State>, private modalService: NgbModal) {

  }

  /* UI  */
  private navOpen = false;
  private toggleNav() {
    this.navOpen = !this.navOpen;
  }
  private async openSettingsModal() {
    try {
      const modal = this.modalService.open(SettingsModalComponent);
      modal.componentInstance.name = "Tom";
      const result = await modal.result;
      console.log(result);
    } catch (error) {
      const dismissReason = this.getDismissReason(error);
      console.log(dismissReason);
    }
  }
  private getDismissReason(reason: any): string {
    if (reason === ModalDismissReasons.ESC) {
      return "by pressing ESC";
    } else if (reason === ModalDismissReasons.BACKDROP_CLICK) {
      return "by clicking on a backdrop";
    } else {
      return `with: ${reason}`;
    }
  }
}
