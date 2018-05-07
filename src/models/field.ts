import { Checker } from "./checker";
import { Player } from "./player";
import * as _ from "lodash";

export class Field {
    public readonly number: number;
    public readonly checkers: Checker[];

    constructor(number: number) {
        this.number = number;
        this.checkers = [];
    }

    public hasCheckersOfPlayer(player: Player): boolean {
        this.checkers.forEach(c => {
            if (!c) {
                throw new Error(this.number + " field has null checker object");
            }
        });
        return _.find(this.checkers, c => c.color === player.color) != null;
    }
}
