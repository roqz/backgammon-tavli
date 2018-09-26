import { TestBed, async } from "@angular/core/testing";
import { Field } from "./field";
import { Player } from "./player";
import { CheckerColor, Checker } from "./checker";
import { PlayerComputer } from "./player-computer";
describe("Field", () => {
  beforeEach(async(() => {

  }));
  it("should create field with given number", async(() => {
    const field = new Field(3);
    expect(field).toBeTruthy();
    expect(field.number).toEqual(3);
  }));
  it("should have empty checker array", async(() => {
    const field = new Field(3);
    expect(field.checkers).toBeTruthy();
    expect(field.checkers.length).toEqual(0);
  }));
  it("should not have checker of player if checkers empty", async(() => {
    const field = new Field(3);
    const player = new PlayerComputer("Test", CheckerColor.WHITE);
    expect(field.hasCheckersOfPlayer(player)).toBeFalsy();
  }));
  it("should return true for checker of player if checkers have one", async(() => {
    const field = new Field(3);
    field.checkers.push(new Checker(CheckerColor.WHITE, 1));
    const player = new PlayerComputer("Test", CheckerColor.WHITE);
    expect(field.hasCheckersOfPlayer(player)).toBeTruthy();
  }));
});
