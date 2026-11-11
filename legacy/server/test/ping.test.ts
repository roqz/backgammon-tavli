import request from "supertest";
import app from "../src/app";

describe("GET /ping", () => {
    it("should return 200 OK", () => {
        return request(app).get("/api/v1/ping")
            .expect(200);
    });
});