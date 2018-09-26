import { Component, Input } from "@angular/core";

@Component({
    selector: "[dice-component]",
    templateUrl: "./dice.component.html",
    styleUrls: ["./dice.component.scss"]
})
export class DiceComponent {
    @Input() value: number;
    @Input() x: number;
    @Input() y: number;
    @Input() color: string;

    showBottomRightDot(): string {
        if (this.value === 2 || this.value === 3 || this.value === 4 || this.value === 5 || this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    showMiddleRightDot(): string {
        if (this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    showTopRightDot(): string {
        if (this.value === 4 || this.value === 5 || this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    showTopLeftDot(): string {
        if (this.value === 2 || this.value === 3 || this.value === 4 || this.value === 5 || this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    showMiddleLeftDot(): string {
        if (this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    showBottomLeftDot(): string {
        if (this.value === 4 || this.value === 5 || this.value === 6) {
            return "visible";
        }
        return "hidden";
    }
    showMiddleDot(): string {
        if (this.value === 1 || this.value === 3 || this.value === 5) {
            return "visible";
        }
        return "hidden";
    }
}
