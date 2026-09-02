import { describe, expect, it } from "vitest";
import { findFormationHexPath } from "../../src/domain/hexPathfinding.js";
import { coordinatesToAxial } from "../../src/domain/hexGrid.js";

describe("hexPathfinding domain", () => {
  it("computes direct single-step path for naval task force", () => {
    // Bergen (60.2, 5.2) to North Sea Oil (56.5, 3.2)
    const bergenAxial = coordinatesToAxial(60.2, 5.2);
    const northSeaAxial = coordinatesToAxial(56.5, 3.2);

    const result = findFormationHexPath({
      startAxial: bergenAxial,
      targetAxial: northSeaAxial,
      unitType: "surface_action_group",
      currentAP: 2,
      maxAP: 2,
    });
    console.log("Naval Pathfinding Result:", result);

    expect(result.found).toBe(true);
    expect(result.stepCount).toBeGreaterThan(0);
    expect(result.path.length).toBe(result.stepCount + 1);
    expect(result.turnsNeeded).toBeGreaterThanOrEqual(1);
  });

  it("blocks ground divisions from traversing open water without transport", () => {
    const bergenAxial = coordinatesToAxial(60.2, 5.2);
    const northSeaAxial = coordinatesToAxial(56.5, 3.2); // deep sea

    const result = findFormationHexPath({
      startAxial: bergenAxial,
      targetAxial: northSeaAxial,
      unitType: "nato_armored_division",
      isEmbarked: false,
      currentAP: 1,
      maxAP: 1,
    });

    expect(result.found).toBe(false);
    expect(result.reason).toContain("Strategic Sealift");
  });

  it("allows embarked ground divisions to traverse water with sealift", () => {
    const bergenAxial = coordinatesToAxial(60.2, 5.2);
    const northSeaAxial = coordinatesToAxial(56.5, 3.2);

    const result = findFormationHexPath({
      startAxial: bergenAxial,
      targetAxial: northSeaAxial,
      unitType: "nato_armored_division",
      isEmbarked: true,
      currentAP: 2,
      maxAP: 2,
    });

    expect(result.found).toBe(true);
    expect(result.stepCount).toBeGreaterThan(0);
  });

  it("calculates accurate multi-turn arrival estimates", () => {
    // Distance > currentAP
    const bergenAxial = coordinatesToAxial(60.2, 5.2);
    const kolaAxial = coordinatesToAxial(69.1, 33.4);

    const result = findFormationHexPath({
      startAxial: bergenAxial,
      targetAxial: kolaAxial,
      unitType: "tactical_fighter_wing",
      currentAP: 3,
      maxAP: 3,
    });

    expect(result.found).toBe(true);
    expect(result.stepCount).toBeGreaterThan(3);
    expect(result.turnsNeeded).toBeGreaterThanOrEqual(2);
  });
});
