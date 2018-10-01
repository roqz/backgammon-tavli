import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { AuthService } from "./auth.service";
import { SettingsService } from "./settings.service";

@Injectable()
export class PingService {
    private httpOptions: HttpHeaders;
    constructor(private authService: AuthService, private http: HttpClient, private settings: SettingsService) {
        this.authService.getUserToken().subscribe(userToken => this.httpOptions =
            new HttpHeaders().set(
                "Content-Type", "application/json").set(
                    "FIREBASE_AUTH_TOKEN", userToken)
        );
    }

    public ping() {
        return this.http.get(`${this.settings.apiUrl}ping`, { headers: this.httpOptions, responseType: "text" });

    }
}
