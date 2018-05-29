import { TestBed } from "@angular/core/testing";
import { Store, StoreModule } from "@ngrx/store";
import { State, reducers } from "../app/reducers";
import { DiceService } from "../services/dice.service";
import { Board } from "./board";
import { CheckerColor } from "./checker";
import { GamerulesBackgammon } from "./gamerules-backgammon";
import { Player } from "./player";
import { PlayerComputer } from "./player-computer";
import { PlayerHuman } from "./player-human";
describe("Gamerules", () => {
    let rules: GamerulesBackgammon;
    let store: Store<State>;
    let diceService: DiceService;
    let board: Board;
    let p1: Player;
    let p2: Player;


    beforeEach((() => {
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
    it("should create gamerules with given parameters", (() => {
        expect(rules).toBeDefined();
    }));
    it("should return current player", (() => {
        expect((rules as any).currentPlayer).toBeDefined();
    }));
    it("should return open dice rolls", (() => {
        expect(rules.openRolls).toBeDefined();
    }));
    it("should return possible moves", (() => {
        const rulesAny: any = rules;
        expect(rules.getAllPossibleMoves(
            rulesAny.board, rulesAny.currentPlayer, rules.openRolls)).toBeDefined();
    }));
    it("should return Gameresult if game is over", () => {
        const boardWithState: any = new Board();
        // tslint:disable-next-line:max-line-length
        boardWithState.fields = [{ "number": 1, "checkers": [] }, { "number": 2, "checkers": [] }, { "number": 3, "checkers": [] }, { "number": 4, "checkers": [] }, { "number": 5, "checkers": [] }, { "number": 6, "checkers": [] }, { "number": 7, "checkers": [] }, { "number": 8, "checkers": [] }, { "number": 9, "checkers": [] }, { "number": 10, "checkers": [] }, { "number": 11, "checkers": [] }, { "number": 12, "checkers": [] }, { "number": 13, "checkers": [] }, { "number": 14, "checkers": [] }, { "number": 15, "checkers": [] }, { "number": 16, "checkers": [] }, { "number": 17, "checkers": [] }, { "number": 18, "checkers": [] }, { "number": 19, "checkers": [] }, { "number": 20, "checkers": [] }, { "number": 21, "checkers": [] }, { "number": 22, "checkers": [] },
        { "number": 23, "checkers": [] },
        { "number": 24, "checkers": [] }];
        boardWithState.bar = { "number": 25, "checkers": [] };
        // tslint:disable-next-line:max-line-length
        boardWithState.off = { "number": 0, "checkers": [{ "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }, { "color": 0, "idNumber": 2 }, { "color": 0, "idNumber": 3 }, { "color": 0, "idNumber": 4 }, { "color": 0, "idNumber": 5 }, { "color": 0, "idNumber": 6 }, { "color": 0, "idNumber": 7 }, { "color": 0, "idNumber": 8 }, { "color": 0, "idNumber": 9 }, { "color": 0, "idNumber": 10 }, { "color": 0, "idNumber": 11 }, { "color": 0, "idNumber": 12 }, { "color": 0, "idNumber": 13 }, { "color": 0, "idNumber": 14 }] };
        rules = new GamerulesBackgammon(new Board(), p1, p2, diceService, store);
        rules["_currentPlayer"] = p1;
        rules["board"] = boardWithState;
        const result = rules.getResult();
        expect(result).toBeDefined();
        expect(result.points).toBeGreaterThan(0);
        expect(result.history.length).toBeGreaterThan(0);
        expect(result.winner.color).toBe(p1.color);
    });
    it("should return one point for winner", () => {
        const boardWithState: any = new Board();
        // tslint:disable-next-line:max-line-length
        boardWithState.fields = [{ "number": 1, "checkers": [] }, { "number": 2, "checkers": [] }, { "number": 3, "checkers": [] }, { "number": 4, "checkers": [] }, { "number": 5, "checkers": [] }, { "number": 6, "checkers": [] }, { "number": 7, "checkers": [] }, { "number": 8, "checkers": [] }, { "number": 9, "checkers": [] }, { "number": 10, "checkers": [] }, { "number": 11, "checkers": [] }, { "number": 12, "checkers": [] }, { "number": 13, "checkers": [] }, { "number": 14, "checkers": [] }, { "number": 15, "checkers": [] }, { "number": 16, "checkers": [] }, { "number": 17, "checkers": [] }, { "number": 18, "checkers": [] }, { "number": 19, "checkers": [] }, { "number": 20, "checkers": [] }, { "number": 21, "checkers": [] }, { "number": 22, "checkers": [] },
        { "number": 23, "checkers": [] },
        { "number": 24, "checkers": [{ "color": 1, "idNumber": 0 }] }];
        boardWithState.bar = { "number": 25, "checkers": [] };
        // tslint:disable-next-line:max-line-length
        boardWithState.off = { "number": 0, "checkers": [{ "color": 1, "idNumber": 1 }, { "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }, { "color": 0, "idNumber": 2 }, { "color": 0, "idNumber": 3 }, { "color": 0, "idNumber": 4 }, { "color": 0, "idNumber": 5 }, { "color": 0, "idNumber": 6 }, { "color": 0, "idNumber": 7 }, { "color": 0, "idNumber": 8 }, { "color": 0, "idNumber": 9 }, { "color": 0, "idNumber": 10 }, { "color": 0, "idNumber": 11 }, { "color": 0, "idNumber": 12 }, { "color": 0, "idNumber": 13 }, { "color": 0, "idNumber": 14 }] };
        rules = new GamerulesBackgammon(new Board(), p1, p2, diceService, store);
        rules["_currentPlayer"] = p1;
        rules["board"] = boardWithState;
        const result = rules.getResult();
        expect(result.points).toBe(1);
    });
    it("should return two points for winner of gammon if no checker in off", () => {
        const boardWithState: any = new Board();
        // tslint:disable-next-line:max-line-length
        boardWithState.fields = [{ "number": 1, "checkers": [] }, { "number": 2, "checkers": [] }, { "number": 3, "checkers": [] }, { "number": 4, "checkers": [] }, { "number": 5, "checkers": [] }, { "number": 6, "checkers": [] }, { "number": 7, "checkers": [] }, { "number": 8, "checkers": [] }, { "number": 9, "checkers": [] }, { "number": 10, "checkers": [] }, { "number": 11, "checkers": [] }, { "number": 12, "checkers": [] }, { "number": 13, "checkers": [] }, { "number": 14, "checkers": [] }, { "number": 15, "checkers": [] }, { "number": 16, "checkers": [] }, { "number": 17, "checkers": [] }, { "number": 18, "checkers": [] }, { "number": 19, "checkers": [] }, { "number": 20, "checkers": [] }, { "number": 21, "checkers": [] }, { "number": 22, "checkers": [] },
        { "number": 23, "checkers": [] },
        { "number": 24, "checkers": [{ "color": 1, "idNumber": 0 }] }];
        boardWithState.bar = { "number": 25, "checkers": [] };
        // tslint:disable-next-line:max-line-length
        boardWithState.off = { "number": 0, "checkers": [{ "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }, { "color": 0, "idNumber": 2 }, { "color": 0, "idNumber": 3 }, { "color": 0, "idNumber": 4 }, { "color": 0, "idNumber": 5 }, { "color": 0, "idNumber": 6 }, { "color": 0, "idNumber": 7 }, { "color": 0, "idNumber": 8 }, { "color": 0, "idNumber": 9 }, { "color": 0, "idNumber": 10 }, { "color": 0, "idNumber": 11 }, { "color": 0, "idNumber": 12 }, { "color": 0, "idNumber": 13 }, { "color": 0, "idNumber": 14 }] };
        rules = new GamerulesBackgammon(new Board(), p1, p2, diceService, store);
        rules["_currentPlayer"] = p1;
        rules["board"] = boardWithState;
        const result = rules.getResult();
        expect(result.points).toBe(2);
    });
    it("should return three points for winner of backgammon if checker on bar", () => {
        const boardWithState: any = new Board();
        // tslint:disable-next-line:max-line-length
        boardWithState.fields = [{ "number": 1, "checkers": [] }, { "number": 2, "checkers": [] }, { "number": 3, "checkers": [] }, { "number": 4, "checkers": [] }, { "number": 5, "checkers": [] }, { "number": 6, "checkers": [] }, { "number": 7, "checkers": [] }, { "number": 8, "checkers": [] }, { "number": 9, "checkers": [] }, { "number": 10, "checkers": [] }, { "number": 11, "checkers": [] }, { "number": 12, "checkers": [] }, { "number": 13, "checkers": [] }, { "number": 14, "checkers": [] }, { "number": 15, "checkers": [] }, { "number": 16, "checkers": [] }, { "number": 17, "checkers": [] }, { "number": 18, "checkers": [] }, { "number": 19, "checkers": [] }, { "number": 20, "checkers": [] }, { "number": 21, "checkers": [] }, { "number": 22, "checkers": [] },
        { "number": 23, "checkers": [] },
        { "number": 24, "checkers": [] }];
        boardWithState.bar = { "number": 25, "checkers": [{ "color": 1, "idNumber": 0 }] };
        // tslint:disable-next-line:max-line-length
        boardWithState.off = { "number": 0, "checkers": [{ "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }, { "color": 0, "idNumber": 2 }, { "color": 0, "idNumber": 3 }, { "color": 0, "idNumber": 4 }, { "color": 0, "idNumber": 5 }, { "color": 0, "idNumber": 6 }, { "color": 0, "idNumber": 7 }, { "color": 0, "idNumber": 8 }, { "color": 0, "idNumber": 9 }, { "color": 0, "idNumber": 10 }, { "color": 0, "idNumber": 11 }, { "color": 0, "idNumber": 12 }, { "color": 0, "idNumber": 13 }, { "color": 0, "idNumber": 14 }] };
        rules = new GamerulesBackgammon(new Board(), p1, p2, diceService, store);
        rules["_currentPlayer"] = p1;
        rules["board"] = boardWithState;
        const result = rules.getResult();
        expect(result.points).toBe(3);
    });
    it("should return three points for winner of backgammon if checker in home sector", () => {
        const boardWithState: any = new Board();
        // tslint:disable-next-line:max-line-length
        boardWithState.fields = [{ "number": 1, "checkers": [{ "color": 1, "idNumber": 0 }] }, { "number": 2, "checkers": [] }, { "number": 3, "checkers": [] }, { "number": 4, "checkers": [] }, { "number": 5, "checkers": [] }, { "number": 6, "checkers": [] }, { "number": 7, "checkers": [] }, { "number": 8, "checkers": [] }, { "number": 9, "checkers": [] }, { "number": 10, "checkers": [] }, { "number": 11, "checkers": [] }, { "number": 12, "checkers": [] }, { "number": 13, "checkers": [] }, { "number": 14, "checkers": [] }, { "number": 15, "checkers": [] }, { "number": 16, "checkers": [] }, { "number": 17, "checkers": [] }, { "number": 18, "checkers": [] }, { "number": 19, "checkers": [] }, { "number": 20, "checkers": [] }, { "number": 21, "checkers": [] }, { "number": 22, "checkers": [] },
        { "number": 23, "checkers": [] },
        { "number": 24, "checkers": [] }];
        boardWithState.bar = { "number": 25, "checkers": [] };
        // tslint:disable-next-line:max-line-length
        boardWithState.off = { "number": 0, "checkers": [{ "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }, { "color": 0, "idNumber": 2 }, { "color": 0, "idNumber": 3 }, { "color": 0, "idNumber": 4 }, { "color": 0, "idNumber": 5 }, { "color": 0, "idNumber": 6 }, { "color": 0, "idNumber": 7 }, { "color": 0, "idNumber": 8 }, { "color": 0, "idNumber": 9 }, { "color": 0, "idNumber": 10 }, { "color": 0, "idNumber": 11 }, { "color": 0, "idNumber": 12 }, { "color": 0, "idNumber": 13 }, { "color": 0, "idNumber": 14 }] };
        rules = new GamerulesBackgammon(new Board(), p1, p2, diceService, store);
        rules["_currentPlayer"] = p1;
        rules["board"] = boardWithState;
        const result = rules.getResult();
        expect(result.points).toBe(3);
    });
    it("should enforce higher roll if only one move can be made 1", () => {
        const boardWithState: any = new Board();
        boardWithState.fields = [
            // tslint:disable-next-line:max-line-length
            { "number": 1, "checkers": [{ "color": 0, "idNumber": 6 }, { "color": 0, "idNumber": 7 }, { "color": 0, "idNumber": 5 }, { "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }, { "color": 0, "idNumber": 2 }, { "color": 0, "idNumber": 3 }, { "color": 0, "idNumber": 4 }, { "color": 0, "idNumber": 9 }, { "color": 0, "idNumber": 10 }, { "color": 0, "idNumber": 11 }, { "color": 0, "idNumber": 12 }, { "color": 0, "idNumber": 13 }, { "color": 0, "idNumber": 14 }] },
            { "number": 2, "checkers": [] },
            { "number": 3, "checkers": [] },
            { "number": 4, "checkers": [] },
            { "number": 5, "checkers": [] },
            { "number": 6, "checkers": [] },
            { "number": 7, "checkers": [] },
            { "number": 8, "checkers": [] },
            { "number": 9, "checkers": [] },
            { "number": 10, "checkers": [] },
            { "number": 11, "checkers": [] },
            { "number": 12, "checkers": [] },
            { "number": 13, "checkers": [{ "color": 1, "idNumber": 14 }] },
            { "number": 14, "checkers": [{ "color": 1, "idNumber": 12 }, { "color": 1, "idNumber": 13 }] },
            { "number": 15, "checkers": [] },
            { "number": 16, "checkers": [{ "color": 1, "idNumber": 0 }, { "color": 1, "idNumber": 1 }] },
            { "number": 17, "checkers": [{ "color": 1, "idNumber": 2 }, { "color": 1, "idNumber": 11 }] },
            { "number": 18, "checkers": [{ "color": 1, "idNumber": 3 }, { "color": 1, "idNumber": 4 }] },
            { "number": 19, "checkers": [{ "color": 1, "idNumber": 5 }, { "color": 1, "idNumber": 6 }] },
            { "number": 20, "checkers": [{ "color": 1, "idNumber": 7 }, { "color": 1, "idNumber": 8 }] },
            { "number": 21, "checkers": [{ "color": 1, "idNumber": 9 }, { "color": 1, "idNumber": 10 }] },
            { "number": 22, "checkers": [] },
            { "number": 23, "checkers": [] },
            { "number": 24, "checkers": [{ "color": 0, "idNumber": 8 }] }];
        boardWithState.bar = { "number": 25, "checkers": [] };
        // tslint:disable-next-line:max-line-length
        boardWithState.off = { "number": 0, "checkers": [] };
        rules = new GamerulesBackgammon(new Board(), p1, p2, diceService, store);
        rules["_currentPlayer"] = p1;
        rules["board"] = boardWithState;

        const possibleMoves = rules.getAllPossibleMoves(boardWithState, p1, [1, 2]);
        expect(possibleMoves.length).toBe(1);
        const move = possibleMoves[0];
        expect(move.from).toBe(24);
        expect(move.to).toBe(22);
        // es sind nur zwei Züge möglich: 24/22 und 24/23. Daher muss der höhere Wurf gespielt werden.
    });

    it("should enforce move that enables second if otherwise only one is possible", () => {
        const boardWithState: any = new Board();
        // tslint:disable-next-line:max-line-length
        boardWithState.fields = [
            { "number": 1, "checkers": [{ "color": 1, "idNumber": 12 }, { "color": 1, "idNumber": 13 }] },
            { "number": 2, "checkers": [{ "color": 0, "idNumber": 5 }] },
            { "number": 3, "checkers": [] },
            { "number": 4, "checkers": [{ "color": 0, "idNumber": 6 }, { "color": 0, "idNumber": 7 }] },
            { "number": 5, "checkers": [] },
            { "number": 6, "checkers": [{ "color": 0, "idNumber": 8 }] },
            { "number": 7, "checkers": [] },
            { "number": 8, "checkers": [] },
            { "number": 9, "checkers": [] },
            { "number": 10, "checkers": [] },
            { "number": 11, "checkers": [] },
            { "number": 12, "checkers": [] },
            { "number": 13, "checkers": [{ "color": 1, "idNumber": 14 }] },
            { "number": 14, "checkers": [] },
            { "number": 15, "checkers": [] },
            { "number": 16, "checkers": [{ "color": 1, "idNumber": 0 }, { "color": 1, "idNumber": 1 }] },
            { "number": 17, "checkers": [{ "color": 1, "idNumber": 2 }, { "color": 1, "idNumber": 11 }] },
            { "number": 18, "checkers": [{ "color": 1, "idNumber": 3 }, { "color": 1, "idNumber": 4 }] },
            { "number": 19, "checkers": [{ "color": 1, "idNumber": 5 }, { "color": 1, "idNumber": 6 }] },
            { "number": 20, "checkers": [{ "color": 1, "idNumber": 7 }, { "color": 1, "idNumber": 8 }] },
            { "number": 21, "checkers": [{ "color": 1, "idNumber": 9 }, { "color": 1, "idNumber": 10 }] },
            { "number": 22, "checkers": [] },
            { "number": 23, "checkers": [] },
            { "number": 24, "checkers": [] }];
        boardWithState.bar = { "number": 25, "checkers": [] };
        // tslint:disable-next-line:max-line-length
        boardWithState.off = { "number": 0, "checkers": [{ "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }, { "color": 0, "idNumber": 2 }, { "color": 0, "idNumber": 3 }, { "color": 0, "idNumber": 4 }, { "color": 0, "idNumber": 9 }, { "color": 0, "idNumber": 10 }, { "color": 0, "idNumber": 11 }, { "color": 0, "idNumber": 12 }, { "color": 0, "idNumber": 13 }, { "color": 0, "idNumber": 14 }] };
        rules = new GamerulesBackgammon(new Board(), p1, p2, diceService, store);
        rules["_currentPlayer"] = p1;
        rules["board"] = boardWithState;

        const possibleMoves = rules.getAllPossibleMoves(boardWithState, p1, [6, 3]);
        expect(possibleMoves.length).toBe(1);
        const move = possibleMoves[0];
        expect(move.from).toBe(6);
        expect(move.to).toBe(3);
        // damit beide züge gespielt werden können muss zuerst 6/3 gespielt werden, damit danach mit der 6 noch 4/0 geht
    });
    it("should calculate correct possible moves 1", () => {
        const boardWithState: any = new Board();
        // tslint:disable-next-line:max-line-length
        boardWithState.fields = [{ "number": 1, "checkers": [{ "color": 0, "idNumber": 6 }, { "color": 0, "idNumber": 5 }] }, { "number": 2, "checkers": [{ "color": 0, "idNumber": 2 }, { "color": 0, "idNumber": 11 }, { "color": 0, "idNumber": 14 }, { "color": 0, "idNumber": 7 }, { "color": 0, "idNumber": 8 }] }, { "number": 3, "checkers": [{ "color": 0, "idNumber": 13 }, { "color": 0, "idNumber": 12 }, { "color": 0, "idNumber": 10 }, { "color": 0, "idNumber": 3 }] }, { "number": 4, "checkers": [{ "color": 0, "idNumber": 4 }, { "color": 0, "idNumber": 9 }] }, { "number": 5, "checkers": [] }, { "number": 6, "checkers": [] }, { "number": 7, "checkers": [] }, { "number": 8, "checkers": [] }, { "number": 9, "checkers": [] }, { "number": 10, "checkers": [] }, { "number": 11, "checkers": [] }, { "number": 12, "checkers": [] }, { "number": 13, "checkers": [] }, { "number": 14, "checkers": [] }, { "number": 15, "checkers": [{ "color": 1, "idNumber": 3 }] }, { "number": 16, "checkers": [] }, { "number": 17, "checkers": [{ "color": 1, "idNumber": 7 }, { "color": 1, "idNumber": 12 }, { "color": 1, "idNumber": 4 }] }, { "number": 18, "checkers": [{ "color": 1, "idNumber": 6 }, { "color": 1, "idNumber": 5 }, { "color": 1, "idNumber": 0 }, { "color": 1, "idNumber": 2 }] }, { "number": 19, "checkers": [{ "color": 1, "idNumber": 10 }, { "color": 1, "idNumber": 11 }] }, { "number": 20, "checkers": [] }, { "number": 21, "checkers": [{ "color": 1, "idNumber": 9 }, { "color": 1, "idNumber": 14 }, { "color": 1, "idNumber": 1 }] }, { "number": 22, "checkers": [] }, { "number": 23, "checkers": [{ "color": 1, "idNumber": 13 }, { "color": 1, "idNumber": 8 }] }, { "number": 24, "checkers": [{ "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }] }];
        boardWithState.bar = { "number": 25, "checkers": [] };
        boardWithState.off = { "number": 0, "checkers": [] };
        rules = new GamerulesBackgammon(new Board(), p1, p2, diceService, store);
        rules["_currentPlayer"] = p1;
        rules["board"] = boardWithState;
        const possibleMoves = rules.getAllPossibleMoves(boardWithState, p1, [5, 6]);
        expect(possibleMoves).toBeDefined();
        expect(possibleMoves.length).toBe(0);
    });
    it("should calculate correct possible moves 2", () => {
        const boardWithState: any = new Board();
        // tslint:disable-next-line:max-line-length
        boardWithState.fields = [{ "number": 1, "checkers": [] }, { "number": 2, "checkers": [] }, { "number": 3, "checkers": [] }, { "number": 4, "checkers": [] }, { "number": 5, "checkers": [] }, { "number": 6, "checkers": [] }, { "number": 7, "checkers": [] }, { "number": 8, "checkers": [] }, { "number": 9, "checkers": [] }, { "number": 10, "checkers": [] }, { "number": 11, "checkers": [] }, { "number": 12, "checkers": [] }, { "number": 13, "checkers": [] }, { "number": 14, "checkers": [] }, { "number": 15, "checkers": [] }, { "number": 16, "checkers": [] }, { "number": 17, "checkers": [] }, { "number": 18, "checkers": [] }, { "number": 19, "checkers": [] }, { "number": 20, "checkers": [] }, { "number": 21, "checkers": [] }, { "number": 22, "checkers": [] },
        { "number": 23, "checkers": [{ "color": 1, "idNumber": 13 }, { "color": 1, "idNumber": 8 }] },
        { "number": 24, "checkers": [{ "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }] }];
        boardWithState.bar = { "number": 25, "checkers": [] };
        boardWithState.off = { "number": 0, "checkers": [] };
        rules = new GamerulesBackgammon(new Board(), p1, p2, diceService, store);
        rules["_currentPlayer"] = p1;
        rules["board"] = boardWithState;
        const possibleMoves = rules.getAllPossibleMoves(boardWithState, p1, [2, 2]);
        expect(possibleMoves).toBeDefined();
        expect(possibleMoves.length).toBe(1);
    });
    it("should calculate correct possible moves 3", () => {
        const boardWithState: any = new Board();
        // tslint:disable-next-line:max-line-length
        boardWithState.fields = [{ "number": 1, "checkers": [{ "color": 0, "idNumber": 6 }, { "color": 0, "idNumber": 5 }] }, { "number": 2, "checkers": [{ "color": 0, "idNumber": 2 }, { "color": 0, "idNumber": 11 }, { "color": 0, "idNumber": 14 }, { "color": 0, "idNumber": 7 }, { "color": 0, "idNumber": 8 }] }, { "number": 3, "checkers": [{ "color": 0, "idNumber": 13 }, { "color": 0, "idNumber": 12 }, { "color": 0, "idNumber": 10 }, { "color": 0, "idNumber": 3 }] }, { "number": 4, "checkers": [{ "color": 0, "idNumber": 4 }, { "color": 0, "idNumber": 9 }] }, { "number": 5, "checkers": [] }, { "number": 6, "checkers": [] }, { "number": 7, "checkers": [] }, { "number": 8, "checkers": [] }, { "number": 9, "checkers": [] }, { "number": 10, "checkers": [] }, { "number": 11, "checkers": [] }, { "number": 12, "checkers": [] }, { "number": 13, "checkers": [] }, { "number": 14, "checkers": [] }, { "number": 15, "checkers": [{ "color": 1, "idNumber": 3 }] }, { "number": 16, "checkers": [] }, { "number": 17, "checkers": [{ "color": 1, "idNumber": 7 }, { "color": 1, "idNumber": 12 }, { "color": 1, "idNumber": 4 }] }, { "number": 18, "checkers": [{ "color": 1, "idNumber": 6 }, { "color": 1, "idNumber": 5 }, { "color": 1, "idNumber": 0 }, { "color": 1, "idNumber": 2 }] }, { "number": 19, "checkers": [{ "color": 1, "idNumber": 10 }, { "color": 1, "idNumber": 11 }] }, { "number": 20, "checkers": [] }, { "number": 21, "checkers": [{ "color": 1, "idNumber": 9 }, { "color": 1, "idNumber": 14 }, { "color": 1, "idNumber": 1 }] }, { "number": 22, "checkers": [] }, { "number": 23, "checkers": [{ "color": 1, "idNumber": 13 }, { "color": 1, "idNumber": 8 }] }, { "number": 24, "checkers": [{ "color": 0, "idNumber": 0 }, { "color": 0, "idNumber": 1 }] }];
        boardWithState.bar = { "number": 25, "checkers": [] };
        boardWithState.off = { "number": 0, "checkers": [] };
        rules = new GamerulesBackgammon(new Board(), p1, p2, diceService, store);
        rules["_currentPlayer"] = p1;
        rules["board"] = boardWithState;
        const possibleMoves = rules.getAllPossibleMoves(boardWithState, p1, [4, 6]);
        expect(possibleMoves).toBeDefined();
        expect(possibleMoves.length).toBe(1);
    });
});
