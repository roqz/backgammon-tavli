import { Injectable } from "@angular/core";
import { AngularFireAuth } from "angularfire2/auth";
import * as firebase from "firebase/app";

@Injectable()
export class AuthService {
    constructor(public afAuth: AngularFireAuth) {

    }
    public async doRegister(value) {
        const res = await firebase.auth().createUserWithEmailAndPassword(value.email, value.password);
        return res;
    }

    public async doLogin(value) {
        const res = await firebase.auth().signInWithEmailAndPassword(value.email, value.password);
        return res;
    }

    public async doLogout() {
        return new Promise((resolve, reject) => {
            if (firebase.auth().currentUser) {
                this.afAuth.auth.signOut();
                resolve();
            } else {
                reject();
            }
        });
    }

    public async doGoogleLogin() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope("profile");
        provider.addScope("email");
        const res = await this.afAuth.auth
            .signInWithPopup(provider);
        return res;

    }

    public async doFacebookLogin() {
        return new Promise<any>((resolve, reject) => {
            const provider = new firebase.auth.FacebookAuthProvider();
            this.afAuth.auth
                .signInWithPopup(provider)
                .then(res => {
                    resolve(res);
                }, err => {
                    console.log(err);
                    reject(err);
                });
        });
    }

    public async doTwitterLogin() {
        return new Promise<any>((resolve, reject) => {
            const provider = new firebase.auth.TwitterAuthProvider();
            this.afAuth.auth
                .signInWithPopup(provider)
                .then(res => {
                    resolve(res);
                }, err => {
                    console.log(err);
                    reject(err);
                });
        });
    }

    public getUserToken() {
        return this.afAuth.idToken;
    }
}
