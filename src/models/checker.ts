export class Checker {
    public readonly color: CheckerColor;

    constructor(color: CheckerColor) {
        this.color = color;
    }
}
export enum CheckerColor {
    BLACK, WHITE
}
