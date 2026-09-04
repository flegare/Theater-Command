import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  openDatabase,
  type CampaignDatabase,
} from "../../src/infrastructure/database.js";
import { migrateDatabase } from "../../src/infrastructure/migrations.js";
import {
  seedCampaignFormations,
  getCampaignHexState,
} from "../../src/application/hexStrategicSystem.js";
import {
  calculatePlayerVisibilityMatrix,
  filterFormationsByVisibility,
} from "../../src/domain/fogOfWar.js";
import {
  processAutonomousCountryTurns,
  getCampaignAiTurnLogs,
} from "../../src/domain/aiStrategicCommander.js";

describe("Fog of War, Sensor Arrays & Autonomous AI Turn Control", () => {
  let directory: string;
  let database: CampaignDatabase;
  const campaignId = "camp-fow-test";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "theater-fow-test-"));
    database = openDatabase({
      databasePath: join(directory, "campaign.sqlite"),
    });
    migrateDatabase(database);

    const now = new Date().toISOString();
    // 1. Setup minimal campaign record
    database
      .prepare(
        `INSERT INTO campaigns (id, scenario_family_id, scenario_variant_id, name, seed, difficulty, tech_mode, status, campaign_time, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        campaignId,
        "baltic_1985",
        "historical",
        "Test FoW Campaign",
        "seed-fow",
        "standard",
        "historical",
        "active",
        now,
        now,
      );

    // 2. Set player as Norway
    database
      .prepare(
        `INSERT INTO campaign_players (campaign_id, country_id, created_at)
         VALUES (?, ?, ?)`,
      )
      .run(campaignId, "norway", now);

    // 3. Setup coalitions & countries
    database
      .prepare(
        `INSERT INTO coalitions (campaign_id, id, name, side) VALUES (?, ?, ?, ?)`,
      )
      .run(campaignId, "nato", "NATO Alliance", "blufor");
    database
      .prepare(
        `INSERT INTO coalitions (campaign_id, id, name, side) VALUES (?, ?, ?, ?)`,
      )
      .run(campaignId, "warsaw-pact", "Warsaw Pact", "opfor");
    database
      .prepare(
        `INSERT INTO coalitions (campaign_id, id, name, side) VALUES (?, ?, ?, ?)`,
      )
      .run(campaignId, "non-aligned", "Non-Aligned", "neutral");

    database
      .prepare(
        `INSERT INTO countries (campaign_id, id, name, coalition_id, objectives_json) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(campaignId, "norway", "Kingdom of Norway", "nato", "[]");
    database
      .prepare(
        `INSERT INTO countries (campaign_id, id, name, coalition_id, objectives_json) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        campaignId,
        "soviet-union",
        "Union of Soviet Socialist Republics",
        "warsaw-pact",
        "[]",
      );
    database
      .prepare(
        `INSERT INTO countries (campaign_id, id, name, coalition_id, objectives_json) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(campaignId, "sweden", "Kingdom of Sweden", "non-aligned", "[]");
    database
      .prepare(
        `INSERT INTO countries (campaign_id, id, name, coalition_id, objectives_json) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(campaignId, "finland", "Republic of Finland", "non-aligned", "[]");

    // 4. Initialize economy & tension
    database
      .prepare(
        `INSERT INTO campaign_economy (campaign_id, funds, production_points, fuel_stockpile, updated_at)
         VALUES (?, 2000, 100, 300, ?)`,
      )
      .run(campaignId, now);

    database
      .prepare(
        `INSERT INTO campaign_tensions (campaign_id, tension_index, defcon_level, peace_turns_counter, last_incident_summary, updated_at)
         VALUES (?, 50, 3, 0, 'Initial deployment', ?)`,
      )
      .run(campaignId, now);

    // 5. Seed full theater formations (Norway, US, UK, Soviet Murmansk, Sweden, Finland)
    seedCampaignFormations(database, campaignId);
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("calculates sensor visibility matrix for player nation and NATO allies", () => {
    const matrix = calculatePlayerVisibilityMatrix(
      database,
      campaignId,
      "norway",
    );

    // Sovereign home territory must have full visibility
    expect(matrix["hex-nor-oslo"]).toBe("full");
    expect(matrix["hex-nor-bergen"]).toBe("full");
    expect(matrix["hex-nor-tromso"]).toBe("full");
    expect(matrix["hex-nor-bodo"]).toBe("full");

    // Early warning radar stations (Bodø, Vardø) provide extended radius-2 coverage
    expect(matrix["hex-nor-bodo"]).toBe("full");

    // SOSUS hydrophone node in Norwegian Sea grants acoustic reconnaissance
    expect(matrix["hex-sea-norwegian"]).toBeDefined();
    expect(
      matrix["hex-sea-norwegian"] === "full" ||
        matrix["hex-sea-norwegian"] === "recon",
    ).toBe(true);

    // Polyarny is within radar/sensor recon perimeter:
    expect(matrix["hex-sov-polyarny"]).toBe("recon");

    // Deep Soviet bastion hexes (Kronstadt) far from NATO sensors must be shrouded:
    expect(matrix["hex-sov-kronstadt"]).toBe("shrouded");
  });

  it("filters shrouded enemy units and fuzzes perimeter units into unclassified contacts", () => {
    const allFormationsState = getCampaignHexState(
      database,
      campaignId,
      "norway",
      {
        filterFogOfWar: false,
      },
    );
    const totalUnits = allFormationsState.formations.length;
    expect(totalUnits).toBeGreaterThan(15);

    // 1. Fog of War Active (God Mode OFF)
    const fowState = getCampaignHexState(database, campaignId, "norway", {
      filterFogOfWar: true,
      godMode: false,
    });

    // Friendly units must all be visible
    const norwayUnits = fowState.formations.filter(
      (f) => f.countryId === "norway",
    );
    expect(norwayUnits.length).toBeGreaterThanOrEqual(4);

    // NATO allied units must all be visible
    const alliedUnits = fowState.formations.filter(
      (f) => f.side === "blufor" && f.countryId !== "norway",
    );
    expect(alliedUnits.length).toBeGreaterThan(0);

    // Units in recon range (Polyarny) must be fuzzed into unclassified sensor contacts
    const polyarnyUnits = fowState.formations.filter(
      (f) => f.hexId === "hex-sov-polyarny",
    );
    expect(polyarnyUnits.length).toBeGreaterThan(0);
    expect(polyarnyUnits.every((f) => f.isContact === true)).toBe(true);
    expect(polyarnyUnits.every((f) => f.name.includes("Unidentified"))).toBe(
      true,
    );

    // Deep Soviet formations in shrouded Kronstadt / Kaliningrad must be completely hidden
    const kronstadtUnits = fowState.formations.filter(
      (f) => f.hexId === "hex-sov-kronstadt",
    );
    expect(kronstadtUnits.length).toBe(0);

    // Total units returned in FoW must be fewer than total theater units
    expect(fowState.formations.length).toBeLessThan(totalUnits);

    // 2. God Mode Active (reveals 100% of theater formations)
    const godState = getCampaignHexState(database, campaignId, "norway", {
      filterFogOfWar: true,
      godMode: true,
    });
    expect(godState.godModeActive).toBe(true);
    expect(godState.formations.length).toBe(totalUnits);

    // In God Mode, Soviet Northern Fleet units in Polyarny are fully revealed as confirmed
    const revealedPolyarny = godState.formations.filter(
      (f) => f.hexId === "hex-sov-polyarny",
    );
    expect(revealedPolyarny.length).toBeGreaterThanOrEqual(1);
    expect(
      revealedPolyarny.every((f) => f.intelConfidence === "confirmed"),
    ).toBe(true);

    // And deep Soviet units in Kronstadt (previously hidden) are now visible in God Mode!
    const revealedKronstadt = godState.formations.filter(
      (f) => f.hexId === "hex-sov-kronstadt",
    );
    expect(revealedKronstadt.length).toBeGreaterThan(0);
    expect(
      revealedKronstadt.every((f) => f.intelConfidence === "confirmed"),
    ).toBe(true);
  });

  it("executes autonomous multi-country turn AI across movement, diplomacy, covert ops, and R&D", () => {
    const turnResult = processAutonomousCountryTurns(
      database,
      campaignId,
      "norway",
    );

    expect(turnResult.logs.length).toBeGreaterThanOrEqual(5);

    // Verify Soviet Union turn execution
    const sovietLog = turnResult.logs.find(
      (l) => l.countryId === "soviet-union",
    );
    expect(sovietLog).toBeDefined();
    expect(sovietLog!.stance).toBe("hostile");
    expect(sovietLog!.actions.diplomacy.length).toBeGreaterThan(0);
    expect(sovietLog!.actions.research.activeProject).toContain("Granit");
    expect(sovietLog!.actions.research.progressPct).toBeGreaterThan(0);

    // Verify Neutral Sweden turn execution
    const swedenLog = turnResult.logs.find((l) => l.countryId === "sweden");
    expect(swedenLog).toBeDefined();
    expect(swedenLog!.stance).toBe("neutral");
    expect(
      swedenLog!.actions.diplomacy.some((d) =>
        d.summary.includes("neutrality"),
      ),
    ).toBe(true);
    expect(swedenLog!.actions.research.activeProject).toContain("Viggen");

    // Verify Finland turn execution
    const finlandLog = turnResult.logs.find((l) => l.countryId === "finland");
    expect(finlandLog).toBeDefined();
    expect(finlandLog!.stance).toBe("neutral");
    expect(finlandLog!.actions.research.activeProject).toContain("Coastal");

    // Verify NATO Allied United States turn execution
    const usLog = turnResult.logs.find((l) => l.countryId === "united-states");
    expect(usLog).toBeDefined();
    expect(usLog!.stance).toBe("allied");
    expect(usLog!.actions.research.activeProject).toContain("Aegis");

    // Verify AI Turn Logs were persisted to database
    const persistedLogs = getCampaignAiTurnLogs(database, campaignId);
    expect(persistedLogs.length).toBe(turnResult.logs.length);
    expect(persistedLogs.some((l) => l.countryId === "soviet-union")).toBe(
      true,
    );
  });

  it("ensures sovereign procedural hexes are fully visible and enemy invasions are immediately reported to HQ", () => {
    const matrix = calculatePlayerVisibilityMatrix(
      database,
      campaignId,
      "norway",
    );

    // Procedural sovereign Norwegian hexes must be fully visible (not shrouded)
    expect(matrix["hex-w-qm13-rp31"]).toBe("full");
    expect(matrix["hex-w-qm14-rp32"]).toBe("full");

    // Place an invading Soviet ground formation inside sovereign Norwegian territory
    const testInvader = {
      id: "invader-sov-1",
      name: "54th Motorized Rifle Division (Invasion Force)",
      side: "opfor" as const,
      countryId: "soviet-union",
      hexId: "hex-w-qm13-rp31", // Inside Norway
      unitType: "mechanized_infantry_division" as const,
      status: "ready" as const,
      strength: 100,
      actionPoints: 1,
      maxActionPoints: 1,
      fuelPct: 100,
      ammoPct: 100,
      moralePct: 100,
      veterancyRank: "regular" as const,
      killsCount: 0,
      turnCreated: 1,
      lastOrderSummary: "Ground assault into Norway",
    };

    const filtered = filterFormationsByVisibility(
      [testInvader],
      matrix,
      "norway",
      new Set([
        "norway",
        "united-states",
        "united-kingdom",
        "denmark",
        "west-germany",
      ]),
      false,
    );

    // Must NOT be hidden or shrouded: local authorities report the invasion directly to HQ
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.id).toBe("invader-sov-1");
    expect(filtered[0]!.intelConfidence).toBe("confirmed");
  });
});
