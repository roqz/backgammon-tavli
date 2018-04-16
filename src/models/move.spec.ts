import { TestBed, async } from "@angular/core/testing";
import { Move } from "./move";
describe("Move", () => {
    beforeEach(async(() => {

    }));
    it("should create move with given from and to", async(() => {
        const move = new Move(1, 3, 2);
        expect(move).toBeTruthy();
        expect(move.from).toEqual(1);
        expect(move.to).toEqual(3);
        expect(move.roll).toEqual(2);
    }));
});
