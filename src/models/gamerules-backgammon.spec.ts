import { TestBed, async, ComponentFixture } from "@angular/core/testing";
import { GamerulesBackgammon } from "./gamerules-backgammon";
import { Board } from "./board";
import { Player } from "./player";
import { CheckerColor } from "./checker";
import { DiceService } from "../services/dice.service";
import { PlayerComputer } from "./player-computer";
import { PlayerHuman } from "./player-human";
import { Store, StoreModule } from "@ngrx/store";
import { State, reducers } from "../app/reducers";
describe("Gamerules", () => {
    let rules: GamerulesBackgammon;
    let store: Store<State>;
    let diceService: DiceService;
    let board: Board;
    let p1: Player;
    let p2: Player;


    beforeEach((async () => {
        TestBed.configureTestingModule({
            providers: [DiceService],
            imports: [
                StoreModule.forRoot({ ...reducers }),
            ]
        }).compileComponents();
    }));
    beforeEach((() => {
        board = new Board();
        p1 = new PlayerComputer("p1", CheckerColor.BLACK);
        p2 = new PlayerHuman("p2", CheckerColor.WHITE);
        store = TestBed.get(Store);
        diceService = TestBed.get(DiceService);
        rules = new GamerulesBackgammon(board, p1, p2, diceService, store);
        // store.dispatch({ type: ACTIONS.LOAD_DATA, payload: mockData });
    }));
    it("should create gamerules with given parameters", async(() => {
        expect(rules).toBeDefined();
    }));
    it("should return current player", async(() => {
        expect((rules as any).currentPlayer).toBeDefined();
    }));
    it("should return open dice rolls", async(() => {
        expect(rules.openRolls).toBeDefined();
    }));
    it("should return possible moves", async(() => {
        const rulesAny: any = rules;
        expect(rules.getAllPossibleMoves(
            rulesAny.board, rulesAny.currentPlayer, rules.openRolls)).toBeDefined();
    }));
    it("should return one point for winner", () => {

    });
    it("should return two points for winner of gammon", () => {

    });
    it("should return three points for winner of backgammon", () => {

    });
    it("should calculate correct possible moves", () => {
        const boardWithState: any = new Board();
        // tslint:disable-next-line:max-line-length
        boardWithState.fields = [{ "number": 1, "checkers": [{ "color": 0, "idNumber": 6 }, { "color": 0, "idNumber": 5 }] }, { "number": 2, "checkers": [{ "color": 0, "idNumber": 2 }, { "color": 0, "idNumber": 11 }, { "color": 0, "idNumber": 14 }, { "color": 0, "idNumber": 7 }, { "color": 0, "idNumber": 8 }] }, { "number": 3, "checkers": [{ "color": 0, "idNumber": 13 }, { "color": 0, "idNumber": 12 }, { "color": 0, "idNumber": 10 }, { "color": 0, "idNumber": 3 }] }, { "number": 4, "checkers": [{ "color": 0, "idNumber": 4 }, { "color": 0, "idNumber": 9 }] }, { "number": 5, "checkers": [] }, { "number": 6, "checkers": [] }, { "number": 7, "checkers": [] }, { "number": 8, "checkers": [] }, { "number": 9, "checkers": [] }, { "number": 10, "checkers": [] }, { "number": 11, "checkers": [] }, { "number": 12, "checkers": [] }, { "number": 13, "checkers": [] }, { "number": 14, "checkers": [] }, { "number": 15, "checkers": [{ "color": 1, "idNumber": 3 }] }, { "number": 16, "checkers": [] }, { "number": 17, "checkers": [{ "color": 1, "idNumber": 7 }, { "color": 1, "idNumber": 12 }, { "color": 1, "idNumber": 4 }] }, { "number": 18, "checkers": [{ "color": 1, "idNumber": 6 }, { "color": 1, "idNumber": 5 }, { "color": 1, "idNumber": 0 }, { "color": 1, "idNumber": 2 }] }, { "number": 19, "checkers": [{ "color": 1, "idNumber": 10 }, { "color": 1, "idNumber": 11 }] }, { "number": 20, "checkers": [] }, { "number": 21, "checkers": [{ "color": 1, "idNumber": 9 }, { "color": 1, "idNumber": 14 }, { "color": 1, "idNumber": 1 }] }, { "number": 22, "checkers": [] }, { "number": 23, "checkers": [{ "color": 1, "idNumber": 13 }, { "color": 1, "idNumber": 8 }] }, { "number": 24, "checkers": [{ "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }] }];
        boardWithState.bar = { "number": 25, "checkers": [] };
        boardWithState.off = { "number": 0, "checkers": [] };
        rules = new GamerulesBackgammon(boardWithState, p1, p2, diceService, store);

        const possibleMoves = rules.getAllPossibleMoves(boardWithState, p1, [5, 6]);
        expect(possibleMoves).toBeDefined();
        expect(possibleMoves.length).toBeGreaterThan(0);
    });
});
