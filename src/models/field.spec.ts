import { TestBed, async } from "@angular/core/testing";
import { Field } from "./field";
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
});
