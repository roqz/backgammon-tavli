import { TestBed, async } from "@angular/core/testing";
import { GamerulesBackgammon } from "./gamerules-backgammon";
import { Board } from "./board";
import { Player } from "./player";
import { CheckerColor } from "./checker";
import { DiceService } from "../services/dice.service";
import { PlayerComputer } from "./player-computer";
import { PlayerHuman } from "./player-human";
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
        expect(rules.openRolls).toBeDefined();
    }));
    it("should return possible moves", async(() => {
        const rules = getRulesImplementation();
        const rulesAny: any = rules;
        expect(rules.getAllPossibleMoves(
            rulesAny.board, rulesAny.currentPlayer, rules.openRolls)).toBeDefined();
    }));

    function getRulesImplementation(): GamerulesBackgammon {
        const board = new Board();
        const p1 = new PlayerComputer("p1", CheckerColor.BLACK);
        const p2 = new PlayerHuman("p2", CheckerColor.WHITE);
        const diceService = new DiceService();
        const rules = new GamerulesBackgammon(board, p1, p2, diceService);
        return rules;
    }
});
