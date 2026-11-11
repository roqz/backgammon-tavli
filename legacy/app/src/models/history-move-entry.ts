import { Move } from "./move";
import { Board } from "./board";

export class HistoryMoveEntry {
    public from: number;
    public to: number;
    public hit: boolean;
    constructor(move: Move, hit: boolean) {
        this.from = move.from;
        this.to = move.to;
        this.hit = hit;
    }

    public toString = (): string => {
        let from: string = "" + this.from;
        if (this.from === Board.offNumber) { from = "off"; }
        if (this.from === Board.barNumber) { from = "bar"; }
        let to: string = "" + this.to;
        if (this.to === Board.offNumber) { to = "off"; }
        if (this.to === Board.barNumber) { to = "bar"; }
        const move = `${from}/${to}`;
        const hit = this.hit === true ? "*" : "";
        return `${move}${hit}`;
    }
}
