import { Component, Injectable, Input } from "@angular/core";
import { PingService } from "../../services/ping.service";

@Injectable()
@Component({
    selector: "settings-modal",
    templateUrl: "./settings-modal.component.html"

})
export class SettingsModalComponent {
    @Input() name;
    public serverConnection: any;
    public serverConnectionError: any;
    constructor(private pingService: PingService) { }

    public testServerConnection() {
        this.pingService.ping().subscribe(answer => {
            this.serverConnection = answer;
            console.log(answer);
        },
            error => this.serverConnectionError = error);
    }
}
