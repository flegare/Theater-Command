import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  openDatabase,
  type CampaignDatabase,
} from "../../src/infrastructure/database.js";
import { migrateDatabase } from "../../src/infrastructure/migrations.js";
import {
  getStartingEconomyForCountry,
  getCampaignHexState,
  moveFormation,
  issueFormationMovementOrder,
  cancelFormationMovementOrder,
  dismissCompletedMovementOrder,
  recruitFormation,
  embarkFormation,
  disembarkFormation,
  refuelAndRearmFormation,
  restAndRefitFormation,
  orderCombatTraining,
  generateSeaPowerHexBattle,
  updateFormationComposition,
} from "../../src/application/hexStrategicSystem.js";
import {
  advanceCampaignDay,
  seedCampaignLedger,
} from "../../src/application/campaignLedger.js";
import {
  purchaseMarketUnit,
  getPendingMarketOrders,
} from "../../src/domain/militaryMarket.js";
import {
  establishDiplomaticTreaty,
  getActiveDiplomaticTreaties,
} from "../../src/domain/diplomacy.js";
import { upgradeHexInvestment } from "../../src/domain/hexInvestments.js";

describe("hex strategic economy and tactical bridge", () => {
  let directory: string;
  let database: CampaignDatabase;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "theater-hex-test-"));
    database = openDatabase({
      databasePath: join(directory, "campaign.sqlite"),
    });
    migrateDatabase(database);

    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO campaigns (id, scenario_family_id, scenario_variant_id, name, seed, difficulty, tech_mode, status, campaign_time, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "camp-1",
        "northern-flank-1985",
        "norway-defense",
        "Test Campaign",
        "seed-1",
        "standard",
        "historical",
        "active",
        now,
        now,
      );

    database
      .prepare(
        `INSERT INTO campaign_players (campaign_id, country_id, created_at)
         VALUES (?, ?, ?)`,
      )
      .run("camp-1", "norway", now);

    seedCampaignLedger(database, {
      campaignId: "camp-1",
      scenarioFamilyId: "northern-flank-1985",
      playerCountryId: "norway",
      campaignTime: now,
      strategicSites: [],
    });
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("getStartingEconomyForCountry provides calibrated treasury, production, and fuel", () => {
    const usaEco = getStartingEconomyForCountry("united-states");
    expect(usaEco.funds).toBe(4500);
    expect(usaEco.productionPoints).toBe(120);
    expect(usaEco.fuelStockpile).toBe(450);

    const sovEco = getStartingEconomyForCountry("soviet-union");
    expect(sovEco.funds).toBe(4200);
    expect(sovEco.productionPoints).toBe(140);
    expect(sovEco.fuelStockpile).toBe(500);

    const norEco = getStartingEconomyForCountry("norway");
    expect(norEco.funds).toBe(1800);
    expect(norEco.productionPoints).toBe(90);
    expect(norEco.fuelStockpile).toBe(380);
  });

  it("seedCampaignFormations creates starting forces in Baltic theater", () => {
    const state = getCampaignHexState(database, "camp-1");
    expect(state.formations.length >= 8).toBe(true);

    const norwayUnits = state.formations.filter(
      (f) => f.countryId === "norway",
    );
    expect(
      norwayUnits.some((u) => u.unitType === "mechanized_infantry_division"),
    ).toBe(true);
    expect(norwayUnits.some((u) => u.unitType === "surface_action_group")).toBe(
      true,
    );
    expect(
      norwayUnits.some((u) => u.unitType === "sealift_transport_flotilla"),
    ).toBe(true);
    expect(
      norwayUnits.some((u) => u.unitType === "tactical_fighter_wing"),
    ).toBe(true);

    const sovUnits = state.formations.filter(
      (f) => f.countryId === "soviet-union",
    );
    expect(sovUnits.some((u) => u.unitType === "pact_tank_division")).toBe(
      true,
    );

    // Verify Murmansk / Kola Peninsula / Polyarny garrison & fleet
    const kolaUnits = state.formations.filter((f) => f.hexId === "hex-sov-kola");
    expect(kolaUnits.length).toBeGreaterThanOrEqual(6);
    expect(kolaUnits.some((u) => u.unitType === "surface_action_group")).toBe(true);
    expect(kolaUnits.some((u) => u.unitType === "carrier_strike_group")).toBe(true);
    expect(kolaUnits.some((u) => u.unitType === "maritime_strike_squadron")).toBe(true);
    expect(kolaUnits.some((u) => u.unitType === "tactical_fighter_wing")).toBe(true);
    expect(kolaUnits.some((u) => u.unitType === "marine_amphibious_brigade")).toBe(true);
    expect(kolaUnits.some((u) => u.unitType === "pact_tank_division")).toBe(true);

    const polyarnyUnits = state.formations.filter(
      (f) => f.hexId === "hex-sov-polyarny",
    );
    expect(polyarnyUnits.length).toBeGreaterThanOrEqual(1);
    expect(polyarnyUnits.some((u) => u.unitType === "submarine_squadron")).toBe(true);
  });

  it("moveFormation moves division to valid neighbor and expends AP", () => {
    const state = getCampaignHexState(database, "camp-1");
    const norSag = state.formations.find(
      (f) =>
        f.countryId === "norway" &&
        f.unitType === "surface_action_group" &&
        f.hexId === "hex-nor-bergen",
    );
    expect(norSag).toBeDefined();

    // Move from Bergen to North Sea
    const moveResult = moveFormation(database, {
      campaignId: "camp-1",
      formationId: norSag!.id,
      targetHexId: "hex-sea-north",
    });
    expect(moveResult.ok).toBe(true);

    const updatedState = getCampaignHexState(database, "camp-1");
    const updatedSag = updatedState.formations.find(
      (f) => f.id === norSag!.id,
    )!;
    expect(updatedSag.hexId).toBe("hex-sea-north");
    expect(updatedSag.actionPoints).toBe(1);
    expect(updatedSag.status).toBe("moved");
  });

  it("embarkFormation and disembarkFormation manages sealift transport", () => {
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO campaign_formations (id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "sealift-1",
        "camp-1",
        "Sealift Group 1",
        "sealift_transport_flotilla",
        "blufor",
        "united-states",
        "hex-nor-bergen",
        100,
        1,
        1,
        "ready",
        "{}",
        now,
        now,
      );
    database
      .prepare(
        `INSERT INTO campaign_formations (id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "armor-1",
        "camp-1",
        "1st Armored Division",
        "nato_armored_division",
        "blufor",
        "united-states",
        "hex-nor-bergen",
        100,
        1,
        1,
        "ready",
        "{}",
        now,
        now,
      );

    // 1. Order Embarkation (takes 1 turn)
    const embarkResult = embarkFormation(database, {
      campaignId: "camp-1",
      groundFormationId: "armor-1",
      sealiftFormationId: "sealift-1",
    });
    expect(embarkResult.ok).toBe(true);

    const midState = getCampaignHexState(database, "camp-1");
    const embarkingArmor = midState.formations.find((f) => f.id === "armor-1")!;
    expect(embarkingArmor.status).toBe("embarking");
    expect(embarkingArmor.embarkTurnsRemaining).toBe(1);

    // 2. Advance day to complete embarkation loading
    advanceCampaignDay(database, "camp-1");

    const loadedState = getCampaignHexState(database, "camp-1");
    const loadedArmor = loadedState.formations.find((f) => f.id === "armor-1")!;
    expect(loadedArmor.status).toBe("embarked");

    // 3. Move sealift to sea
    const sealiftMove = moveFormation(database, {
      campaignId: "camp-1",
      formationId: "sealift-1",
      targetHexId: "hex-sea-north",
    });
    expect(sealiftMove.ok).toBe(true);

    // Verify armor moved synchronously with sealift to sea
    const seaState = getCampaignHexState(database, "camp-1");
    const seaArmor = seaState.formations.find((f) => f.id === "armor-1")!;
    expect(seaArmor.hexId).toBe("hex-sea-north");
    expect(seaArmor.embarkedOnId).toBe("sealift-1");
    expect(seaArmor.status).toBe("embarked");

    // 4. Disembark armor back onto land (takes 1 turn)
    const disembarkResult = disembarkFormation(database, {
      campaignId: "camp-1",
      groundFormationId: "armor-1",
      targetHexId: "hex-nor-oslo",
    });
    expect(disembarkResult.ok).toBe(true);

    // Advance turn to complete offload
    advanceCampaignDay(database, "camp-1");

    const landedState = getCampaignHexState(database, "camp-1");
    const landedArmor = landedState.formations.find((f) => f.id === "armor-1")!;
    expect(landedArmor.hexId).toBe("hex-nor-oslo");
    expect(landedArmor.embarkedOnId).toBeNull();
    expect(landedArmor.status).toBe("ready");
  });

  it("advanceCampaignDay calculates hex multi-resource turn economy deltas", () => {
    const res = advanceCampaignDay(database, "camp-1");
    expect(res).toBeDefined();
    expect(res?.fundsDelta).toBeDefined();
    expect(res?.productionDelta).toBeDefined();
    expect(res?.fuelDelta).toBeDefined();
  });

  it("generateSeaPowerHexBattle creates valid Sea Power .ini mission file", () => {
    const battle = generateSeaPowerHexBattle(database, {
      campaignId: "camp-1",
      hexId: "hex-nor-bergen",
      missionTitle: "Battle of Vestlandet",
    });
    expect(battle.ok).toBe(true);
    expect(battle.missionText.includes("[Mission]")).toBe(true);
    expect(battle.missionText.includes("Title=Battle of Vestlandet")).toBe(
      true,
    );
    expect(battle.missionText.includes("[Environment]")).toBe(true);
    expect(battle.unitsCount > 0).toBe(true);
  });

  it("recruitFormation purchases and deploys military formations", () => {
    // 1. Air wing requires Air Base
    const invalidAirRecruit = recruitFormation(database, {
      campaignId: "camp-1",
      unitType: "tactical_fighter_wing",
      hexId: "hex-den-skagerrak", // Chokepoint with no air base
      countryId: "norway",
    });
    expect(invalidAirRecruit.ok).toBe(false);
    expect(invalidAirRecruit.reason).toContain("Air Base");

    // 2. Successful Air Wing recruitment at Bergen (has air_base)
    const validAirRecruit = recruitFormation(database, {
      campaignId: "camp-1",
      unitType: "tactical_fighter_wing",
      hexId: "hex-nor-bergen",
      countryId: "norway",
      customName: "333rd Squadron Skvadron (Orion / F-16)",
    });
    expect(validAirRecruit.ok).toBe(true);
    expect(validAirRecruit.formation?.name).toBe(
      "333rd Squadron Skvadron (Orion / F-16)",
    );
    expect(validAirRecruit.formation?.hexId).toBe("hex-nor-bergen");

    // 3. Successful Surface Action Group recruitment after economy replenishes
    database
      .prepare(
        `UPDATE campaign_economy SET funds = 2000, production_points = 200 WHERE campaign_id = 'camp-1'`,
      )
      .run();

    const validSagRecruit = recruitFormation(database, {
      campaignId: "camp-1",
      unitType: "surface_action_group",
      hexId: "hex-nor-bergen",
      countryId: "norway",
    });
    console.log("validSagRecruit:", validSagRecruit);
    expect(validSagRecruit.ok).toBe(true);
    expect(validSagRecruit.formation?.unitType).toBe("surface_action_group");

    // Verify units are now present in campaign state
    const state = getCampaignHexState(database, "camp-1");
    expect(
      state.formations.some(
        (f) => f.name === "333rd Squadron Skvadron (Orion / F-16)",
      ),
    ).toBe(true);
  });

  it("issues multi-turn movement orders and advances unit N of X steps each turn", () => {
    // 1. Recruit a naval Surface Action Group at Bergen (max AP = 2)
    database
      .prepare(
        `UPDATE campaign_economy SET funds = 2000, production_points = 200 WHERE campaign_id = 'camp-1'`,
      )
      .run();

    const recruit = recruitFormation(database, {
      campaignId: "camp-1",
      unitType: "surface_action_group",
      hexId: "hex-nor-bergen",
      countryId: "norway",
    });
    expect(recruit.ok).toBe(true);
    const formId = recruit.formation!.id;

    // 2. Issue multi-turn movement order to North Sea Oil Basin (3 steps away)
    const order = issueFormationMovementOrder(database, {
      campaignId: "camp-1",
      formationId: formId,
      targetHexId: "hex-sea-north",
    });

    expect(order.ok).toBe(true);
    expect(order.route).toBeDefined();
    expect(order.route?.targetHexId).toBe("hex-sea-north");
    expect(order.route?.status).toBe("in_transit");
    expect(order.route?.totalTurns).toBe(2);
    // Initial AP = 2 used for first 2 steps: currentWaypointIndex = 2
    expect(order.route?.currentWaypointIndex).toBe(2);
    expect(order.route?.turnsElapsed).toBe(1);
    expect(order.formation?.actionPoints).toBe(0);

    // 3. Advance Strategic Turn (+1 Day)
    const adv = advanceCampaignDay(database, "camp-1");
    expect(adv).toBeDefined();

    // 4. Verify the formation advanced to destination hex-sea-north and arrived
    const stateAfter = getCampaignHexState(database, "camp-1");
    const updatedForm = stateAfter.formations.find((f) => f.id === formId);
    expect(updatedForm).toBeDefined();
    expect(updatedForm?.hexId).toBe("hex-sea-north");
    expect(updatedForm?.activeRoute?.status).toBe("arrived");
    expect(updatedForm?.activeRoute?.currentWaypointIndex).toBe(
      updatedForm!.activeRoute!.totalWaypoints - 1,
    );
  });

  it("allows cancelling an active movement order and keeps formation at intermediate waypoint", () => {
    database
      .prepare(
        `UPDATE campaign_economy SET funds = 2000, production_points = 200 WHERE campaign_id = 'camp-1'`,
      )
      .run();

    const recruit = recruitFormation(database, {
      campaignId: "camp-1",
      unitType: "surface_action_group",
      hexId: "hex-nor-bergen",
      countryId: "norway",
    });
    const formId = recruit.formation!.id;

    const order = issueFormationMovementOrder(database, {
      campaignId: "camp-1",
      formationId: formId,
      targetHexId: "hex-sea-north",
    });
    expect(order.ok).toBe(true);
    const midHex = order.formation!.hexId;

    const cancel = cancelFormationMovementOrder(database, {
      campaignId: "camp-1",
      formationId: formId,
    });
    expect(cancel.ok).toBe(true);
    expect(cancel.formation?.activeRoute).toBeUndefined();
    expect(cancel.formation?.hexId).toBe(midHex);

    // Advance turn -> formation should stay at midHex
    advanceCampaignDay(database, "camp-1");
    const state = getCampaignHexState(database, "camp-1");
    const formAfter = state.formations.find((f) => f.id === formId);
    expect(formAfter?.hexId).toBe(midHex);
  });

  it("calculates sovereign territory tally and income strictly for player nation", () => {
    // When playing as Norway, hex state turn summary tallies Norwegian sovereign tiles and forces
    const state = getCampaignHexState(database, "camp-1", "norway");
    expect(state.turnSummary.controlledHexCount).toBeGreaterThan(0);
    // Norwegian sovereign hexes (Bergen, Oslo, Trondheim, Tromsø, Bodø, etc.)
    expect(state.turnSummary.grossFunds).toBeGreaterThan(0);
    expect(state.turnSummary.upkeepFunds).toBeGreaterThan(0);
    // Net daily surplus
    expect(state.turnSummary.netFundsDelta).toBe(
      state.turnSummary.grossFunds - state.turnSummary.upkeepFunds,
    );

    // If querying from US perspective, US sovereign tiles and forces are calculated instead
    const usaState = getCampaignHexState(database, "camp-1", "united-states");
    expect(usaState.turnSummary).toBeDefined();
  });

  it("restricts player from ordering or modifying allied NATO formations", () => {
    const state = getCampaignHexState(database, "camp-1", "norway");
    const usCarrier = state.formations.find(
      (f) =>
        f.countryId === "united-states" &&
        f.unitType === "carrier_strike_group",
    );
    expect(usCarrier).toBeDefined();

    // 1. Move attempt on Allied carrier should be rejected
    const moveRes = moveFormation(database, {
      campaignId: "camp-1",
      formationId: usCarrier!.id,
      targetHexId: "hex-sea-norwegian",
      playerCountryId: "norway",
    });
    expect(moveRes.ok).toBe(false);
    expect(moveRes.reason).toContain("Allied NATO formation");

    // 2. Issue movement order on Allied carrier should be rejected
    const orderRes = issueFormationMovementOrder(database, {
      campaignId: "camp-1",
      formationId: usCarrier!.id,
      targetHexId: "hex-sea-norwegian",
      playerCountryId: "norway",
    });
    expect(orderRes.ok).toBe(false);
    expect(orderRes.reason).toContain("Allied NATO formation");

    // 3. Modifying roster of Allied carrier should be rejected
    const editRes = updateFormationComposition(
      database,
      "camp-1",
      usCarrier!.id,
      {
        name: "Renamed CSG",
        playerCountryId: "norway",
      },
    );
    expect(editRes.ok).toBe(false);
    expect(editRes.error).toContain("Allied NATO formation");
  });

  it("advanceCampaignDay advances the campaign date and persists it", () => {
    const initialDate = "1983-11-05T06:00:00.000Z";
    database
      .prepare(`UPDATE campaigns SET campaign_time = ? WHERE id = 'camp-1'`)
      .run(initialDate);

    const adv1 = advanceCampaignDay(database, "camp-1");
    expect(adv1?.campaignTime).toBe("1983-11-06T06:00:00.000Z");

    const adv2 = advanceCampaignDay(database, "camp-1");
    expect(adv2?.campaignTime).toBe("1983-11-07T06:00:00.000Z");

    const adv3 = advanceCampaignDay(database, "camp-1");
    expect(adv3?.campaignTime).toBe("1983-11-08T06:00:00.000Z");
  });

  it("handles friendly port operations (refuel, rearm, shore leave R&R, combat training, route dismissal)", () => {
    // 1. Refuel and Rearm Norwegian Surface Group in Bergen port
    const stateBefore = getCampaignHexState(database, "camp-1");
    const norwaySag = stateBefore.formations.find(
      (f) => f.countryId === "norway" && f.unitType === "surface_action_group",
    )!;

    const refuelRes = refuelAndRearmFormation(database, {
      campaignId: "camp-1",
      formationId: norwaySag.id,
      playerCountryId: "norway",
    });
    expect(refuelRes.ok).toBe(true);
    expect(refuelRes.fundsCost).toBe(25);
    expect(refuelRes.fuelCost).toBe(15);

    // 2. Shore Leave R&R in Bergen restores morale
    const restRes = restAndRefitFormation(database, {
      campaignId: "camp-1",
      formationId: norwaySag.id,
      playerCountryId: "norway",
    });
    expect(restRes.ok).toBe(true);

    // 3. Issue combat training drills for 2 turns
    const trainRes = orderCombatTraining(database, {
      campaignId: "camp-1",
      formationId: norwaySag.id,
      turns: 2,
      playerCountryId: "norway",
    });
    expect(trainRes.ok).toBe(true);

    const trainingState = getCampaignHexState(database, "camp-1");
    const trainingSag = trainingState.formations.find(
      (f) => f.id === norwaySag.id,
    )!;
    expect(trainingSag.status).toBe("training");
    expect(trainingSag.trainingTurnsRemaining).toBe(2);

    // Advance 1 turn of training
    advanceCampaignDay(database, "camp-1");
    const day1State = getCampaignHexState(database, "camp-1");
    const day1Sag = day1State.formations.find((f) => f.id === norwaySag.id)!;
    expect(day1Sag.experience).toBeGreaterThan(40);
    expect(day1Sag.status).toBe("training");
    expect(day1Sag.trainingTurnsRemaining).toBe(1);

    // Advance 2nd turn of training
    advanceCampaignDay(database, "camp-1");
    const day2State = getCampaignHexState(database, "camp-1");
    const day2Sag = day2State.formations.find((f) => f.id === norwaySag.id)!;
    expect(day2Sag.status).toBe("ready");
    expect(day2Sag.trainingTurnsRemaining).toBeUndefined();

    // 4. Test route dismissal
    database
      .prepare(`UPDATE campaign_formations SET metadata_json = ? WHERE id = ?`)
      .run(
        JSON.stringify({
          activeRoute: {
            targetHexId: "hex-nor-oslo",
            targetName: "Oslo",
            waypoints: ["hex-nor-bergen", "hex-nor-oslo"],
            currentWaypointIndex: 1,
            totalWaypoints: 2,
            turnsElapsed: 1,
            totalTurns: 1,
            status: "arrived",
          },
        }),
        norwaySag.id,
      );

    const dismissRes = dismissCompletedMovementOrder(database, {
      campaignId: "camp-1",
      formationId: norwaySag.id,
      playerCountryId: "norway",
    });
    expect(dismissRes.ok).toBe(true);

    const dismissedState = getCampaignHexState(database, "camp-1");
    const dismissedSag = dismissedState.formations.find(
      (f) => f.id === norwaySag.id,
    )!;
    expect(dismissedSag.activeRoute).toBeUndefined();
  });

  it("physical depots, 5-turn capture, and contested state dynamics work accurately", () => {
    // 1. Check initial depot and status values
    const initialState = getCampaignHexState(database, "camp-1");
    const osloHex = initialState.hexCells.find((c) => c.id === "hex-nor-oslo")!;
    expect(osloHex.status).toBe("controlled");
    expect(osloHex.captureTurnsCounter).toBe(0);
    expect(osloHex.depots).toBeDefined();
    expect(osloHex.depots?.fuelBarrels).toBe(100);

    // 2. Spawn an OPFOR formation in hex-nor-bergen (no BLUFOR defenders present)
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO campaign_formations (
          id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "opfor-invader-1",
        "camp-1",
        "Soviet Red Banner Strike Division",
        "mechanized_infantry_division",
        "opfor",
        "soviet-union",
        "hex-nor-bergen",
        100,
        1,
        1,
        "ready",
        JSON.stringify({ morale: 90, experience: 60 }),
        now,
        now,
      );

    // Remove any BLUFOR units from Bergen to simulate uncontested occupation
    database
      .prepare(
        `UPDATE campaign_formations SET hex_id = 'hex-nor-oslo' WHERE campaign_id = 'camp-1' AND side = 'blufor'`,
      )
      .run();

    // Advance 1 turn: captureTurnsCounter should be 1
    advanceCampaignDay(database, "camp-1");
    let state = getCampaignHexState(database, "camp-1");
    let bergen = state.hexCells.find((c) => c.id === "hex-nor-bergen")!;
    expect(bergen.captureTurnsCounter).toBe(1);
    expect(bergen.occupyingSide).toBe("opfor");
    expect(bergen.ownership.countryId).toBe("norway"); // Not yet transferred

    // Advance turns 2, 3, 4
    advanceCampaignDay(database, "camp-1");
    advanceCampaignDay(database, "camp-1");
    advanceCampaignDay(database, "camp-1");
    state = getCampaignHexState(database, "camp-1");
    bergen = state.hexCells.find((c) => c.id === "hex-nor-bergen")!;
    expect(bergen.captureTurnsCounter).toBe(4);

    // Advance 5th turn: Sector is captured and ownership transfers to soviet-union
    advanceCampaignDay(database, "camp-1");
    state = getCampaignHexState(database, "camp-1");
    bergen = state.hexCells.find((c) => c.id === "hex-nor-bergen")!;
    expect(bergen.ownership.countryId).toBe("soviet-union");
    expect(bergen.ownership.side).toBe("opfor");
    expect(bergen.captureTurnsCounter).toBe(0);

    // 3. Test Contested State: Spawn BLUFOR unit into Soviet-owned Bergen
    database
      .prepare(
        `INSERT INTO campaign_formations (
          id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "blufor-recapture-1",
        "camp-1",
        "Norwegian Home Guard",
        "mechanized_infantry_division",
        "blufor",
        "norway",
        "hex-nor-bergen",
        90,
        1,
        1,
        "ready",
        JSON.stringify({ morale: 80, experience: 50 }),
        now,
        now,
      );

    advanceCampaignDay(database, "camp-1");
    state = getCampaignHexState(database, "camp-1");
    bergen = state.hexCells.find((c) => c.id === "hex-nor-bergen")!;
    expect(bergen.status).toBe("contested");
    expect(bergen.yields.fundsRevenue).toBe(0); // Yields frozen while contested
  });

  it("national military market allows purchasing surplus vessels with turn delay delivery", () => {
    // Initial treasury for Norway is 1800
    const startEco = database
      .prepare(
        "SELECT funds FROM campaign_economy WHERE campaign_id = 'camp-1'",
      )
      .get() as { funds: number };
    expect(startEco.funds).toBe(1800);

    // Purchase Hauk-class missile boat ($600, 1 turn delivery)
    const purchase = purchaseMarketUnit(
      database,
      "camp-1",
      "norway",
      "surplus-hauk-fast-patrol",
      "hex-nor-oslo",
      "1st Rapid Coastal Strike",
    );
    expect(purchase.turnsRemaining).toBe(1);

    const pending = getPendingMarketOrders(database, "camp-1");
    expect(pending.length).toBe(1);
    expect(pending[0].unitName).toBe("1st Rapid Coastal Strike");
    expect(pending[0].costFunds).toBe(600);

    // Treasury deducted immediately ($1800 - $600 = $1200)
    const midEco = database
      .prepare(
        "SELECT funds FROM campaign_economy WHERE campaign_id = 'camp-1'",
      )
      .get() as { funds: number };
    expect(midEco.funds).toBe(1200);

    // Advance 1 turn: order delivers and unit spawns in Oslo
    advanceCampaignDay(database, "camp-1");
    const state = getCampaignHexState(database, "camp-1");
    const spawned = state.formations.find(
      (f) => f.name === "1st Rapid Coastal Strike",
    );
    expect(spawned).toBeDefined();
    expect(spawned?.hexId).toBe("hex-nor-oslo");
    expect(spawned?.countryId).toBe("norway");

    const pendingAfter = getPendingMarketOrders(database, "camp-1");
    expect(pendingAfter.length).toBe(0);
  });

  it("diplomatic treaties track expiration and stance changes over turns", () => {
    // Establish a 2-turn ceasefire between Norway and Soviet Union
    const treaty = establishDiplomaticTreaty(
      database,
      "camp-1",
      "ceasefire",
      "norway",
      "soviet-union",
      2,
    );
    expect(treaty.durationTurns).toBe(2);
    expect(treaty.turnsRemaining).toBe(2);

    const active = getActiveDiplomaticTreaties(database, "camp-1");
    expect(active.length).toBe(1);
    expect(active[0].treatyType).toBe("ceasefire");

    // Advance 1 turn
    advanceCampaignDay(database, "camp-1");
    const day1Treaties = getActiveDiplomaticTreaties(database, "camp-1");
    expect(day1Treaties.length).toBe(1);
    expect(day1Treaties[0].turnsRemaining).toBe(1);

    // Advance 2nd turn: Treaty expires
    advanceCampaignDay(database, "camp-1");
    const day2Treaties = getActiveDiplomaticTreaties(database, "camp-1");
    expect(day2Treaties.length).toBe(0);
  });

  it("regional investments boost hex revenue, production, and fuel multipliers", () => {
    // Initial Oslo hex is Tier 0
    const state0 = getCampaignHexState(database, "camp-1");
    const oslo0 = state0.hexCells.find((c) => c.id === "hex-nor-oslo")!;
    expect(oslo0.investmentTier).toBe(0);
    const baseRevenue = oslo0.yields.fundsRevenue;

    // Upgrade Oslo to Tier 1 ($500 cost)
    const upg1 = upgradeHexInvestment(database, "camp-1", "hex-nor-oslo");
    expect(upg1.newTier).toBe(1);
    expect(upg1.tierInfo.fundsMultiplier).toBe(1.15);

    const state1 = getCampaignHexState(database, "camp-1");
    const oslo1 = state1.hexCells.find((c) => c.id === "hex-nor-oslo")!;
    expect(oslo1.investmentTier).toBe(1);
    expect(oslo1.yields.fundsRevenue).toBe(Math.round(baseRevenue * 1.15));
    expect(oslo1.yields.productionPoints).toBeGreaterThan(
      oslo0.yields.productionPoints,
    );
  });
});
