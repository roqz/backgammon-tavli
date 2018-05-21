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
});
