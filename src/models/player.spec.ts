import { TestBed, async } from "@angular/core/testing";
import { Player } from "./player";
import { CheckerColor } from "./checker";
describe("Player", () => {
    beforeEach(async(() => {

    }));
    it("should create player with given name and color", async(() => {
        const player = new Player("P1", CheckerColor.WHITE);
        expect(player).toBeTruthy();
        expect(player.name).toEqual("P1");
        expect(player.color).toEqual(CheckerColor.WHITE);
    }));
    it("should create player with 15 checkers", async(() => {
        const player = new Player("P1", CheckerColor.WHITE);
        expect(player.checkers).toBeDefined();
        expect(player.checkers.length).toEqual(15);
    }));
    it("should create player with checkers in player color", async(() => {
        const player = new Player("P1", CheckerColor.WHITE);
        expect(player.checkers[0].color).toEqual(CheckerColor.WHITE);
    }));
    it("should return correct black player color as string", async(() => {
        const player = new Player("P1", CheckerColor.BLACK);
        expect(player.colorString).toEqual("black");
    }));
    it("should return correct white player color as string", async(() => {
        const player = new Player("P1", CheckerColor.WHITE);
        expect(player.colorString).toEqual("white");
    }));
    it("should return correct opponent color", async(() => {
        const player = new Player("P1", CheckerColor.WHITE);
        expect(player.getOpponentColor()).toEqual(CheckerColor.BLACK);
        const playerB = new Player("P1", CheckerColor.BLACK);
        expect(playerB.getOpponentColor()).toEqual(CheckerColor.WHITE);
    }));
});
