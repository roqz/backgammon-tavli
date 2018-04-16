import { Field } from "./field";
import _ = require("lodash");

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

    private generateFields(): Field[] {
        const fields = [];
        for (let i = 1; i <= 24; i++) {
            fields.push(new Field(i));
        }
        return fields;
    }
}
