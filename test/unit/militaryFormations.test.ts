import { describe, expect, it } from "vitest";
import {
  FORMATION_ARCHETYPES,
  canFormationTraverseTerrain,
} from "../../src/domain/militaryFormations.js";
import { getHexCell } from "../../src/domain/hexGrid.js";

describe("military formations domain", () => {
  it("formation archetypes include heavy armor, naval SAG, CSG, and Sealift transports", () => {
    const natoArmor = FORMATION_ARCHETYPES["nato_armored_division"];
    expect(natoArmor).toBeDefined();
    expect(natoArmor.domain).toBe("ground");
    expect(natoArmor.isHeavyArmor).toBe(true);

    const pactArmor = FORMATION_ARCHETYPES["pact_tank_division"];
    expect(pactArmor).toBeDefined();
    expect(pactArmor.domain).toBe("ground");
    expect(pactArmor.isHeavyArmor).toBe(true);

    const sealift = FORMATION_ARCHETYPES["sealift_transport_flotilla"];
    expect(sealift).toBeDefined();
    expect(sealift.domain).toBe("naval");
    expect(sealift.transportCapacity).toBe(2);
  });

  it("heavy armor cannot cross sea terrain without embarkation on sealift", () => {
    const landHex = getHexCell("hex-nor-oslo")!;
    const seaHex = getHexCell("hex-sea-north")!;

    // On land, armor traverses freely
    const canTraverseLand = canFormationTraverseTerrain(
      "nato_armored_division",
      landHex.terrain,
      false,
    );
    expect(canTraverseLand.canMove).toBe(true);

    // Across open sea without embarkation, armor is blocked
    const unembarkedSea = canFormationTraverseTerrain(
      "nato_armored_division",
      seaHex.terrain,
      false,
    );
    expect(unembarkedSea.canMove).toBe(false);
    expect(unembarkedSea.reason).toMatch(/Sealift/i);

    // When embarked on sealift flotilla, armor can traverse sea
    const embarkedSea = canFormationTraverseTerrain(
      "nato_armored_division",
      seaHex.terrain,
      true,
    );
    expect(embarkedSea.canMove).toBe(true);
  });

  it("naval surface action group cannot cross land terrain", () => {
    const landHex = getHexCell("hex-nor-oslo")!;
    const seaHex = getHexCell("hex-sea-north")!;

    const seaResult = canFormationTraverseTerrain(
      "surface_action_group",
      seaHex.terrain,
      false,
    );
    expect(seaResult.canMove).toBe(true);

    const landResult = canFormationTraverseTerrain(
      "surface_action_group",
      landHex.terrain,
      false,
    );
    expect(landResult.canMove).toBe(false);
    expect(landResult.reason).toMatch(/land/i);
  });

  it("air wings can traverse both land and water terrain", () => {
    const landHex = getHexCell("hex-nor-oslo")!;
    const seaHex = getHexCell("hex-sea-north")!;

    expect(
      canFormationTraverseTerrain(
        "tactical_fighter_wing",
        landHex.terrain,
        false,
      ).canMove,
    ).toBe(true);
    expect(
      canFormationTraverseTerrain(
        "tactical_fighter_wing",
        seaHex.terrain,
        false,
      ).canMove,
    ).toBe(true);
  });
});
