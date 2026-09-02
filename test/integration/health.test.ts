import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app.js";
import { loadConfig } from "../../src/infrastructure/config.js";

describe("campaign API foundation", () => {
  const app = createApp(loadConfig({}));

  it("returns a correlated health response without requiring Ollama", async () => {
    const response = await request(app).get("/api/v1/health").expect(200);

    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(response.body).toMatchObject({
      ok: true,
      service: "theater_campaign",
      godModeEnabled: false,
      requestId: response.headers["x-request-id"],
    });
  });

  it("returns the standard error envelope for missing API routes", async () => {
    const response = await request(app).get("/api/v1/missing").expect(404);

    expect(response.body.error).toMatchObject({
      code: "NOT_FOUND",
      requestId: response.headers["x-request-id"],
    });
  });

  it("returns a correlated validation error for malformed JSON", async () => {
    const response = await request(app)
      .post("/api/v1/health")
      .set("content-type", "application/json")
      .send('{"incomplete":')
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "INVALID_JSON",
      requestId: response.headers["x-request-id"],
    });
  });
});
