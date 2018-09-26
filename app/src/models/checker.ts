export class Checker {
    public readonly color: CheckerColor;
    private idNumber: number;
    public get id(): string {
        return `${this.color}${this.idNumber}`;
    }
    constructor(color: CheckerColor, id: number) {
        this.color = color;
        this.idNumber = id;
    }
}
export enum CheckerColor {
    BLACK, WHITE
}
