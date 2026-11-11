import { Injectable } from "@angular/core";
import { Actions, Effect } from "@ngrx/effects";
import { BoardActions, BoardActionTypes } from "./board.actions";

@Injectable()
export class BoardEffects {

  @Effect()
  effect$ = this.actions$.ofType(BoardActionTypes.GetBoard);

  constructor(private actions$: Actions) { }
}
