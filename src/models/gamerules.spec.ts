import { TestBed, async } from "@angular/core/testing";
import { Gamerules } from "./gamerules";
import { Board } from "./board";
import { Player } from "./player";
import { CheckerColor } from "./checker";
import { DiceService } from "../services/dice.service";
describe("Gamerules", () => {

    beforeEach(async(() => {

    }));
    it("should create gamerules with given parameters", async(() => {
        const rules = getRulesImplementation();
        expect(rules).toBeDefined();
    }));
    it("should return current player", async(() => {
        const rules = getRulesImplementation();
        expect((rules as any).currentPlayer).toBeDefined();
    }));
    it("should return open dice rolls", async(() => {
        const rules = getRulesImplementation();
        expect(rules.getOpenRollsOrRoll((rules as any).currentPlayer)).toBeDefined();
    }));
    it("should return possible moves", async(() => {
        const rules = getRulesImplementation();
        const rulesAny: any = rules;
        expect(rules.getAllPossibleMoves(
            rulesAny.board, rulesAny.currentPlayer, rules.getOpenRollsOrRoll(rulesAny.currentPlayer))).toBeDefined();
    }));

    function getRulesImplementation(): Gamerules {
        const board = new Board();
        const p1 = new Player("p1", CheckerColor.BLACK);
        const p2 = new Player("p2", CheckerColor.WHITE);
        const diceService = new DiceService();
        const rules = new Gamerules(board, p1, p2, diceService);
        return rules;
    }
});
