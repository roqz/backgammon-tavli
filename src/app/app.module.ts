import { BrowserModule } from "@angular/platform-browser";
import { NgModule, NO_ERRORS_SCHEMA } from "@angular/core";


import { AppComponent } from "./app.component";
import { DiceComponent } from "./dice/dice.component";
import { StoreModule } from "@ngrx/store";
import { reducers, metaReducers } from "./reducers";
import { StoreDevtoolsModule } from "@ngrx/store-devtools";
import { environment } from "../environments/environment";
import { EffectsModule } from "@ngrx/effects";
import { AppEffects } from "./app.effects";
import { GameHistoryComponent } from "./gamehistory/gamehistory.component";
import { GameresultComponent } from "./gameresult/gameresult.component";


@NgModule({
  declarations: [
    AppComponent,
    DiceComponent,
    GameHistoryComponent,
    GameresultComponent
  ],
  imports: [
    BrowserModule,
    StoreModule.forRoot(reducers, { metaReducers }),
    !environment.production ? StoreDevtoolsModule.instrument() : [],
    EffectsModule.forRoot([AppEffects])
  ],
  providers: [],
  bootstrap: [AppComponent],
  schemas: [NO_ERRORS_SCHEMA]

})
export class AppModule { }
