import { TestBed, async } from "@angular/core/testing";
import { Board } from "./board";
import * as _ from "lodash";
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
  it("should return undefined if field number to get sector is too high", async(() => {
    const board: Board = new Board();
    const sector = board.getSectorOfField(77);
    expect(sector).toBeUndefined();
  }));
  it("should return fields 1-6 as sector for field 5", async(() => {
    const board: Board = new Board();
    const sector = board.getSectorOfField(5);
    expect(sector).toBeDefined();
    expect(sector.length).toEqual(6);
    const fieldOne = _.find(sector, f => f.number === 1);
    expect(fieldOne).toBeDefined();
  }));
});
