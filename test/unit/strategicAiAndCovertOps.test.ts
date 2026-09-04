import { describe, expect, it, beforeEach } from "vitest";
import {
  openDatabase,
  type CampaignDatabase,
} from "../../src/infrastructure/database.js";
import { migrateDatabase } from "../../src/infrastructure/migrations.js";
import { seedCampaignLedger } from "../../src/application/campaignLedger.js";
import { getCountryPersona } from "../../src/domain/countryPersonas.js";
import {
  executeCovertOperation,
  getCampaignTension,
  calculateDefcon,
} from "../../src/domain/covertOperations.js";
import { compileStrategicTheaterContext } from "../../src/domain/strategicContext.js";
import {
  negotiateDiplomaticProposal,
  acceptDiplomaticCounterOffer,
} from "../../src/domain/diplomaticNegotiator.js";
import {
  validateTreatyEligibility,
  calculateTreatyOdds,
  markDiplomaticCablesAsRead,
  getDiplomaticCables,
  getWorldNewsDispatches,
  processAutonomousAiDiplomacy,
  getBilateralRelationshipDetails,
  adjustBilateralRelations,
  declineDiplomaticCounterOffer,
} from "../../src/domain/diplomacy.js";
import { processAiStrategicTurns } from "../../src/domain/aiStrategicCommander.js";
import {
  moveFormation,
  processTurnStrategicHexesUpdate,
} from "../../src/application/hexStrategicSystem.js";
import {
  getHexCellDefinition,
  getHexNeighbors,
} from "../../src/domain/hexGrid.js";

describe("Strategic AI, Country Personas & Covert Operations", () => {
  let db: CampaignDatabase;
  const campaignId = "camp-ai-test";
  const now = new Date().toISOString();

  beforeEach(() => {
    db = openDatabase({ databasePath: ":memory:" });
    migrateDatabase(db);

    db.prepare(
      `INSERT INTO campaigns (id, scenario_family_id, scenario_variant_id, name, seed, difficulty, tech_mode, status, campaign_time, created_at)
       VALUES (?, 'northern-flank-1985', 'norway-defense', 'Able Archer 83', 'seed-1', 'standard', 'historical', 'active', ?, ?)`,
    ).run(campaignId, now, now);

    db.prepare(
      `INSERT OR IGNORE INTO coalitions (campaign_id, id, name, side) VALUES (?, 'blufor', 'NATO', 'blufor')`,
    ).run(campaignId);
    db.prepare(
      `INSERT OR IGNORE INTO coalitions (campaign_id, id, name, side) VALUES (?, 'opfor', 'Warsaw Pact', 'opfor')`,
    ).run(campaignId);
    db.prepare(
      `INSERT OR IGNORE INTO countries (campaign_id, id, name, coalition_id, objectives_json)
       VALUES (?, 'norway', 'Norway', 'blufor', '[]')`,
    ).run(campaignId);
    db.prepare(
      `INSERT OR IGNORE INTO countries (campaign_id, id, name, coalition_id, objectives_json)
       VALUES (?, 'united-states', 'United States', 'blufor', '[]')`,
    ).run(campaignId);
    db.prepare(
      `INSERT OR IGNORE INTO countries (campaign_id, id, name, coalition_id, objectives_json)
       VALUES (?, 'united-kingdom', 'United Kingdom', 'blufor', '[]')`,
    ).run(campaignId);
    db.prepare(
      `INSERT OR IGNORE INTO countries (campaign_id, id, name, coalition_id, objectives_json)
       VALUES (?, 'soviet-union', 'Soviet Union', 'opfor', '[]')`,
    ).run(campaignId);
    db.prepare(
      `INSERT OR IGNORE INTO countries (campaign_id, id, name, coalition_id, objectives_json)
       VALUES (?, 'sweden', 'Sweden', 'blufor', '[]')`,
    ).run(campaignId);

    db.prepare(
      `INSERT INTO campaign_players (campaign_id, country_id, created_at)
       VALUES (?, 'norway', ?)`,
    ).run(campaignId, now);

    seedCampaignLedger(db, {
      campaignId,
      scenarioFamilyId: "northern-flank-1985",
      playerCountryId: "norway",
      campaignTime: now,
      strategicSites: [],
    });

    db.prepare(
      "UPDATE campaign_economy SET funds = 2000, fuel_stockpile = 200 WHERE campaign_id = ?",
    ).run(campaignId);

    db.prepare(
      `INSERT OR REPLACE INTO campaign_hex_cells (
        campaign_id, hex_id, side, country_id, contested, capture_turns_counter,
        depot_fuel, depot_missiles, depot_torpedoes, depot_shells, created_at, updated_at
      ) VALUES (?, 'hex-sov-murmansk', 'opfor', 'soviet-union', 0, 0, 400, 100, 50, 200, ?, ?)`,
    ).run(campaignId, now, now);
  });

  it("loads historical Cold War personas with doctrines and redlines", () => {
    const soviet = getCountryPersona("soviet-union");
    expect(soviet.leaderTitle).toContain("General Secretary");
    expect(soviet.temperament).toBe("hawkish");
    expect(soviet.redlines.length).toBeGreaterThan(0);
    expect(soviet.preferredCovertOps).toContain("SABOTAGE_STOCKPILE_DEPOT");

    const sweden = getCountryPersona("sweden");
    expect(sweden.temperament).toBe("unaligned");
    expect(sweden.strategicDoctrine).toContain("Armed Neutrality");

    const norway = getCountryPersona("norway");
    expect(norway.temperament).toBe("defensive");
  });

  it("calculates DEFCON levels accurately from tension index", () => {
    expect(calculateDefcon(10)).toBe(5);
    expect(calculateDefcon(25)).toBe(4);
    expect(calculateDefcon(45)).toBe(3);
    expect(calculateDefcon(65)).toBe(2);
    expect(calculateDefcon(90)).toBe(1);
  });

  it("executes covert sabotage operation, halving enemy depots and increasing tension", () => {
    // Force success = true (roll = 0.1 <= 0.75), detected = false (roll = 0.9 > 0.25)
    const result = executeCovertOperation(
      db,
      campaignId,
      {
        sourceCountryId: "norway",
        targetCountryId: "soviet-union",
        targetHexId: "hex-sov-murmansk",
        opType: "SABOTAGE_STOCKPILE_DEPOT",
      },
      0.1,
      0.9,
    );

    expect(result.ok).toBe(true);
    expect(result.success).toBe(true);
    expect(result.detected).toBe(false);

    // Verify target hex depot fuel halved from 400 to 200
    const hex = db
      .prepare(
        "SELECT depot_fuel, depot_missiles FROM campaign_hex_cells WHERE campaign_id = ? AND hex_id = ?",
      )
      .get(campaignId, "hex-sov-murmansk") as {
      depot_fuel: number;
      depot_missiles: number;
    };
    expect(hex.depot_fuel).toBe(200);
    expect(hex.depot_missiles).toBe(50);

    // Verify funds deducted ($2000 - $450 = $1550)
    const eco = db
      .prepare("SELECT funds FROM campaign_economy WHERE campaign_id = ?")
      .get(campaignId) as { funds: number };
    expect(eco.funds).toBe(1550);

    // Verify tension increased
    const tension = getCampaignTension(db, campaignId);
    expect(tension.tensionIndex).toBeGreaterThan(20);
  });

  it("handles compromised covert operation with diplomatic fallout", () => {
    // Establish a prior ceasefire
    db.prepare(
      `INSERT INTO diplomatic_treaties (id, campaign_id, treaty_type, party_a_country_id, party_b_country_id, duration_turns, turns_remaining, created_at, updated_at)
       VALUES ('tr-1', ?, 'ceasefire', 'norway', 'soviet-union', 5, 5, ?, ?)`,
    ).run(campaignId, now, now);

    // Force detected = true (roll = 0.1 <= 0.25)
    const result = executeCovertOperation(
      db,
      campaignId,
      {
        sourceCountryId: "norway",
        targetCountryId: "soviet-union",
        targetHexId: "hex-sov-murmansk",
        opType: "SABOTAGE_STOCKPILE_DEPOT",
      },
      0.1,
      0.1,
    );

    expect(result.detected).toBe(true);
    expect(result.message).toContain("COMPROMISED");

    // Verify Norway-Soviet treaty was voided
    const treaty = db
      .prepare(
        "SELECT id FROM diplomatic_treaties WHERE campaign_id = ? AND ((party_a_country_id = 'norway' AND party_b_country_id = 'soviet-union') OR (party_a_country_id = 'soviet-union' AND party_b_country_id = 'norway'))",
      )
      .get(campaignId);
    expect(treaty).toBeUndefined();
  });

  it("compiles comprehensive strategic theater context and force index", () => {
    const context = compileStrategicTheaterContext(db, campaignId, "norway");
    expect(context.campaignId).toBe(campaignId);
    expect(context.evaluatingCountryId).toBe("norway");
    expect(context.forceIndex.blufor.totalFormations).toBeGreaterThan(0);
    expect(context.forceIndex.opfor.totalFormations).toBeGreaterThan(0);
    expect(context.forceIndex.opfor.submarineCount).toBeGreaterThan(0);
    expect(context.economy.funds).toBe(2000);
  });

  it("negotiates treaties using heuristic AI when Ollama is offline", async () => {
    const response = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "sweden",
      treatyType: "non_aggression",
      durationTurns: 5,
      diceRoll: 1, // Guaranteed approval
    });

    expect(response.decision).toBe("accept");
    expect(response.diplomaticDialogue).toBeDefined();
    expect(response.ratifiedTreaty).toBeDefined();
    expect(response.ratifiedTreaty?.treatyType).toBe("non_aggression");
  });

  it("generates autonomous AI military orders for non-player units", () => {
    const sovietForm = db
      .prepare(
        "SELECT id FROM campaign_formations WHERE campaign_id = ? AND country_id = 'soviet-union' LIMIT 1",
      )
      .get(campaignId) as { id: string } | undefined;

    expect(sovietForm).toBeDefined();

    db.prepare(
      `UPDATE campaign_formations
       SET hex_id = 'hex-sea-north', metadata_json = '{"fuelLevel":15,"ammoLevel":15}'
       WHERE id = ?`,
    ).run(sovietForm!.id);

    const orders = processAiStrategicTurns(db, campaignId, "norway");
    expect(orders.length).toBeGreaterThan(0);
    const subOrder = orders.find((o) => o.formationId === sovietForm!.id);
    expect(subOrder?.action).toBe("rtb");
  });

  it("rejects alliance proposals between opposing Cold War blocs (NATO vs Warsaw Pact)", async () => {
    const response = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "soviet-union",
      treatyType: "alliance",
      durationTurns: 365,
    });

    expect(response.decision).toBe("reject");
    expect(response.reasoning).toContain("Ideological Adversaries");
    expect(response.ratifiedTreaty).toBeUndefined();
  });

  it("rejects military alliances targeting neutral states preserving armed neutrality", async () => {
    const response = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "sweden",
      treatyType: "alliance",
      durationTurns: 365,
    });

    expect(response.decision).toBe("reject");
    expect(response.reasoning.toLowerCase()).toContain("neutrality");
    expect(response.ratifiedTreaty).toBeUndefined();
  });

  it("counters adversary ceasefire proposal with demanded funds, fuel, and shortened duration", async () => {
    // Set relations to active war so ceasefire proposal is contextually valid
    db.prepare(
      "INSERT OR REPLACE INTO country_relations (campaign_id, country_id, related_country_id, stance) VALUES (?, 'norway', 'soviet-union', 'war')",
    ).run(campaignId);

    const response = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "soviet-union",
      treatyType: "ceasefire",
      durationTurns: 60,
      diceRoll: 90, // Guaranteed counter-offer
    });

    expect(response.decision).toBe("counter_offer");
    expect(response.counterTerms).toBeDefined();
    expect(response.counterTerms?.demandedFunds).toBe(450);
    expect(response.counterTerms?.demandedFuel).toBe(100);
    expect(response.counterTerms?.demandedProduction).toBe(50);
    expect(response.counterTerms?.durationTurns).toBe(30);
    expect(response.ratifiedTreaty).toBeUndefined();
  });

  it("accepts counter-offer, deducts demanded resources, ratifies accord, and triggers third-party fallout cables", () => {
    // Current economy has 2000 funds and 200 fuel
    const counterAcceptResult = acceptDiplomaticCounterOffer(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "soviet-union",
      treatyType: "ceasefire",
      durationTurns: 30,
      demandedFunds: 450,
      demandedFuel: 100,
      conditionSummary: "30-day trial armistice with reparations",
    });

    expect(counterAcceptResult.ok).toBe(true);
    expect(counterAcceptResult.ratifiedTreaty).toBeDefined();
    expect(counterAcceptResult.ratifiedTreaty?.treatyType).toBe("ceasefire");

    // Verify economic resource deduction
    const eco = db
      .prepare(
        "SELECT funds, fuel_stockpile FROM campaign_economy WHERE campaign_id = ?",
      )
      .get(campaignId) as { funds: number; fuel_stockpile: number };
    expect(eco.funds).toBe(1550); // 2000 - 450
    expect(eco.fuel_stockpile).toBe(100); // 200 - 100

    // Verify third-party fallout cables generated from Washington and London!
    expect(counterAcceptResult.falloutCables).toBeDefined();
    expect(counterAcceptResult.falloutCables!.length).toBeGreaterThanOrEqual(1);
    const usCable = counterAcceptResult.falloutCables!.find(
      (c) => c.senderCountryId === "united-states",
    );
    expect(usCable).toBeDefined();
    expect(usCable?.content).toContain("Article 5");
    expect(usCable?.stanceChange).toBe("allied -> strained");

    // Verify relations downgraded in database
    const relation = db
      .prepare(
        "SELECT stance FROM country_relations WHERE campaign_id = ? AND country_id = 'united-states' AND related_country_id = 'norway'",
      )
      .get(campaignId) as { stance: string } | undefined;
    expect(relation?.stance).toBe("strained");
  });

  it("enforces military transit rights when moving formations through sovereign neutral territory", () => {
    // Get Norwegian unit and set as naval formation
    const norUnit = db
      .prepare(
        "SELECT id FROM campaign_formations WHERE campaign_id = ? AND country_id = 'norway' LIMIT 1",
      )
      .get(campaignId) as { id: string };

    db.prepare(
      "UPDATE campaign_formations SET unit_type = 'surface_action_group', action_points = 2 WHERE id = ?",
    ).run(norUnit.id);

    // Register a neutral water hex belonging to Sweden
    const neutralSwedishWaters = "hex-w-qm15-rp32";
    db.prepare(
      `INSERT OR REPLACE INTO campaign_hex_cells (
        campaign_id, hex_id, side, country_id, contested, capture_turns_counter,
        depot_fuel, depot_missiles, depot_torpedoes, depot_shells, created_at, updated_at
      ) VALUES (?, ?, 'neutral', 'sweden', 0, 0, 100, 10, 5, 50, ?, ?)`,
    ).run(campaignId, neutralSwedishWaters, now, now);

    // Attempt to move into Swedish territory without transit rights
    const blockedMove = moveFormation(db, {
      campaignId,
      formationId: norUnit.id,
      targetHexId: neutralSwedishWaters,
    });
    expect(blockedMove.ok).toBe(false);
    expect(blockedMove.reason).toContain("Military Transit Rights");

    // Now establish a Military Transit Rights treaty with Sweden
    db.prepare(
      `INSERT INTO diplomatic_treaties (
        id, campaign_id, treaty_type, party_a_country_id, party_b_country_id, duration_turns, turns_remaining, created_at, updated_at
      ) VALUES ('tr-transit-1', ?, 'military_transit_rights', 'norway', 'sweden', 90, 90, ?, ?)`,
    ).run(campaignId, now, now);

    // Give unit AP to move
    db.prepare(
      "UPDATE campaign_formations SET action_points = 2 WHERE id = ?",
    ).run(norUnit.id);

    // Move should now succeed!
    const allowedMove = moveFormation(db, {
      campaignId,
      formationId: norUnit.id,
      targetHexId: neutralSwedishWaters,
    });
    expect(allowedMove.ok).toBe(true);
  });

  it("blocks nonsensical proposals (e.g. ceasefire during peacetime or with fellow allies)", async () => {
    // Norway proposing a ceasefire to USA (fellow NATO ally in peacetime)
    const allyCeasefire = validateTreatyEligibility(
      db,
      campaignId,
      "norway",
      "united-states",
      "ceasefire",
    );
    expect(allyCeasefire.eligible).toBe(false);
    expect(allyCeasefire.reason).toContain("allies");

    // Norway proposing ceasefire to neutral Sweden
    const neutralCeasefire = validateTreatyEligibility(
      db,
      campaignId,
      "norway",
      "sweden",
      "ceasefire",
    );
    expect(neutralCeasefire.eligible).toBe(false);
    expect(neutralCeasefire.reason).toContain("neutral state");

    // Calling negotiateDiplomaticProposal on an ineligible proposal rejects immediately
    const negResponse = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "united-states",
      treatyType: "ceasefire",
      durationTurns: 30,
    });
    expect(negResponse.decision).toBe("reject");
    expect(negResponse.diplomaticDialogue).toContain(
      "Ministry of Foreign Affairs",
    );
    expect(negResponse.ratifiedTreaty).toBeUndefined();
  });

  it("allows maritime trade agreements with neutral states and grants economic dividends", async () => {
    const tradeCheck = validateTreatyEligibility(
      db,
      campaignId,
      "norway",
      "sweden",
      "trade_agreement",
    );
    expect(tradeCheck.eligible).toBe(true);

    const tradeNeg = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "sweden",
      treatyType: "trade_agreement",
      durationTurns: 90,
      diceRoll: 1,
    });
    expect(tradeNeg.decision).toBe("accept");
    expect(tradeNeg.ratifiedTreaty).toBeDefined();
    expect(tradeNeg.ratifiedTreaty?.treatyType).toBe("trade_agreement");

    // Funds before turn tick: 2000
    db.prepare(
      "UPDATE campaign_economy SET funds = 2000 WHERE campaign_id = ?",
    ).run(campaignId);

    // Advance turn -> trade agreement grants +40 daily funds!
    processTurnStrategicHexesUpdate(db, campaignId);
    const eco = db
      .prepare("SELECT funds FROM campaign_economy WHERE campaign_id = ?")
      .get(campaignId) as { funds: number };
    expect(eco.funds).toBe(2040); // 2000 + 40
  });

  it("triggers autonomous AI-to-AI treaties and broadcasts Reuters/TASS world news dispatches", () => {
    db.prepare("DELETE FROM diplomatic_treaties WHERE campaign_id = ?").run(
      campaignId,
    );
    db.prepare("DELETE FROM world_news_dispatches WHERE campaign_id = ?").run(
      campaignId,
    );

    const result = processAutonomousAiDiplomacy(db, campaignId);
    expect(result.establishedTreaties.length).toBeGreaterThan(0);
    expect(result.newsDispatches.length).toBeGreaterThan(0);

    // Verify dispatches can be queried from database
    const dispatches = getWorldNewsDispatches(db, campaignId);
    expect(dispatches.length).toBeGreaterThan(0);
    const reuters = dispatches.find((d) => d.agency === "REUTERS");
    expect(reuters).toBeDefined();
    expect(reuters?.headline).toBeDefined();
  });

  it("detects foreign border proximity and dispatches protest cables to the embassy inbox", () => {
    const norUnit = db
      .prepare(
        "SELECT id FROM campaign_formations WHERE campaign_id = ? AND country_id = 'norway' LIMIT 1",
      )
      .get(campaignId) as { id: string };

    const seaCell = getHexCellDefinition("hex-sea-north");
    const neighbors = getHexNeighbors(seaCell);
    const sovNeighbor = neighbors[0];

    db.prepare(
      `INSERT OR REPLACE INTO campaign_hex_cells (
        campaign_id, hex_id, side, country_id, contested, capture_turns_counter,
        depot_fuel, depot_missiles, depot_torpedoes, depot_shells, created_at, updated_at
      ) VALUES (?, ?, 'opfor', 'soviet-union', 0, 0, 100, 10, 5, 50, ?, ?)`,
    ).run(campaignId, sovNeighbor.id, now, now);

    // Give unit AP
    db.prepare(
      "UPDATE campaign_formations SET unit_type = 'surface_action_group', action_points = 2 WHERE id = ?",
    ).run(norUnit.id);

    // Move to hex-sea-north adjacent to Soviet territory
    const moveRes = moveFormation(db, {
      campaignId,
      formationId: norUnit.id,
      targetHexId: "hex-sea-north",
    });
    expect(moveRes.ok).toBe(true);

    // Check cables inbox
    const cables = getDiplomaticCables(db, campaignId);
    expect(cables.length).toBeGreaterThan(0);
    const sovDemarche = cables.find(
      (c) => c.senderCountryId === "soviet-union",
    );
    expect(sovDemarche).toBeDefined();
    expect(sovDemarche?.header).toContain("BORDER PROTEST");

    // Mark all cables as read
    const updated = markDiplomaticCablesAsRead(db, campaignId);
    expect(updated).toBeGreaterThan(0);

    // Verify all cables are marked read
    const freshCables = getDiplomaticCables(db, campaignId);
    expect(freshCables.every((c) => c.isRead)).toBe(true);
  });

  it("computes probabilistic odds with tribute scaling and factor breakdown", () => {
    // Base trade agreement with Sweden
    const baseOdds = calculateTreatyOdds(
      db,
      campaignId,
      "norway",
      "sweden",
      "trade_agreement",
      180,
      0,
    );
    expect(baseOdds.isHardRedline).toBe(false);
    expect(baseOdds.oddsPercent).toBeGreaterThan(0);
    expect(baseOdds.breakdown.length).toBeGreaterThan(0);

    // Sweeten offer with $400 economic tribute
    const sweetenedOdds = calculateTreatyOdds(
      db,
      campaignId,
      "norway",
      "sweden",
      "trade_agreement",
      180,
      400,
    );
    expect(sweetenedOdds.oddsPercent).toBeGreaterThan(baseOdds.oddsPercent);
    const tributeFactor = sweetenedOdds.breakdown.find((b) =>
      b.factor.includes("Tribute"),
    );
    expect(tributeFactor).toBeDefined();
    expect(tributeFactor?.delta).toBe(20);
  });

  it("accepts counter-offer demanding production points alongside funds and fuel", () => {
    // Set initial economy: 1000 funds, 200 fuel, 150 production
    db.prepare(
      "UPDATE campaign_economy SET funds = 1000, fuel_stockpile = 200, production_points = 150 WHERE campaign_id = ?",
    ).run(campaignId);

    // Test rejection when production points insufficient
    const failRes = acceptDiplomaticCounterOffer(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "sweden",
      treatyType: "joint_production_pact",
      durationTurns: 90,
      demandedFunds: 200,
      demandedFuel: 50,
      demandedProduction: 200, // Demands 200 PP, player only has 150 PP
    });
    expect(failRes.ok).toBe(false);
    expect(failRes.error).toContain(
      "Insufficient industrial production points",
    );

    // Test success when reserves sufficient
    const successRes = acceptDiplomaticCounterOffer(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "sweden",
      treatyType: "joint_production_pact",
      durationTurns: 90,
      demandedFunds: 200,
      demandedFuel: 50,
      demandedProduction: 40,
    });
    expect(successRes.ok).toBe(true);
    expect(successRes.ratifiedTreaty).toBeDefined();

    // Verify all three resources deducted
    const econ = db
      .prepare(
        "SELECT funds, fuel_stockpile, production_points FROM campaign_economy WHERE campaign_id = ?",
      )
      .get(campaignId) as {
      funds: number;
      fuel_stockpile: number;
      production_points: number;
    };
    expect(econ.funds).toBe(800); // 1000 - 200
    expect(econ.fuel_stockpile).toBe(150); // 200 - 50
    expect(econ.production_points).toBe(110); // 150 - 40

    // Verify accepting a counter-offer with 0 production succeeds even if player economy has 0 PP
    db.prepare(
      "UPDATE campaign_economy SET funds = 500, fuel_stockpile = 100, production_points = 0 WHERE campaign_id = ?",
    ).run(campaignId);

    const zeroProdRes = acceptDiplomaticCounterOffer(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "sweden",
      treatyType: "joint_production_pact",
      durationTurns: 60,
      demandedFunds: 100,
      demandedFuel: 20,
      demandedProduction: 0, // 0 production demanded
    });
    expect(zeroProdRes.ok).toBe(true);
    expect(zeroProdRes.ratifiedTreaty).toBeDefined();

    const econAfterZero = db
      .prepare(
        "SELECT funds, fuel_stockpile, production_points FROM campaign_economy WHERE campaign_id = ?",
      )
      .get(campaignId) as {
      funds: number;
      fuel_stockpile: number;
      production_points: number;
    };
    expect(econAfterZero.funds).toBe(400); // 500 - 100
    expect(econAfterZero.fuel_stockpile).toBe(80); // 100 - 20
    expect(econAfterZero.production_points).toBe(0); // unchanged at 0
  });

  it("tracks bilateral relation scores, boosts goodwill on generous offers, and degrades relations on insulting redline offers", async () => {
    // Initial relations between Norway (NATO) and Sweden (Neutral)
    const initialRel = getBilateralRelationshipDetails(
      db,
      campaignId,
      "norway",
      "sweden",
    );
    expect(initialRel.score).toBe(25);
    expect(initialRel.stance).toBe("friendly");

    // Propose generous offer ($350 tribute) -> boosts relations
    const generousNeg = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "sweden",
      treatyType: "trade_agreement",
      durationTurns: 90,
      offeredTributeFunds: 350,
      diceRoll: 1,
    });
    expect(generousNeg.decision).toBe("accept");
    // Initial (25) + Generous (+15) + Accept (+12) = 52
    expect(generousNeg.updatedRelations?.score).toBeGreaterThan(40);
    expect(generousNeg.updatedRelations?.stance).toBe("friendly");

    // Outrageous proposal: Norway demands Military Transit Rights from neutral Sweden with 0 funds -> causes chill
    const transitNeg = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "sweden",
      treatyType: "military_transit_rights",
      durationTurns: 180,
      offeredTributeFunds: 0,
      diceRoll: 99,
    });
    expect(transitNeg.decision).toBe("counter_offer");
    expect(transitNeg.updatedRelations).toBeDefined();

    // Redline proposal: Norway proposes military alliance to Soviet Union -> severe redline penalty (-20)
    const redlineNeg = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "soviet-union",
      treatyType: "alliance",
      durationTurns: 365,
    });
    expect(redlineNeg.decision).toBe("reject");
    // Initial cold war adversary (-70) - 20 = -90
    expect(redlineNeg.updatedRelations?.score).toBe(-90);
    expect(redlineNeg.updatedRelations?.stance).toBe("war");
  }, 20000);

  it("foments authentic Casus Belli pretexts with legitimacy odds when relations severely deteriorate", () => {
    // Severe drop in relations with Soviet Union to -85
    const plungedRel = adjustBilateralRelations(
      db,
      campaignId,
      "norway",
      "soviet-union",
      -20,
      "Covert maritime reconnaissance and submarine intrusion",
    );
    expect(plungedRel.score).toBe(-90);
    expect(plungedRel.activeCasusBelli).toBeDefined();
    expect(plungedRel.activeCasusBelli?.name).toContain(
      "Shelling of Mainila Protocol",
    );
    expect(plungedRel.activeCasusBelli?.legitimacyOdds).toBeGreaterThanOrEqual(
      60,
    );
    expect(plungedRel.activeCasusBelli?.historicalAnalog).toContain(
      "Winter War",
    );

    // Verify odds calculation detects active Casus Belli
    const odds = calculateTreatyOdds(
      db,
      campaignId,
      "norway",
      "soviet-union",
      "ceasefire",
      30,
      0,
    );
    expect(odds.relationshipDetails?.activeCasusBelli).toBeDefined();
    expect(odds.relationshipDetails?.activeCasusBelli?.name).toBe(
      plungedRel.activeCasusBelli?.name,
    );
  });

  it("handles declining diplomatic counter-offers with diplomatic chill and ambassadorial cable logging", () => {
    const declineResult = declineDiplomaticCounterOffer(db, campaignId, {
      decliningCountryId: "norway",
      targetCountryId: "sweden",
      treatyType: "joint_production_pact",
      reason: "Leadership refuses to meet exorbitant shipyard quotas",
    });

    expect(declineResult.ok).toBe(true);
    expect(declineResult.cableRecorded).toBeDefined();
    expect(declineResult.cableRecorded.header).toContain("TALKS COLLAPSE");
    expect(declineResult.cableRecorded.content).toContain(
      "formally declines the strategic indemnity demands",
    );
    expect(declineResult.updatedRelations.score).toBe(20); // 25 initial - 5 breakdown = 20

    // Cable should appear in embassy inbox
    const cables = getDiplomaticCables(db, campaignId);
    const foundCable = cables.find((c) =>
      c.header.includes("TALKS COLLAPSE // REJECTION OF JOINT_PRODUCTION_PACT"),
    );
    expect(foundCable).toBeDefined();
    expect(foundCable?.recipientCountryId).toBe("norway");
  });

  it("handles declining diplomatic counter-offers with all theater nations (Finland, Denmark, Iceland, West Germany) without foreign key constraints", () => {
    for (const targetCountryId of [
      "finland",
      "denmark",
      "west-germany",
      "iceland",
      "soviet-union",
    ]) {
      const res = declineDiplomaticCounterOffer(db, campaignId, {
        decliningCountryId: "norway",
        targetCountryId,
        treatyType: "basing_rights",
        reason: `Rejected counter-demands from ${targetCountryId}`,
      });
      expect(res.ok).toBe(true);
      expect(res.cableRecorded).toBeDefined();
      expect(res.updatedRelations).toBeDefined();
    }
  });

  it("uses authentic Political Bureau verbiage instead of meta words like alienating bounty", async () => {
    const sovietNeg = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "soviet-union",
      treatyType: "ceasefire",
      durationTurns: 30,
      diceRoll: 99, // Force counter-offer
    });

    expect(sovietNeg.decision).toBe("counter_offer");
    // Check that meta terms are NOT present
    expect(sovietNeg.diplomaticDialogue.toLowerCase()).not.toContain(
      "alienating",
    );
    expect(sovietNeg.diplomaticDialogue.toLowerCase()).not.toContain("bounty");

    // Check that authentic Politburo language is present
    expect(sovietNeg.diplomaticDialogue).toContain(
      "Politburo of the Central Committee of the CPSU",
    );
    expect(sovietNeg.diplomaticDialogue).toContain(
      "state strategic indemnities",
    );

    // Condition summary must also be authentic statecraft
    expect(
      sovietNeg.counterTerms?.conditionSummary.toLowerCase(),
    ).not.toContain("alienating");
    expect(
      sovietNeg.counterTerms?.conditionSummary.toLowerCase(),
    ).not.toContain("bounty");
    expect(sovietNeg.counterTerms?.conditionSummary).toContain("reparations");
  });

  it("logs and retrieves bilateral relationship event ledgers with positive bonuses and negative maluses", () => {
    // 1. Initial relations between Norway and Sweden have baselineReason and initial event
    const initialRel = getBilateralRelationshipDetails(
      db,
      campaignId,
      "norway",
      "sweden",
    );
    expect(initialRel.score).toBe(25);
    expect(initialRel.baselineReason).toContain(
      "Scandinavian Armed Neutrality",
    );
    expect(initialRel.events).toBeDefined();
    expect(initialRel.events!.length).toBeGreaterThan(0);

    // 2. Adjust relations with dynamic events
    adjustBilateralRelations(
      db,
      campaignId,
      "norway",
      "sweden",
      15,
      "Maritime trade reciprocity and diplomatic goodwill",
    );
    adjustBilateralRelations(
      db,
      campaignId,
      "norway",
      "sweden",
      -20,
      "Refusal of mutual defense guarantees in Baltic zone",
    );

    const updatedRel = getBilateralRelationshipDetails(
      db,
      campaignId,
      "norway",
      "sweden",
    );
    expect(updatedRel.score).toBe(20); // 25 + 15 - 20 = 20
    expect(updatedRel.events!.length).toBe(2);

    const positiveEvt = updatedRel.events!.find((e) => e.deltaScore === 15);
    expect(positiveEvt).toBeDefined();
    expect(positiveEvt!.reason).toBe(
      "Maritime trade reciprocity and diplomatic goodwill",
    );

    const negativeEvt = updatedRel.events!.find((e) => e.deltaScore === -20);
    expect(negativeEvt).toBeDefined();
    expect(negativeEvt!.reason).toBe(
      "Refusal of mutual defense guarantees in Baltic zone",
    );
  });

  it("calculates diplomatic approval odds with multi-asset concessions (fuel, PP, tech, formations, hexes)", () => {
    const baseOdds = calculateTreatyOdds(
      db,
      campaignId,
      "norway",
      "sweden",
      "trade_agreement",
      180,
    );

    // Sweeten with multi-asset package: fuel, production, tech license, formation, and hex
    const multiAssetOdds = calculateTreatyOdds(
      db,
      campaignId,
      "norway",
      "sweden",
      "trade_agreement",
      180,
      {
        mode: "offer",
        funds: 200,
        fuel: 80,
        production: 40,
        techSharing: true,
        transferredFormationId: "form-nor-patrol",
        cededHexId: "hex-nor-border",
      },
    );

    expect(multiAssetOdds.oddsPercent).toBeGreaterThan(baseOdds.oddsPercent);

    const fuelFactor = multiAssetOdds.breakdown.find((b) =>
      b.factor.includes("Fuel"),
    );
    expect(fuelFactor).toBeDefined();

    const prodFactor = multiAssetOdds.breakdown.find((b) =>
      b.factor.includes("Munitions Quota"),
    );
    expect(prodFactor).toBeDefined();

    const techFactor = multiAssetOdds.breakdown.find((b) =>
      b.factor.includes("Tech Sharing"),
    );
    expect(techFactor).toBeDefined();

    const formationFactor = multiAssetOdds.breakdown.find((b) =>
      b.factor.includes("Military Formation"),
    );
    expect(formationFactor).toBeDefined();

    const hexFactor = multiAssetOdds.breakdown.find((b) =>
      b.factor.includes("Sovereign"),
    );
    expect(hexFactor).toBeDefined();
  });

  it("handles aggressive sovereign ultimatums with authentic Soviet Politburo defiance and severe relation penalty", async () => {
    // Initial relations with Soviet Union: -70
    const initialRel = getBilateralRelationshipDetails(
      db,
      campaignId,
      "norway",
      "soviet-union",
    );
    expect(initialRel.score).toBe(-70);

    // Player demands tribute from Soviet Union without overwhelming military power (sovereign ultimatum)
    const ultimatumResponse = await negotiateDiplomaticProposal(
      db,
      campaignId,
      {
        proposingCountryId: "norway",
        targetCountryId: "soviet-union",
        treatyType: "ceasefire",
        durationTurns: 30,
        tribute: {
          mode: "demand",
          funds: 500,
          fuel: 200,
          production: 100,
        },
      },
    );

    // Must be rejected with authentic Politburo defiance
    expect(ultimatumResponse.decision).toBe("threaten_war");
    expect(ultimatumResponse.diplomaticDialogue).toContain(
      "The Politburo of the Central Committee of the CPSU does not bend to imperialist extortion",
    );
    expect(ultimatumResponse.diplomaticDialogue).toContain(
      "Red Banner Northern Fleet",
    );

    // Severe relation damage (-25 points)
    expect(ultimatumResponse.updatedRelations).toBeDefined();
    expect(ultimatumResponse.updatedRelations!.score).toBeLessThanOrEqual(-95);

    // Check embassy cables for ambassadorial demarche
    const cables = getDiplomaticCables(db, campaignId);
    const demarche = cables.find(
      (c) => c.header.includes("DEMARCHE") && c.header.includes("ULTIMATUM"),
    );
    expect(demarche).toBeDefined();
    expect(demarche!.content).toContain("extortion or insolent ultimatums");
  });

  it("executes multi-asset deductions and formation/hex transfers upon treaty ratification", async () => {
    // Set initial economy
    db.prepare(
      "UPDATE campaign_economy SET funds = 800, fuel_stockpile = 400, production_points = 200 WHERE campaign_id = ?",
    ).run(campaignId);

    // Get a Norwegian formation and assign a known hex
    const norForm = db
      .prepare(
        "SELECT id FROM campaign_formations WHERE campaign_id = ? AND country_id = 'norway' LIMIT 1",
      )
      .get(campaignId) as { id: string } | undefined;
    expect(norForm).toBeDefined();

    // Player offers Sweden a generous trade accord with funds, fuel, PP, and unit transfer
    const negotiation = await negotiateDiplomaticProposal(db, campaignId, {
      proposingCountryId: "norway",
      targetCountryId: "sweden",
      treatyType: "trade_agreement",
      durationTurns: 90,
      diceRoll: 1, // Guaranteed ratification
      tribute: {
        mode: "offer",
        funds: 250,
        fuel: 100,
        production: 50,
        transferredFormationId: norForm!.id,
      },
    });

    expect(negotiation.decision).toBe("accept");

    // Verify economic assets were deducted
    const economy = db
      .prepare(
        "SELECT funds, fuel_stockpile, production_points FROM campaign_economy WHERE campaign_id = ?",
      )
      .get(campaignId) as {
      funds: number;
      fuel_stockpile: number;
      production_points: number;
    };
    expect(economy.funds).toBe(550); // 800 - 250
    expect(economy.fuel_stockpile).toBe(300); // 400 - 100
    expect(economy.production_points).toBe(150); // 200 - 50

    // Verify formation ownership transferred to Sweden
    const transferredForm = db
      .prepare("SELECT country_id, side FROM campaign_formations WHERE id = ?")
      .get(norForm!.id) as { country_id: string; side: string };
    expect(transferredForm.country_id).toBe("sweden");
    expect(transferredForm.side).toBe("neutral");
  });
});
