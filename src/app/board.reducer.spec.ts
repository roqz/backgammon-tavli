import { boardReducer, initialState } from "./board.reducer";

describe("Board Reducer", () => {
  describe("unknown action", () => {
    it("should return the initial state", () => {
      const action = {} as any;

      const result = boardReducer(initialState, action);

      expect(result).toBe(initialState);
    });
  });
});
