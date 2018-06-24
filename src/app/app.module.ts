import { BrowserModule } from "@angular/platform-browser";
import { NgModule, NO_ERRORS_SCHEMA } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { NgbModule } from "@ng-bootstrap/ng-bootstrap";

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
import { SettingsModalComponent } from "./settings-modal/settings-modal.component";
import { PageNotFoundComponent } from "./page-not-found/page-not-found.component";
import { MainMenuComponent } from "./main-menu/main-menu.component";
import { GameComponent } from "./game/game.component";
import { GameControlsComponent } from "./game-controls/game-controls.component";
import { StartNewGameComponent } from "./start-new-game/start-new-game.component";
import { GameStatisticsComponent } from "./game-statistics/game-statistics.component";
import { SettingsComponent } from "./settings/settings.component";

const appRoutes: Routes = [
  { path: "game", component: GameComponent },
  { path: "newGame", component: StartNewGameComponent },
  { path: "stats", component: GameStatisticsComponent },
  { path: "settings", component: SettingsComponent },
  {
    path: "menu",
    component: MainMenuComponent,
    data: { title: "Menu" }
  },
  {
    path: "",
    redirectTo: "/menu",
    pathMatch: "full"
  },
  { path: "**", component: PageNotFoundComponent }
];

@NgModule({
  declarations: [
    AppComponent,
    DiceComponent,
    GameHistoryComponent,
    GameresultComponent,
    GameComponent,
    MainMenuComponent,
    PageNotFoundComponent,
    SettingsModalComponent,
    GameComponent,
    GameControlsComponent,
    StartNewGameComponent,
    GameStatisticsComponent,
    SettingsComponent
  ],
  entryComponents: [SettingsModalComponent], // dynamisch erzeugte Komponenten müssen hier rein
  imports: [
    BrowserModule,
    NgbModule.forRoot(),
    RouterModule.forRoot(
      appRoutes,
      { enableTracing: true } // <-- debugging purposes only
    ),
    StoreModule.forRoot(reducers, { metaReducers }),
    !environment.production ? StoreDevtoolsModule.instrument() : [],
    EffectsModule.forRoot([AppEffects])
  ],
  providers: [],
  bootstrap: [AppComponent],
  schemas: [NO_ERRORS_SCHEMA]

})
export class AppModule { }

