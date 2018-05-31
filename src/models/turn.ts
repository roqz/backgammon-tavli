import { HistoryMoveEntry } from "./history-move-entry";
import { Player } from "./player";
import * as _ from "lodash";

export class Turn {
    public doubleToRequest: number;
    public doubleToRequestAccept: boolean;
    constructor(public player: Player, public roll1: number, public roll2: number,
        public moves: HistoryMoveEntry[]) {

    }

    public toString = (): string => {
        if (this.roll1 === -1) { return ""; }
        if (this.doubleToRequest) {
            return `Double to ${this.doubleToRequest}`;
        }
        if (!this.roll1 && !this.roll2 && this.doubleToRequestAccept) {
            return `Take`;
        }
        if (!this.roll1 && !this.roll2 && !this.doubleToRequestAccept) {
            return `Pass`;
        }
        const rolls = `${this.roll1}${this.roll2}`;
        const movesGrouped = _.groupBy(_.map(this.moves, m => m.toString()), ms => ms);
        const moveParts: string[] = [];
        _.forEach(movesGrouped, m => {
            const numberOfSameMoves = m.length === 1 ? "" : ` (${m.length})`;
            moveParts.push(`${m[0]}${numberOfSameMoves}`);
        });
        const moves = moveParts.length > 0 ? _.join(moveParts, ", ") : "no play";
        return `${rolls}: ${moves}`;
    }
}
