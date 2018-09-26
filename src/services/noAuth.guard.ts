import { Injectable } from "@angular/core";
import { CanActivate, Router } from "@angular/router";
import { AngularFireAuth } from "angularfire2/auth";
import { UserService } from "./user.service";


@Injectable()
export class NoAuthGuard implements CanActivate {

    constructor(
        public afAuth: AngularFireAuth,
        public userService: UserService,
        private router: Router
    ) { }

    public async canActivate(): Promise<boolean> {
        try {
            const user = await this.userService.getCurrentUser();
            //
            return true;
        } catch (ex) {
            this.router.navigate(["/login"]);
            return false;
        }
    }
}
