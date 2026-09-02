import { describe, expect, it } from "vitest";
import {
  getFlotillaComposition,
  type FlotillaComposition,
} from "../../src/domain/flotillaComposition.js";
import { FORMATION_ARCHETYPES } from "../../src/domain/militaryFormations.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";

describe("flotillaComposition domain", () => {
  const streamingAssetsDir =
    "s:/SteamLibrary/steamapps/common/Sea Power/Sea Power_Data/StreamingAssets/original";

  // Gather all vanilla asset names from original directory if available
  let vanillaAssetNames: Set<string> | null = null;
  try {
    const vessels = readdirSync(join(streamingAssetsDir, "vessels"))
      .filter((f) => f.endsWith(".ini") && !f.endsWith("_variants.ini"))
      .map((f) => f.replace(/\.ini$/, ""));
    const aircraft = readdirSync(join(streamingAssetsDir, "aircraft"))
      .filter((f) => f.endsWith(".ini") && !f.endsWith("_squadrons.ini"))
      .map((f) => f.replace(/\.ini$/, ""));
    const landUnits = readdirSync(join(streamingAssetsDir, "land_units"))
      .filter((f) => f.endsWith(".ini") && !f.endsWith("_variants.ini"))
      .map((f) => f.replace(/\.ini$/, ""));

    vanillaAssetNames = new Set([...vessels, ...aircraft, ...landUnits]);
  } catch {
    vanillaAssetNames = null;
  }

  it("generates valid flotilla compositions for all 12 formation archetypes for BLUFOR (Norway/NATO)", () => {
    const formationTypes = Object.keys(
      FORMATION_ARCHETYPES,
    ) as (keyof typeof FORMATION_ARCHETYPES)[];

    for (const type of formationTypes) {
      const comp: FlotillaComposition = getFlotillaComposition(
        type,
        "norway",
        "blufor",
      );
      expect(comp).toBeDefined();
      expect(comp.formationType).toBe(type);
      expect(comp.units.length).toBeGreaterThan(0);
      expect(comp.flagshipName.length).toBeGreaterThan(0);
      expect(comp.summary.length).toBeGreaterThan(0);

      // Verify every unit has positive count and defined properties
      for (const unit of comp.units) {
        expect(unit.count).toBeGreaterThan(0);
        expect(unit.name.length).toBeGreaterThan(0);
        expect(unit.classIniRef.length).toBeGreaterThan(0);
        expect(unit.role.length).toBeGreaterThan(0);

        if (vanillaAssetNames) {
          expect(
            vanillaAssetNames.has(unit.classIniRef),
            `Asset '${unit.classIniRef}' used in ${type} (Norway) must exist in Sea Power vanilla assets`,
          ).toBe(true);
        }
      }
    }
  });

  it("generates valid flotilla compositions for all 12 formation archetypes for OPFOR (Soviet Union)", () => {
    const formationTypes = Object.keys(
      FORMATION_ARCHETYPES,
    ) as (keyof typeof FORMATION_ARCHETYPES)[];

    for (const type of formationTypes) {
      const comp: FlotillaComposition = getFlotillaComposition(
        type,
        "soviet-union",
        "opfor",
      );
      expect(comp).toBeDefined();
      expect(comp.formationType).toBe(type);
      expect(comp.units.length).toBeGreaterThan(0);

      for (const unit of comp.units) {
        expect(unit.count).toBeGreaterThan(0);
        if (vanillaAssetNames) {
          expect(
            vanillaAssetNames.has(unit.classIniRef),
            `Asset '${unit.classIniRef}' used in ${type} (Soviet) must exist in Sea Power vanilla assets`,
          ).toBe(true);
        }
      }
    }
  });

  it("accurately flags proxy units for nations lacking dedicated 3D models (Norway & Sweden)", () => {
    const norwaySag = getFlotillaComposition(
      "surface_action_group",
      "norway",
      "blufor",
    );
    const osloFrigate = norwaySag.units.find((u) => u.id === "nor-oslo-1");
    expect(osloFrigate).toBeDefined();
    expect(osloFrigate?.isProxy).toBe(true);
    expect(osloFrigate?.classIniRef).toBe("usn_ff_knox");
    expect(osloFrigate?.proxyFor).toContain("Oslo-class");

    const sweSag = getFlotillaComposition(
      "surface_action_group",
      "sweden",
      "neutral",
    );
    const stockholmCorvette = sweSag.units.find((u) => u.id === "swe-corvette");
    expect(stockholmCorvette?.isProxy).toBe(true);
    expect(stockholmCorvette?.classIniRef).toBe("usn_phm_pegasus");

    const norwaySub = getFlotillaComposition(
      "submarine_squadron",
      "norway",
      "blufor",
    );
    const kobbenSub = norwaySub.units.find((u) => u.id === "nor-kobben-1");
    expect(kobbenSub?.isProxy).toBe(true);
    expect(kobbenSub?.classIniRef).toBe("rcn_ss_oberon");
  });

  it("accurately handles authentic vanilla vessels for US Navy and Soviet Union without proxies", () => {
    const usnCsg = getFlotillaComposition(
      "carrier_strike_group",
      "united-states",
      "blufor",
    );
    const nimitz = usnCsg.units.find((u) => u.classIniRef === "usn_cvn_nimitz");
    expect(nimitz).toBeDefined();
    expect(nimitz?.isProxy).toBe(false);

    const tico = usnCsg.units.find(
      (u) => u.classIniRef === "usn_cg_ticonderoga",
    );
    expect(tico).toBeDefined();
    expect(tico?.isProxy).toBe(false);

    const sovSag = getFlotillaComposition(
      "surface_action_group",
      "soviet-union",
      "opfor",
    );
    const kirov = sovSag.units.find((u) => u.classIniRef === "wp_rkr_kirov");
    expect(kirov).toBeDefined();
    expect(kirov?.isProxy).toBe(false);

    const slava = sovSag.units.find((u) => u.classIniRef === "wp_rkr_slava");
    expect(slava).toBeDefined();
    expect(slava?.isProxy).toBe(false);
  });

  it("verifies all items in AVAILABLE_VANILLA_ASSETS have valid attributes and existing game .ini files", async () => {
    const { AVAILABLE_VANILLA_ASSETS } =
      await import("../../src/domain/flotillaComposition.js");
    expect(AVAILABLE_VANILLA_ASSETS.length).toBeGreaterThan(30);

    for (const item of AVAILABLE_VANILLA_ASSETS) {
      expect(item.classIniRef.length).toBeGreaterThan(0);
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.unitClass.length).toBeGreaterThan(0);
      expect(item.defaultRole.length).toBeGreaterThan(0);
      expect(item.defaultCount).toBeGreaterThan(0);

      if (vanillaAssetNames) {
        expect(
          vanillaAssetNames.has(item.classIniRef),
          `Asset catalog item '${item.classIniRef}' must exist in Sea Power vanilla directory`,
        ).toBe(true);
      }
    }
  });

  it("correctly recalculates composition totals across categories", async () => {
    const { recalculateCompositionTotals } =
      await import("../../src/domain/flotillaComposition.js");
    const totals = recalculateCompositionTotals([
      {
        id: "1",
        name: "USS Nimitz",
        unitClass: "CVN",
        classIniRef: "usn_cvn_nimitz",
        category: "vessel",
        role: "Flagship",
        count: 1,
        isProxy: false,
      },
      {
        id: "2",
        name: "USS Ticonderoga",
        unitClass: "CG",
        classIniRef: "usn_cg_ticonderoga",
        category: "vessel",
        role: "Air Defense",
        count: 2,
        isProxy: false,
      },
      {
        id: "3",
        name: "USS Los Angeles",
        unitClass: "SSN",
        classIniRef: "usn_ssn_los_angeles",
        category: "submarine",
        role: "Sub Screen",
        count: 2,
        isProxy: false,
      },
      {
        id: "4",
        name: "F-14A Tomcat",
        unitClass: "Fighter",
        classIniRef: "usn_f-14a",
        category: "aircraft",
        role: "CAP",
        count: 24,
        isProxy: false,
      },
      {
        id: "5",
        name: "M1 Abrams",
        unitClass: "MBT",
        classIniRef: "usa_mbt_abrams",
        category: "land_unit",
        role: "Armor",
        count: 14,
        isProxy: false,
      },
    ]);

    expect(totals.totalVessels).toBe(3);
    expect(totals.totalSubmarines).toBe(2);
    expect(totals.totalAircraft).toBe(24);
    expect(totals.totalVehicles).toBe(14);
  });

  it("calculates accurate composition costs in funds, production points, and combat point values", async () => {
    const { calculateCompositionCost } =
      await import("../../src/domain/flotillaComposition.js");

    const units = [
      {
        id: "u-1",
        name: "USS Nimitz",
        unitClass: "Nimitz-class CVN",
        classIniRef: "usn_cvn_nimitz",
        category: "vessel" as const,
        role: "Flagship",
        count: 1,
        isProxy: false,
      },
      {
        id: "u-2",
        name: "Oliver Hazard Perry",
        unitClass: "Perry-class FFG",
        classIniRef: "usn_ffg_oliver_hazard_perry",
        category: "vessel" as const,
        role: "Escort",
        count: 2,
        isProxy: false,
      },
    ];

    const costs = calculateCompositionCost(units);
    // Nimitz: $450 funds, 80 prod, 15 pts. Perry: 2 * $75 = $150 funds, 2 * 14 = 28 prod, 2 * 3 = 6 pts.
    expect(costs.totalFunds).toBe(450 + 150);
    expect(costs.totalProduction).toBe(80 + 28);
    expect(costs.totalPoints).toBe(15 + 6);
  });

  it("filters assets according to strict timeline vs unrestricted eras", async () => {
    const { AVAILABLE_VANILLA_ASSETS, filterAssetsByTimeline } =
      await import("../../src/domain/flotillaComposition.js");

    // In 1975 strict timeline, post-1975 units like Iowa '82 or Spruance ABL '84 or Perry Long Hull '84 should be excluded
    const filtered1975 = filterAssetsByTimeline(
      AVAILABLE_VANILLA_ASSETS,
      1975,
      true,
    );
    expect(filtered1975.some((a) => a.classIniRef === "usn_bb_iowa")).toBe(
      false,
    );
    expect(
      filtered1975.some((a) => a.classIniRef === "usn_dd_spruance_abl"),
    ).toBe(false);
    expect(filtered1975.some((a) => a.classIniRef === "usn_ff_knox")).toBe(
      true,
    );

    // In 1983 strict timeline, 1983 units are allowed, but 1984/1985 units are excluded
    const filtered1983 = filterAssetsByTimeline(
      AVAILABLE_VANILLA_ASSETS,
      1983,
      true,
    );
    expect(
      filtered1983.some((a) => a.classIniRef === "usn_cg_ticonderoga"),
    ).toBe(true);
    expect(
      filtered1983.some((a) => a.classIniRef === "usn_dd_spruance_abl"),
    ).toBe(false);

    // When strictTimeline is false (unrestricted), all units are available
    const unrestricted = filterAssetsByTimeline(
      AVAILABLE_VANILLA_ASSETS,
      1975,
      false,
    );
    expect(unrestricted.length).toBe(AVAILABLE_VANILLA_ASSETS.length);
  });

  it("discovers modernization refit families and orders variants correctly", async () => {
    const { getAvailableModernizations } =
      await import("../../src/domain/flotillaComposition.js");

    // Knox family: Knox '69 -> Knox '72 -> Knox '84
    const knoxMods = getAvailableModernizations("usn_ff_knox", 1985, true);
    expect(knoxMods.length).toBe(3);
    expect(knoxMods[0]?.classIniRef).toBe("usn_ff_knox");
    expect(knoxMods[1]?.classIniRef).toBe("usn_ff_knox_72");
    expect(knoxMods[2]?.classIniRef).toBe("usn_ff_knox_84");

    // Knox in 1975 strict timeline should only see '69 and '72
    const knoxMods1975 = getAvailableModernizations("usn_ff_knox", 1975, true);
    expect(knoxMods1975.length).toBe(2);
    expect(knoxMods1975.some((m) => m.classIniRef === "usn_ff_knox_84")).toBe(
      false,
    );

    // Kashin family: Kashin -> Kashin Mod
    const kashinMods = getAvailableModernizations("wp_bpk_kashin", 1985, true);
    expect(kashinMods.length).toBe(2);
    expect(kashinMods[1]?.classIniRef).toBe("wp_bpk_kashin_mod");
  });

  it("verifies hierarchical catalog categories and subcategories structure", async () => {
    const { HIERARCHICAL_CATALOG_GROUPS, AVAILABLE_VANILLA_ASSETS } =
      await import("../../src/domain/flotillaComposition.js");

    expect(HIERARCHICAL_CATALOG_GROUPS.length).toBeGreaterThanOrEqual(7);

    // Ensure every asset in catalog has a valid subcategory mapped to one of the groups
    const allGroupSubCats = new Set(
      HIERARCHICAL_CATALOG_GROUPS.flatMap((g) =>
        g.subCategories.map((s) => s.id),
      ),
    );

    for (const asset of AVAILABLE_VANILLA_ASSETS) {
      expect(
        allGroupSubCats.has(asset.subCategory),
        `Asset '${asset.classIniRef}' subcategory '${asset.subCategory}' must be in HIERARCHICAL_CATALOG_GROUPS`,
      ).toBe(true);
    }
  });
});
