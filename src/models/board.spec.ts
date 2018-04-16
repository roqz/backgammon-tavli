import { TestBed, async } from "@angular/core/testing";
import { Board } from "./board";
describe("Board", () => {
  beforeEach(async(() => {

  }));
  it("should create the board", async(() => {
    const board = new Board();
    expect(board).toBeTruthy();
  }));
  it(`should have 24 fields`, async(() => {
    const board = new Board();
    expect(board.fields).toBeDefined();
    expect(board.fields.length).toEqual(24);
  }));
  it("should have an empty bar", async(() => {
    const board: Board = new Board();
    expect(board.bar).toBeDefined();
  }));
  it("should have a bar with number 25", async(() => {
    const board: Board = new Board();
    expect(board.bar.number).toEqual(25);
  }));
  it("should have an empty off", async(() => {
    const board: Board = new Board();
    expect(board.off).toBeDefined();
  }));
  it("should have a off with number 0", async(() => {
    const board: Board = new Board();
    expect(board.off.number).toEqual(0);
  }));

  it("should return correct field by number", async(() => {
    const board: Board = new Board();
    const field = board.getFieldByNumber(11);
    expect(field.number).toEqual(11);
  }));
});
