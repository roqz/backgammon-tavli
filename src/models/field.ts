import { Checker } from "./checker";

export class Field {
    public readonly number: number;
    public readonly checkers: Checker[];

    constructor(number: number) {
        this.number = number;
        this.checkers = [];
    }
}
