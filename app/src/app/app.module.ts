import { NgModule, NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { BrowserModule } from "@angular/platform-browser";
import { RouterModule } from "@angular/router";
import { EffectsModule } from "@ngrx/effects";
import { StoreModule } from "@ngrx/store";
import { StoreDevtoolsModule } from "@ngrx/store-devtools";
import { AngularFireModule } from "angularfire2";
import { AngularFireAuthModule } from "angularfire2/auth";
import { AngularFireDatabaseModule } from "angularfire2/database";
import { AngularFirestoreModule } from "angularfire2/firestore";
import { environment } from "../environments/environment";
import { AuthGuard } from "../services/auth.guard";
import { AuthService } from "../services/auth.service";
import { NoAuthGuard } from "../services/noAuth.guard";
import { UserService } from "../services/user.service";
import { AppComponent } from "./app.component";
import { AppEffects } from "./app.effects";
import { appRoutes } from "./app.routes";
import { DiceComponent } from "./dice/dice.component";
import { GameControlsComponent } from "./game-controls/game-controls.component";
import { GameStatisticsComponent } from "./game-statistics/game-statistics.component";
import { GameComponent } from "./game/game.component";
import { GameHistoryComponent } from "./gamehistory/gamehistory.component";
import { GameresultComponent } from "./gameresult/gameresult.component";
import { LoginComponent } from "./login/login.component";
import { MainMenuComponent } from "./main-menu/main-menu.component";
import { PageNotFoundComponent } from "./page-not-found/page-not-found.component";
import { metaReducers, reducers } from "./reducers";
import { RegistrationComponent } from "./registration/registration.component";
import { SettingsModalComponent } from "./settings-modal/settings-modal.component";
import { SettingsComponent } from "./settings/settings.component";
import { StartNewGameComponent } from "./start-new-game/start-new-game.component";
import { UserComponent } from "./user/user.component";
import { UserResolver } from "./user/user.resolver";

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
    SettingsComponent,
    RegistrationComponent,
    LoginComponent,
    UserComponent
  ],
  entryComponents: [SettingsModalComponent], // dynamisch erzeugte Komponenten müssen hier rein
  imports: [
    BrowserModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forRoot(
      appRoutes,
      { enableTracing: false } // <-- debugging purposes only
    ),
    StoreModule.forRoot(reducers, { metaReducers }),
    !environment.production ? StoreDevtoolsModule.instrument() : [],
    EffectsModule.forRoot([AppEffects]),
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireDatabaseModule,
    AngularFireAuthModule,
    AngularFirestoreModule,
  ],
  providers: [AuthGuard, NoAuthGuard, UserService, AuthService, UserResolver],
  bootstrap: [AppComponent],
  schemas: [NO_ERRORS_SCHEMA]

})
export class AppModule { }

