export class Move {
    public readonly from: number;
    public readonly to: number;
    public readonly roll: number;

    constructor(from: number, to: number, roll: number) {
        this.from = from;
        this.to = to;
        this.roll = roll;
    }
}
