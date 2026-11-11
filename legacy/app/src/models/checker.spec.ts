import { TestBed, async } from "@angular/core/testing";
import { Checker, CheckerColor } from "./checker";
describe("Checker", () => {
  beforeEach(async(() => {

  }));
  it("should create checker with given color", async(() => {
    const checker = new Checker(CheckerColor.BLACK, 1);
    expect(checker).toBeTruthy();
    expect(checker.color).toEqual(CheckerColor.BLACK);
  }));
  it("should create checker with given id", async(() => {
    const checker = new Checker(CheckerColor.BLACK, 1);
    expect(checker).toBeTruthy();
    expect(checker.id).toEqual(checker.color + "1");
  }));
});
