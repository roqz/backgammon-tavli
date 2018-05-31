import { Component, Input } from "@angular/core";
import { Turn } from "../../models/turn";

@Component({
    selector: "game-history-component",
    templateUrl: "./gamehistory.component.html",
    styleUrls: ["./gamehistory.component.css"]
})
export class GameHistoryComponent {
    @Input() history: Turn[];
}
