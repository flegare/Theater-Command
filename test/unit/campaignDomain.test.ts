import { describe, expect, it } from "vitest";
import {
  assessContact,
  canEngage,
  createUnknownContact,
} from "../../src/domain/contacts.js";
import { projectTraffic } from "../../src/domain/traffic.js";
import { projectTrade } from "../../src/domain/trade.js";

describe("Sea Power campaign domain", () => {
  it("requires identification before a normal country may engage", () => {
    const contact = createUnknownContact({
      id: "contact-1",
      domain: "surface",
      rulesOfEngagement: "identify_before_engage",
    });
    const categorized = assessContact(contact, {
      category: "fishing_vessel",
      confidenceDelta: 0.6,
      source: "radar",
    });
    expect(canEngage(categorized)).toBe(false);
    const identified = assessContact(categorized, {
      identity: "fishing-boat-1",
      disposition: "neutral",
      confidenceDelta: 0.3,
      source: "visual",
    });
    expect(canEngage(identified)).toBe(false);
    const hostile = assessContact(identified, {
      disposition: "hostile",
      confidenceDelta: 0,
      source: "intelligence",
    });
    expect(hostile.assessment.stage).toBe("identified");
    expect(canEngage(hostile)).toBe(true);
  });

  it("disrupts civilian traffic as risk rises", () => {
    const profile = {
      id: "fish-1",
      kind: "fishing" as const,
      countryId: "norway",
      routeId: "coast-1",
      baseDailyCount: 20,
      conflictSensitivity: 1,
      contactCategory: "fishing_vessel" as const,
    };
    expect(
      projectTraffic(profile, {
        tension: 0,
        routeRisk: 0,
        exclusionZone: false,
      }).state,
    ).toBe("normal");
    expect(
      projectTraffic(profile, {
        tension: 0.8,
        routeRisk: 0.2,
        exclusionZone: false,
      }).expectedDailyCount,
    ).toBe(0);
  });

  it("turns trade disruption into mission hooks", () => {
    const result = projectTrade(
      {
        id: "route-1",
        originNodeId: "origin",
        destinationNodeId: "destination",
        countryIds: ["norway", "uk"],
        capacity: 100,
        risk: 0.7,
        disruption: 0.5,
      },
      {
        id: "origin",
        countryId: "norway",
        name: "Bergen",
        commodity: "fuel",
        dailyCapacity: 100,
        dailyDemand: 0,
      },
      {
        id: "destination",
        countryId: "uk",
        name: "Scapa Flow",
        commodity: "fuel",
        dailyCapacity: 0,
        dailyDemand: 80,
      },
    );
    expect(result.delivered).toBe(50);
    expect(result.shortfall).toBe(30);
    expect(result.missionHooks).toEqual([
      "escort",
      "investigate",
      "interdict",
      "protect_node",
    ]);
  });
});
