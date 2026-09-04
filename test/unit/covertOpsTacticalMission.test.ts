import { describe, expect, it } from "vitest";
import {
  openDatabase,
  type CampaignDatabase,
} from "../../src/infrastructure/database.js";
import { migrateDatabase } from "../../src/infrastructure/migrations.js";
import {
  executeCovertOperation,
  getEligibleFormationsForCovertOp,
  isFormationEligibleForCovertOp,
  resolveTacticalCovertSortie,
} from "../../src/domain/covertOperations.js";
import { getDiplomaticCables } from "../../src/domain/diplomacy.js";

function setupTestCampaign(
  db: CampaignDatabase,
  campaignId = "camp-covert-test",
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO campaigns (
      id, scenario_family_id, scenario_variant_id, name, seed, difficulty, tech_mode, status, campaign_time, created_at
    ) VALUES (?, 'baltic_1985', 'historical', 'Covert Test Campaign', 'seed-test', 'standard', 'historical', 'active', '1983-11-05T06:00:00Z', ?)`,
  ).run(campaignId, now);

  db.prepare(
    `INSERT OR REPLACE INTO campaign_players (campaign_id, country_id, created_at)
     VALUES (?, 'norway', ?)`,
  ).run(campaignId, now);

  db.prepare(
    `INSERT OR REPLACE INTO coalitions (campaign_id, id, name, side) VALUES (?, 'nato', 'NATO Alliance', 'blufor')`,
  ).run(campaignId);
  db.prepare(
    `INSERT OR REPLACE INTO coalitions (campaign_id, id, name, side) VALUES (?, 'warsaw-pact', 'Warsaw Pact', 'opfor')`,
  ).run(campaignId);

  db.prepare(
    `INSERT OR REPLACE INTO countries (campaign_id, id, name, coalition_id, objectives_json) VALUES (?, 'norway', 'Norway', 'nato', '[]')`,
  ).run(campaignId);
  db.prepare(
    `INSERT OR REPLACE INTO countries (campaign_id, id, name, coalition_id, objectives_json) VALUES (?, 'soviet-union', 'Soviet Union', 'warsaw-pact', '[]')`,
  ).run(campaignId);

  db.prepare(
    `INSERT OR REPLACE INTO campaign_economy (campaign_id, funds, updated_at)
     VALUES (?, 5000, ?)`,
  ).run(campaignId, now);

  db.prepare(
    `INSERT OR REPLACE INTO campaign_hex_cells (
      campaign_id, hex_id, side, country_id, depot_fuel, depot_missiles, created_at, updated_at
    ) VALUES (?, 'hex-sov-kola', 'opfor', 'soviet-union', 200, 100, ?, ?)`,
  ).run(campaignId, now, now);

  // Insert player submarine formation
  db.prepare(
    `INSERT OR REPLACE INTO campaign_formations (
      id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
    ) VALUES (?, ?, 'KNM Kobben (S318)', 'submarine_flotilla', 'blufor', 'norway', 'hex-nor-bergen', 100, 2, 2, 'ready', ?, ?, ?)`,
  ).run(
    "form-sub-1",
    campaignId,
    JSON.stringify({
      composition: { totalSubmarines: 1, flagshipName: "KNM Kobben" },
    }),
    now,
    now,
  );

  // Insert player infantry brigade (not a sub)
  db.prepare(
    `INSERT OR REPLACE INTO campaign_formations (
      id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
    ) VALUES (?, ?, 'Brigade Nord Mechanized Inf', 'motorized_division', 'blufor', 'norway', 'hex-nor-bodo', 100, 2, 2, 'ready', '{}', ?, ?)`,
  ).run("form-inf-1", campaignId, now, now);

  // Insert player depleted sub (0 strength, 0 AP)
  db.prepare(
    `INSERT OR REPLACE INTO campaign_formations (
      id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
    ) VALUES (?, ?, 'KNM Ula (Depleted)', 'submarine_flotilla', 'blufor', 'norway', 'hex-nor-bergen', 0, 0, 2, 'depleted', '{}', ?, ?)`,
  ).run("form-sub-depleted", campaignId, now, now);
}

describe("Covert Operations: Mandatory Units, Tactical Mission Generator & War Escalation", () => {
  it("enforces unit requirements: rejects wrong unit domain, 0 AP, and depleted units", () => {
    // 1. Sub incursion with ground infantry should fail
    const subCheckOnInf = isFormationEligibleForCovertOp(
      {
        unitType: "motorized_division",
        actionPoints: 2,
        strength: 100,
        status: "ready",
      },
      "PROXY_SUBMARINE_INCURSION",
    );
    expect(subCheckOnInf.eligible).toBe(false);
    expect(subCheckOnInf.reason).toMatch(/Requires a submarine formation/i);

    // 2. Sub incursion with submarine should succeed
    const subCheckOnSub = isFormationEligibleForCovertOp(
      {
        unitType: "submarine_flotilla",
        actionPoints: 1,
        strength: 100,
        status: "ready",
      },
      "PROXY_SUBMARINE_INCURSION",
    );
    expect(subCheckOnSub.eligible).toBe(true);

    // 3. Sub incursion with 0 AP submarine should fail
    const subCheckZeroAp = isFormationEligibleForCovertOp(
      {
        unitType: "submarine_flotilla",
        actionPoints: 0,
        strength: 100,
        status: "ready",
      },
      "PROXY_SUBMARINE_INCURSION",
    );
    expect(subCheckZeroAp.eligible).toBe(false);
    expect(subCheckZeroAp.reason).toMatch(/Insufficient Action Points/i);

    // 4. Depleted unit should fail
    const depletedCheck = isFormationEligibleForCovertOp(
      {
        unitType: "submarine_flotilla",
        actionPoints: 2,
        strength: 0,
        status: "depleted",
      },
      "PROXY_SUBMARINE_INCURSION",
    );
    expect(depletedCheck.eligible).toBe(false);
  });

  it("lists eligible player formations filtered by operation requirements", () => {
    const db = openDatabase({ databasePath: ":memory:" });
    migrateDatabase(db);
    setupTestCampaign(db, "camp-list-test");

    const eligibleSubs = getEligibleFormationsForCovertOp(
      db,
      "camp-list-test",
      "norway",
      "PROXY_SUBMARINE_INCURSION",
    );
    expect(eligibleSubs).toHaveLength(1);
    expect(eligibleSubs[0].name).toBe("KNM Kobben (S318)");
    expect(eligibleSubs[0].unitType).toBe("submarine_flotilla");

    const eligibleCommandos = getEligibleFormationsForCovertOp(
      db,
      "camp-list-test",
      "norway",
      "SPECIAL_FORCES_RAID",
    );
    expect(eligibleCommandos).toHaveLength(1);
    expect(eligibleCommandos[0].name).toBe("Brigade Nord Mechanized Inf");
  });

  it("launches tactical mission black op and generates authentic Sea Power .ini mission with OPFOR defensive screen", () => {
    const db = openDatabase({ databasePath: ":memory:" });
    migrateDatabase(db);
    setupTestCampaign(db, "camp-tactical-ini-test");

    const result = executeCovertOperation(db, "camp-tactical-ini-test", {
      sourceCountryId: "norway",
      targetCountryId: "soviet-union",
      targetHexId: "hex-sov-kola",
      opType: "PROXY_SUBMARINE_INCURSION",
      assignedFormationId: "form-sub-1",
      resolutionMode: "tactical_mission",
    });

    expect(result.ok).toBe(true);
    expect(result.operation.status).toBe("planned");
    expect(result.operation.resolutionMode).toBe("tactical_mission");
    expect(result.operation.assignedFormationName).toBe("KNM Kobben (S318)");
    expect(result.tacticalMissionIni).toBeDefined();

    const ini = result.tacticalMissionIni!;
    // Verify Sea Power sections and units
    expect(ini).toContain("[Mission]");
    expect(ini).toContain("Title=Black Op: Clandestine Incursion");
    expect(ini).toContain("[Taskforce1]");
    expect(ini).toContain("Side=Blue");
    expect(ini).toContain("Type=no_ss_kobben"); // Norwegian submarine model
    expect(ini).toContain("[Taskforce2]");
    expect(ini).toContain("Side=Red");
    expect(ini).toContain("Type=wp_cor_grisha3"); // Soviet ASW patrol corvette
    expect(ini).toContain("Type=wp_helo_ka25_asw"); // Soviet ASW dipping sonar helo
    expect(ini).toContain("[Zone1]"); // Infiltration zone
    expect(ini).toContain("[Zone2]"); // Egress corridor
    expect(ini).toContain("TriggerFullScaleWarOnDestroyed(DEFCON_1)");

    // Verify 1 AP was deducted from submarine
    const subRow = db
      .prepare(
        "SELECT action_points FROM campaign_formations WHERE id = 'form-sub-1'",
      )
      .get() as { action_points: number };
    expect(subRow.action_points).toBe(1);
  });

  it("resolves tactical sortie outcome 'clean_success': applies sabotage and avoids attribution", () => {
    const db = openDatabase({ databasePath: ":memory:" });
    migrateDatabase(db);
    setupTestCampaign(db, "camp-clean-test");

    const launch = executeCovertOperation(db, "camp-clean-test", {
      sourceCountryId: "norway",
      targetCountryId: "soviet-union",
      targetHexId: "hex-sov-kola",
      opType: "PROXY_SUBMARINE_INCURSION",
      assignedFormationId: "form-sub-1",
      resolutionMode: "tactical_mission",
    });

    const resolution = resolveTacticalCovertSortie(
      db,
      "camp-clean-test",
      launch.operation.id,
      "clean_success",
    );

    expect(resolution.ok).toBe(true);
    expect(resolution.operation.status).toBe("success");
    expect(resolution.operation.detected).toBe(false);
    expect(resolution.warDeclared).toBe(false);

    // Check target depot was sabotaged (started at 200 fuel, 100 missiles)
    const targetCell = db
      .prepare(
        "SELECT depot_fuel, depot_missiles FROM campaign_hex_cells WHERE hex_id = 'hex-sov-kola'",
      )
      .get() as { depot_fuel: number; depot_missiles: number };
    expect(targetCell.depot_fuel).toBe(100);
    expect(targetCell.depot_missiles).toBe(50);
  });

  it("resolves tactical sortie outcome 'destroyed_nearshore': destroys submarine, triggers DEFCON 1, declares FULL-SCALE WAR and dispatches war ultimatum cable", () => {
    const db = openDatabase({ databasePath: ":memory:" });
    migrateDatabase(db);
    setupTestCampaign(db, "camp-war-test");

    const launch = executeCovertOperation(db, "camp-war-test", {
      sourceCountryId: "norway",
      targetCountryId: "soviet-union",
      targetHexId: "hex-sov-kola",
      opType: "PROXY_SUBMARINE_INCURSION",
      assignedFormationId: "form-sub-1",
      resolutionMode: "tactical_mission",
    });

    const resolution = resolveTacticalCovertSortie(
      db,
      "camp-war-test",
      launch.operation.id,
      "destroyed_nearshore",
    );

    expect(resolution.ok).toBe(true);
    expect(resolution.operation.status).toBe("compromised");
    expect(resolution.warDeclared).toBe(true);

    // 1. Verify submarine was marked destroyed in database
    const sub = db
      .prepare(
        "SELECT strength, status FROM campaign_formations WHERE id = 'form-sub-1'",
      )
      .get() as { strength: number; status: string };
    expect(sub.strength).toBe(0);
    expect(sub.status).toBe("depleted");

    // 2. Verify DEFCON 1 maximum tension
    expect(resolution.tensionState.tensionIndex).toBe(100);
    expect(resolution.tensionState.defconLevel).toBe(1);

    // 3. Verify bilateral relation is now 'war'
    const rel = db
      .prepare(
        "SELECT stance FROM country_relations WHERE country_id = 'soviet-union' AND related_country_id = 'norway'",
      )
      .get() as { stance: string };
    expect(rel.stance).toBe("war");

    // 4. Verify emergency war cable was dispatched to player
    const cables = getDiplomaticCables(db, "camp-war-test");
    expect(cables.length).toBeGreaterThan(0);
    const warCable = cables.find((c) => c.header.includes("WAR DECLARATION"));
    expect(warCable).toBeDefined();
    expect(warCable?.senderCountryId).toBe("soviet-union");
    expect(warCable?.content).toMatch(
      /state of war now exists between our nations/i,
    );
    expect(warCable?.stanceChange).toContain("WAR");
  });
});
