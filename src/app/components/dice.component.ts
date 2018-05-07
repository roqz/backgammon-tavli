import { Component, Input } from "@angular/core";

@Component({
    selector: "[dice-component]",
    templateUrl: "./dice.component.html",
    styleUrls: ["./dice.component.css"]
})
export class DiceComponent {
    @Input() value: number;
    @Input() x: number;
    @Input() y: number;
    @Input() color: string;

    private showBottomRightDot(): string {
        if (this.value === 2 || this.value === 3 || this.value === 4 || this.value === 5 || this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    private showMiddleRightDot(): string {
        if (this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    private showTopRightDot(): string {
        if (this.value === 4 || this.value === 5 || this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    private showTopLeftDot(): string {
        if (this.value === 2 || this.value === 3 || this.value === 4 || this.value === 5 || this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    private showMiddleLeftDot(): string {
        if (this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    private showBottomLeftDot(): string {
        if (this.value === 4 || this.value === 5 || this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    private showMiddleDot(): string {
        if (this.value === 1 || this.value === 3 || this.value === 5) {
            return "visible";
        }
        return "hidden";
    }
}
