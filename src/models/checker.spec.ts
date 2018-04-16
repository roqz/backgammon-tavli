import { TestBed, async } from "@angular/core/testing";
import { Checker, CheckerColor } from "./checker";
describe("Checker", () => {
  beforeEach(async(() => {

  }));
  it("should create checker with given color", async(() => {
    const checker = new Checker(CheckerColor.BLACK);
    expect(checker).toBeTruthy();
    expect(checker.color).toEqual(CheckerColor.BLACK);
  }));
});
