import { Injectable } from "@angular/core";
import { AngularFireAuth } from "angularfire2/auth";
import { AngularFirestore } from "angularfire2/firestore";
import * as firebase from "firebase/app";
import "rxjs/add/operator/toPromise";

@Injectable()
export class UserService {

    constructor(
        public db: AngularFirestore,
        public afAuth: AngularFireAuth
    ) {
    }


    public async getCurrentUser(): Promise<firebase.User> {
        return new Promise<any>((resolve, reject) => {
            firebase.auth().onAuthStateChanged(function (user) {
                if (user) {
                    resolve(user);
                } else {
                    reject("No user logged in");
                }
            });
        });
    }

    public async updateCurrentUser(value): Promise<any> {
        return new Promise((resolve, reject) => {
            const user = firebase.auth().currentUser;
            user.updateProfile({
                displayName: value.name,
                photoURL: user.photoURL
            }).then(res => {
                resolve();
            }, err => reject(err));
        });
    }
}
