import { describe, expect, it } from "vitest";
import { composeLaneTraffic } from "../../src/domain/laneTraffic.js";
import type { TheaterLane } from "../../src/domain/trade.js";

const shippingLane: TheaterLane = {
  id: "test-coastal-lane",
  routeId: "test-route",
  kind: "shipping",
  name: "Test coastal lane",
  commodity: "fuel",
  countryIds: ["india", "sri-lanka"],
  coordinates: [
    [8, 80],
    [10, 82],
  ],
  dailyValue: 10,
  dailyCapacity: 60,
  disruption: 0,
  region: "indian_ocean",
  coastal: true,
};

const airLane: TheaterLane = {
  ...shippingLane,
  id: "test-air-lane",
  kind: "air",
  commodity: "passengers",
  coastal: false,
};

describe("lane traffic composition", () => {
  it("is deterministic and uses regional coastal flavor", () => {
    const first = composeLaneTraffic(shippingLane, 0.2, "india");
    const second = composeLaneTraffic(shippingLane, 0.2, "india");
    expect(second).toEqual(first);
    expect(
      first.traffic.find((entry) => entry.kind === "fishing")?.flavor,
    ).toContain("outrigger");
    expect(first.traffic.some((entry) => entry.kind === "merchant")).toBe(true);
    expect(first.traffic.some((entry) => entry.kind === "cruise")).toBe(true);
  });

  it("reroutes civilian air traffic instead of making it hostile", () => {
    const picture = composeLaneTraffic(airLane, 0.8, "india");
    expect(picture.traffic).toEqual([]);
    expect(
      picture.encounters.every(
        (encounter) => encounter.engagementAuthorized === false,
      ),
    ).toBe(true);
  });
});
