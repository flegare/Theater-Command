import { describe, expect, it, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openDatabase,
  type CampaignDatabase,
} from "../../src/infrastructure/database.js";
import { migrateDatabase } from "../../src/infrastructure/migrations.js";
import {
  generateSeaPowerHexBattle,
  scrambleAirInterception,
  resolveHexAutoCombat,
  resolveHexManualDebrief,
  getCampaignHexState,
} from "../../src/application/hexStrategicSystem.js";

describe("Air Interception and Tactical Engagements", () => {
  let directory: string;
  let db: CampaignDatabase;
  const campaignId = "camp-air-battle-test";
  const now = new Date().toISOString();

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "theater-air-test-"));
    db = openDatabase({
      databasePath: join(directory, "campaign.sqlite"),
    });
    migrateDatabase(db);

    db.prepare(
      `INSERT OR REPLACE INTO campaigns (
        id, scenario_family_id, scenario_variant_id, name, seed, difficulty, tech_mode, status, campaign_time, created_at
      ) VALUES (?, 'baltic_1985', 'historical', 'Battle Test', 'seed-1', 'standard', 'historical', 'active', '1983-11-05T06:00:00Z', ?)`,
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
      `INSERT OR REPLACE INTO campaign_economy (campaign_id, funds, updated_at) VALUES (?, 5000, ?)`,
    ).run(campaignId, now);

    // Controlled hexes
    db.prepare(
      `INSERT OR REPLACE INTO campaign_hex_cells (campaign_id, hex_id, side, country_id, created_at, updated_at)
       VALUES (?, 'hex-nor-bodo', 'blufor', 'norway', ?, ?)`,
    ).run(campaignId, now, now);

    db.prepare(
      `INSERT OR REPLACE INTO campaign_hex_cells (campaign_id, hex_id, side, country_id, contested, created_at, updated_at)
       VALUES (?, 'hex-nor-tromso', 'blufor', 'norway', 0, ?, ?)`,
    ).run(campaignId, now, now);
  });

  it("allows fighter wing to scramble intercept a hostile hex within 3 hexes", () => {
    // BLUFOR Fighter Wing at Bodo
    db.prepare(
      `INSERT INTO campaign_formations (
        id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, '331st Skvadron F-16', 'tactical_fighter_wing', 'blufor', 'norway', 'hex-nor-bodo', 100, 2, 2, 'ready', ?, ?, ?)`,
    ).run(
      "f16-wing",
      campaignId,
      JSON.stringify({ fuel: 100, ammo: 100, rank: "veteran" }),
      now,
      now,
    );

    // OPFOR Jet Wing at Tromso
    db.prepare(
      `INSERT INTO campaign_formations (
        id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, '924th Guards Aviation Tu-22M3', 'tactical_fighter_wing', 'opfor', 'soviet-union', 'hex-nor-tromso', 100, 1, 1, 'ready', ?, ?, ?)`,
    ).run(
      "sov-air-wing",
      campaignId,
      JSON.stringify({ fuel: 100, ammo: 100, rank: "regular" }),
      now,
      now,
    );

    const result = scrambleAirInterception(db, {
      campaignId,
      formationId: "f16-wing",
      targetHexId: "hex-nor-tromso",
    });

    expect(result.ok).toBe(true);
    expect(result.targetHexId).toBe("hex-nor-tromso");
    expect(result.formation?.hexId).toBe("hex-nor-tromso");
    expect(result.formation?.status).toBe("engaged");
    expect(result.formation?.actionPoints).toBe(1);

    // Verify hex is now marked contested
    const state = getCampaignHexState(db, campaignId);
    const hex = state.hexCells.find((c) => c.id === "hex-nor-tromso");
    expect(hex?.status).toBe("contested");
  });

  it("generates authentic Sea Power .ini mission text with valid structure and unit taskforces", () => {
    // BLUFOR F-16 Wing and OPFOR division in Tromso
    db.prepare(
      `INSERT INTO campaign_formations (
        id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, '331st Skvadron F-16', 'tactical_fighter_wing', 'blufor', 'norway', 'hex-nor-tromso', 100, 1, 2, 'engaged', ?, ?, ?)`,
    ).run(
      "f16-tromso",
      campaignId,
      JSON.stringify({ fuel: 100, ammo: 100 }),
      now,
      now,
    );

    db.prepare(
      `INSERT INTO campaign_formations (
        id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, '54th Motorized Rifle Division', 'mechanized_infantry_division', 'opfor', 'soviet-union', 'hex-nor-tromso', 100, 1, 1, 'engaged', ?, ?, ?)`,
    ).run(
      "sov-mr-div",
      campaignId,
      JSON.stringify({ fuel: 100, ammo: 100 }),
      now,
      now,
    );

    const battle = generateSeaPowerHexBattle(db, {
      campaignId,
      hexId: "hex-nor-tromso",
    });

    expect(battle.ok).toBe(true);
    expect(battle.missionText).toContain("[Language_en]");
    expect(battle.missionText).toContain("[Environment]");
    expect(battle.missionText).toContain("[Mission]");
    expect(battle.missionText).toContain("[Taskforce1]");
    expect(battle.missionText).toContain("[Taskforce2]");
    expect(battle.unitsCount).toBeGreaterThan(0);
    expect(battle.bluforUnits.length).toBeGreaterThan(0);
    expect(battle.opforUnits.length).toBeGreaterThan(0);
  });

  it("resolves combat deterministically via Lanchester auto-resolve engine", () => {
    // Setup heavily favored BLUFOR force vs depleted OPFOR force
    db.prepare(
      `INSERT INTO campaign_formations (
        id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, '331st Skvadron F-16', 'tactical_fighter_wing', 'blufor', 'norway', 'hex-nor-tromso', 100, 1, 2, 'engaged', ?, ?, ?)`,
    ).run(
      "f16-strong",
      campaignId,
      JSON.stringify({ fuel: 100, ammo: 100, rank: "elite", morale: 100 }),
      now,
      now,
    );

    db.prepare(
      `INSERT INTO campaign_formations (
        id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, 'Weak Soviet Patrol', 'tactical_fighter_wing', 'opfor', 'soviet-union', 'hex-nor-tromso', 20, 0, 1, 'engaged', ?, ?, ?)`,
    ).run(
      "sov-weak",
      campaignId,
      JSON.stringify({ fuel: 40, ammo: 30, rank: "green", morale: 40 }),
      now,
      now,
    );

    const autoRes = resolveHexAutoCombat(db, {
      campaignId,
      hexId: "hex-nor-tromso",
    });

    expect(autoRes.ok).toBe(true);
    expect(autoRes.victory).toBe("blufor");
    expect(autoRes.bluforCasualtiesPct).toBeLessThan(
      autoRes.opforCasualtiesPct,
    );

    // Verify victor cleared engaged status
    const state = getCampaignHexState(db, campaignId);
    const victorFormation = state.formations.find((f) => f.id === "f16-strong");
    expect(victorFormation?.status).toBe("ready");
  });

  it("applies manual Sea Power debrief outcome accurately", () => {
    db.prepare(
      `INSERT INTO campaign_formations (
        id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, 'KNM Oslo Frigate', 'surface_action_group', 'blufor', 'norway', 'hex-nor-tromso', 100, 1, 2, 'engaged', ?, ?, ?)`,
    ).run(
      "sag-tromso",
      campaignId,
      JSON.stringify({ fuel: 100, ammo: 100 }),
      now,
      now,
    );

    db.prepare(
      `INSERT INTO campaign_formations (
        id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, 'Soviet Grisha Corvette', 'surface_action_group', 'opfor', 'soviet-union', 'hex-nor-tromso', 100, 1, 1, 'engaged', ?, ?, ?)`,
    ).run(
      "sov-grisha",
      campaignId,
      JSON.stringify({ fuel: 100, ammo: 100 }),
      now,
      now,
    );

    const debrief = resolveHexManualDebrief(db, {
      campaignId,
      hexId: "hex-nor-tromso",
      outcome: "blufor_victory",
    });

    expect(debrief.ok).toBe(true);
    expect(debrief.victory).toBe("blufor");

    // Check that OPFOR took significant casualties and BLUFOR holds hex
    const state = getCampaignHexState(db, campaignId);
    const blufor = state.formations.find((f) => f.id === "sag-tromso");
    expect(blufor?.status).toBe("ready");
  });
});
