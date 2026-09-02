import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app.js";
import { loadConfig } from "../../src/infrastructure/config.js";

describe("world zone API", () => {
  it("returns bounded geography by requested layers", async () => {
    const response = await request(createApp(loadConfig({})))
      .get(
        "/api/v1/world/zone?west=-30&south=50&east=40&north=75&layers=ports,airports&limit=10",
      )
      .expect(200);
    expect(response.body.layers.ports.records.length).toBeLessThanOrEqual(10);
    expect(response.body.layers.airports.records.length).toBeLessThanOrEqual(
      10,
    );
    expect(response.body.layers.ports.total).toBeGreaterThan(0);
    expect(response.body.layers.ports.truncated).toBe(true);
  });

  it("rejects inverted bounds", async () => {
    const response = await request(createApp(loadConfig({})))
      .get("/api/v1/world/zone?west=40&south=50&east=-30&north=75&layers=ports")
      .expect(400);
    expect(response.body.error.code).toBe("INVALID_WORLD_BOUNDS");
  });

  it("supports a small viewport request without returning unrelated layers", async () => {
    const response = await request(createApp(loadConfig({})))
      .get(
        "/api/v1/world/zone?west=4&south=58&east=15&north=71&layers=ports&limit=3",
      )
      .expect(200);
    expect(Object.keys(response.body.layers)).toEqual(["ports"]);
    expect(response.body.layers.ports.records.length).toBeLessThanOrEqual(3);
    for (const record of response.body.layers.ports.records) {
      expect(record.longitude).toBeGreaterThanOrEqual(4);
      expect(record.longitude).toBeLessThanOrEqual(15);
      expect(record.latitude).toBeGreaterThanOrEqual(58);
      expect(record.latitude).toBeLessThanOrEqual(71);
    }
  });

  it("returns numeric polygon coordinates for Leaflet", async () => {
    const response = await request(createApp(loadConfig({})))
      .get(
        "/api/v1/world/zone?west=4&south=58&east=15&north=71&layers=regions&limit=1",
      )
      .expect(200);
    const geometry = response.body.layers.regions.records[0].geometry;
    const findPair = (value: unknown): unknown[] | undefined => {
      if (!Array.isArray(value)) return undefined;
      if (
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
      )
        return value;
      for (const child of value) {
        const pair = findPair(child);
        if (pair) return pair;
      }
      return undefined;
    };
    const pair = findPair(geometry.coordinates);
    expect(pair).toBeDefined();
    expect(typeof pair?.[0]).toBe("number");
    expect(typeof pair?.[1]).toBe("number");
  });
});
