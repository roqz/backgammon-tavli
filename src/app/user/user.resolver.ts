import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, Router } from "@angular/router";
import { UserModel } from "../../services/user.model";
import { UserService } from "../../services/user.service";

@Injectable()
export class UserResolver implements Resolve<UserModel> {

    constructor(public userService: UserService, private router: Router) { }

    resolve(route: ActivatedRouteSnapshot): Promise<UserModel> {

        const user = new UserModel();

        return new Promise((resolve, reject) => {
            this.userService.getCurrentUser()
                .then(res => {
                    if (res.providerData[0].providerId === "password") {
                        user.image = "http://dsi-vd.github.io/patternlab-vd/images/fpo_avatar.png";
                        user.name = res.displayName;
                        user.provider = res.providerData[0].providerId;
                        user.email = res.email;
                        return resolve(user);
                    } else {
                        user.image = res.photoURL;
                        user.name = res.displayName;
                        user.email = res.email;
                        user.provider = res.providerData[0].providerId;
                        return resolve(user);
                    }
                }, err => {
                    this.router.navigate(["/login"]);
                    return reject(err);
                });
        });
    }
}
