import { TestBed, async } from "@angular/core/testing";
import { DiceService } from "./dice.service";

describe("DiceService", () => {
    beforeEach(async(() => {

    }));
    it("should return number between 1 <= 6", async(() => {
        const dice = new DiceService();
        for (let i = 0; i < 20; i++) {
            const roll = dice.roll();
            expect(roll).toBeGreaterThan(0);
            expect(roll).toBeLessThan(7);
        }

    }));
    it("should have almost even distribution", async(() => {
        const dice = new DiceService();
        const rolls = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
        const numberOfROlls = 6000;
        for (let i = 0; i < numberOfROlls; i++) {
            const roll = dice.roll();
            rolls[roll]++;
        }
        let percent = rolls["1"] / numberOfROlls * 100;
        expect(percent).toBeGreaterThan(15);
        expect(percent).toBeLessThan(20);

        percent = rolls["2"] / numberOfROlls * 100;
        expect(percent).toBeGreaterThan(15);
        expect(percent).toBeLessThan(20);

        percent = rolls["3"] / numberOfROlls * 100;
        expect(percent).toBeGreaterThan(15);
        expect(percent).toBeLessThan(20);

        percent = rolls["4"] / numberOfROlls * 100;
        expect(percent).toBeGreaterThan(15);
        expect(percent).toBeLessThan(20);

        percent = rolls["5"] / numberOfROlls * 100;
        expect(percent).toBeGreaterThan(15);
        expect(percent).toBeLessThan(20);

        percent = rolls["6"] / numberOfROlls * 100;
        expect(percent).toBeGreaterThan(15);
        expect(percent).toBeLessThan(20);
    }));
});

