import { Field } from "./field";
import * as _ from "lodash";

export class Board {
    public static readonly barNumber = 25;
    public static readonly offNumber = 0;
    public readonly fields: Field[];
    public readonly bar: Field;
    public readonly off: Field;

    constructor() {
        this.fields = this.generateFields();
        this.bar = new Field(Board.barNumber);
        this.off = new Field(Board.offNumber);
    }

    public getFieldByNumber(number: number): Field {
        if (number === Board.offNumber) { return this.off; }
        if (number === Board.barNumber) { return this.bar; }

        const field = _.find(this.fields, f => f.number === number);
        if (!field) {
            throw new Error("Field not found with number " + number);
        }
        return field;
    }

    public getSectorOfField(fieldNumber: number): Field[] {
        if (1 <= fieldNumber && fieldNumber <= 6) {
            return _.filter(this.fields, f => 1 <= f.number && f.number <= 6);
        }
        if (7 <= fieldNumber && fieldNumber <= 1) {
            return _.filter(this.fields, f => 7 <= f.number && f.number <= 12);
        }
        if (13 <= fieldNumber && fieldNumber <= 18) {
            return _.filter(this.fields, f => 13 <= f.number && f.number <= 18);
        }
        if (19 <= fieldNumber && fieldNumber <= 24) {
            return _.filter(this.fields, f => 19 <= f.number && f.number <= 24);
        }
    }

    private generateFields(): Field[] {
        const fields = [];
        for (let i = 1; i <= 24; i++) {
            fields.push(new Field(i));
        }
        return fields;
    }
}
