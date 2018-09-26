import { Routes } from "@angular/router";
import { AuthGuard } from "../services/auth.guard";
import { NoAuthGuard } from "../services/noAuth.guard";
import { GameStatisticsComponent } from "./game-statistics/game-statistics.component";
import { GameComponent } from "./game/game.component";
import { LoginComponent } from "./login/login.component";
import { MainMenuComponent } from "./main-menu/main-menu.component";
import { PageNotFoundComponent } from "./page-not-found/page-not-found.component";
import { RegistrationComponent } from "./registration/registration.component";
import { SettingsComponent } from "./settings/settings.component";
import { StartNewGameComponent } from "./start-new-game/start-new-game.component";
import { UserComponent } from "./user/user.component";
import { UserResolver } from "./user/user.resolver";
export const appRoutes: Routes = [
    { path: "game", component: GameComponent, canActivate: [NoAuthGuard] },
    { path: "newGame", component: StartNewGameComponent, canActivate: [NoAuthGuard] },
    { path: "stats", component: GameStatisticsComponent, canActivate: [NoAuthGuard] },
    { path: "settings", component: SettingsComponent, canActivate: [NoAuthGuard] },
    {
        path: "menu",
        component: MainMenuComponent,
        data: { title: "Menu" }
    },
    // {
    //     path: "",
    //     redirectTo: "/menu",
    //     pathMatch: "full"
    // },
    { path: "", redirectTo: "login", pathMatch: "full" },
    { path: "login", component: LoginComponent, canActivate: [AuthGuard] },
    { path: "register", component: RegistrationComponent, canActivate: [AuthGuard] },
    { path: "user", component: UserComponent, resolve: { data: UserResolver }, canActivate: [NoAuthGuard] },
    { path: "**", component: PageNotFoundComponent }
];
//  { path: '', redirectTo: 'login', pathMatch: 'full' },
