import { Injectable } from "@angular/core";
import { Actions, Effect } from "@ngrx/effects";
import { BoardActions, BoardActionTypes } from "./board.actions";
import { PlayerActionTypes } from "./player.actions";

@Injectable()
export class PlayerEffects {

    @Effect()
    effect$ = this.actions$.ofType(PlayerActionTypes.SetPlayers);

    constructor(private actions$: Actions) { }
}
