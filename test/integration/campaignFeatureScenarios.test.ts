import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  openDatabase,
  type CampaignDatabase,
} from "../../src/infrastructure/database.js";
import { migrateDatabase } from "../../src/infrastructure/migrations.js";
import { createApp } from "../../src/server/app.js";
import { loadConfig } from "../../src/infrastructure/config.js";
import type { Express } from "express";

describe("E2E Campaign Feature Scenarios", () => {
  let directory: string;
  let database: CampaignDatabase;
  let app: Express;
  let sessionCookie: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "theater-e2e-scenarios-"));
    database = openDatabase({
      databasePath: join(directory, "campaign.sqlite"),
    });
    migrateDatabase(database);
    app = createApp(loadConfig({}), { database });

    // Initialize fresh 1983 Cold War Norway campaign
    const created = await request(app)
      .post("/api/v1/campaigns")
      .send({
        scenarioFamilyId: "northern-flank",
        variantId: "nf-1983",
        countryId: "norway",
        seed: "e2e-scenarios-seed",
        difficulty: "standard",
        techMode: "historical",
      })
      .expect(201);
    sessionCookie = created.headers["set-cookie"][0];
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  // =========================================================================
  // SCENARIO 1: DIPLOMATIC CRISIS, COUNTER-OFFER DECLINE & AMBASSADORIAL LOGGING
  // =========================================================================
  it("Scenario 1: Diplomatic Crisis - Player transmits sensitive Basing Rights to Finland, receives counter-terms, and cleanly declines without 500 error", async () => {
    // 1. Inspect initial bilateral relations with Finland
    const relInitial = await request(app)
      .get("/api/v1/campaigns/current/diplomacy/relations?targetCountryId=finland")
      .set("Cookie", sessionCookie)
      .expect(200);
    const startScore = relInitial.body.relations.score;

    // 2. Transmit proposal to Finland for basing rights (sensitive for neutral Paasikivi-Kekkonen line)
    const negotiateRes = await request(app)
      .post("/api/v1/campaigns/current/diplomacy/negotiate")
      .set("Cookie", sessionCookie)
      .send({
        targetCountryId: "finland",
        treatyType: "basing_rights",
        durationTurns: 30,
        offeredTributeFunds: 50,
      })
      .expect(200);

    expect(negotiateRes.body.ok).toBe(true);
    expect(negotiateRes.body.negotiation).toBeDefined();

    // 3. Player rejects/declines the Finnish counter-indemnity demands
    const relBeforeDecline = await request(app)
      .get("/api/v1/campaigns/current/diplomacy/relations?targetCountryId=finland")
      .set("Cookie", sessionCookie)
      .expect(200);
    const preDeclineScore = relBeforeDecline.body.relations.score;

    const declineRes = await request(app)
      .post("/api/v1/campaigns/current/diplomacy/counter-offer/decline")
      .set("Cookie", sessionCookie)
      .send({
        targetCountryId: "finland",
        treatyType: "basing_rights",
        reason:
          "Norwegian Defense Command will not pay sovereign indemnity for restricted air corridors.",
      })
      .expect(200);

    // Verify successful decline without 500 foreign key error
    expect(declineRes.body.ok).toBe(true);
    expect(declineRes.body.cableRecorded).toBeDefined();
    expect(declineRes.body.cableRecorded.header).toContain("TALKS COLLAPSE");
    expect(declineRes.body.updatedRelations.score).toBe(preDeclineScore - 5);

    // 4. Verify ambassadorial cable is recorded in diplomatic feed
    const cablesRes = await request(app)
      .get("/api/v1/campaigns/current/diplomacy/cables")
      .set("Cookie", sessionCookie)
      .expect(200);

    const collapseCable = cablesRes.body.cables.find(
      (c: { header: string }) => c.header.includes("TALKS COLLAPSE"),
    );
    expect(collapseCable).toBeDefined();

    // 5. Mark the communique as read
    const markRes = await request(app)
      .post("/api/v1/campaigns/current/diplomacy/cables/mark-read")
      .set("Cookie", sessionCookie)
      .send({ cableId: collapseCable.id })
      .expect(200);
    expect(markRes.body.ok).toBe(true);
  });

  // =========================================================================
  // SCENARIO 2: SCANDINAVIAN JOINT PRODUCTION, ZERO-PP WAIVER & RATIFICATION
  // =========================================================================
  it("Scenario 2: Neutral Arms Pact - Player negotiates with Sweden, waives PP to 0, ratifies treaty, and advances day", async () => {
    // 1. Check initial treaties (Sweden is not allied initially)
    const initialTreaties = await request(app)
      .get("/api/v1/campaigns/current/diplomacy/treaties")
      .set("Cookie", sessionCookie)
      .expect(200);
    expect(
      initialTreaties.body.treaties.some(
        (t: { partyBCountryId: string }) => t.partyBCountryId === "sweden",
      ),
    ).toBe(false);

    // 2. Accept and ratify a Joint Production Pact with Sweden, testing the 0 PP waiver feature
    const acceptRes = await request(app)
      .post("/api/v1/campaigns/current/diplomacy/counter-offer/accept")
      .set("Cookie", sessionCookie)
      .send({
        targetCountryId: "sweden",
        treatyType: "joint_production_pact",
        durationTurns: 60,
        demandedFunds: 50,
        demandedFuel: 20,
        demandedProduction: 0, // 0 Production Points waiver
        conditionSummary: "Waived industrial production quotas to 0 PP",
      })
      .expect(200);

    expect(acceptRes.body.ok).toBe(true);
    expect(acceptRes.body.ratifiedTreaty).toMatchObject({
      treatyType: "joint_production_pact",
      durationTurns: 60,
      turnsRemaining: 60,
    });

    // 3. Verify treaty is now active in campaign treaties list
    const activeTreaties = await request(app)
      .get("/api/v1/campaigns/current/diplomacy/treaties")
      .set("Cookie", sessionCookie)
      .expect(200);
    expect(activeTreaties.body.treaties.length).toBeGreaterThanOrEqual(1);
    const activePact = activeTreaties.body.treaties.find(
      (t: { treatyType: string }) => t.treatyType === "joint_production_pact",
    );
    expect(activePact).toBeDefined();

    // 4. Advance campaign by 24 hours
    const advanceRes = await request(app)
      .post("/api/v1/campaigns/current/state/advance-day")
      .set("Cookie", sessionCookie)
      .expect(200);
    expect(advanceRes.body.campaignTime).toBeDefined();

    // 5. Verify remaining treaty duration decremented by 1 day
    const updatedTreaties = await request(app)
      .get("/api/v1/campaigns/current/diplomacy/treaties")
      .set("Cookie", sessionCookie)
      .expect(200);
    const updatedPact = updatedTreaties.body.treaties.find(
      (t: { treatyType: string }) => t.treatyType === "joint_production_pact",
    );
    expect(updatedPact.turnsRemaining).toBe(59);
  });

  // =========================================================================
  // SCENARIO 3: NAVAL EXPANSION, INFRASTRUCTURE UPGRADE & TACTICAL FLOTILLA OPERATIONS
  // =========================================================================
  it("Scenario 3: Fleet Operations - Player upgrades base infrastructure, recruits surface flotilla, and pathfinds movement", async () => {
    // 1. Give economy sufficient production for recruitment
    database
      .prepare(
        "UPDATE campaign_economy SET production_points = 250, funds = 5000",
      )
      .run();

    const gridRes = await request(app)
      .get("/api/v1/campaigns/current/hex-grid")
      .set("Cookie", sessionCookie)
      .expect(200);

    const friendlyHex =
      gridRes.body.hexCells.find(
        (c: { side: string; facilities?: string[] }) =>
          c.side === "blufor" &&
          (c.facilities?.includes("naval_base") ||
            c.facilities?.includes("shipyard")),
      ) || gridRes.body.hexCells[0];

    // 2. Upgrade infrastructure at friendly hex
    const upgradeRes = await request(app)
      .post(
        `/api/v1/campaigns/current/hex-cells/${friendlyHex.id}/investment/upgrade`,
      )
      .set("Cookie", sessionCookie)
      .expect(200);
    expect(upgradeRes.body.ok).toBe(true);
    expect(upgradeRes.body.newTier).toBeGreaterThan(0);

    // 3. Recruit a new Surface Action Group stationed at friendly hex
    const recruitRes = await request(app)
      .post("/api/v1/campaigns/current/formations/recruit")
      .set("Cookie", sessionCookie)
      .send({
        hexId: friendlyHex.id,
        unitType: "surface_action_group",
        side: "blufor",
        countryId: "norway",
        customName: "1st Royal Norwegian Frigate Squadron",
      })
      .expect(201);

    const newFormation = recruitRes.body.formation;
    expect(newFormation.name).toBe("1st Royal Norwegian Frigate Squadron");

    // 4. Test pathfinding towards an adjacent maritime sector
    const adjacentWater = gridRes.body.hexCells.find(
      (c: { id: string; domain: string }) =>
        c.id !== friendlyHex.id && c.domain === "sea",
    );
    if (adjacentWater) {
      const pathRes = await request(app)
        .post(`/api/v1/campaigns/current/formations/${newFormation.id}/path`)
        .set("Cookie", sessionCookie)
        .send({ targetHexId: adjacentWater.id });
      expect([200, 400]).toContain(pathRes.status);
    }
  });

  // =========================================================================
  // SCENARIO 4: COVERT OPS, TENSION SPIKE & DEFCON ESCALATION
  // =========================================================================
  it("Scenario 4: Superpower Brinkmanship - Player launches sabotage op, tension escalates, and DEFCON is monitored", async () => {
    // 1. Inspect initial DEFCON posture
    const initialTension = await request(app)
      .get("/api/v1/campaigns/current/tensions")
      .set("Cookie", sessionCookie)
      .expect(200);
    expect(initialTension.body.tension.defconLevel).toBe(5);

    // 2. Target a Soviet naval port for clandestine sabotage
    const gridRes = await request(app)
      .get("/api/v1/campaigns/current/hex-grid")
      .set("Cookie", sessionCookie);
    const targetHex = gridRes.body.hexCells[0];

    const opRes = await request(app)
      .post("/api/v1/campaigns/current/covert-ops/launch")
      .set("Cookie", sessionCookie)
      .send({
        targetCountryId: "soviet-union",
        targetHexId: targetHex.id,
        opType: "SABOTAGE_STOCKPILE_DEPOT",
      })
      .expect(200);

    expect(opRes.body.ok).toBe(true);
    expect(opRes.body.operation).toBeDefined();

    // 3. Inspect updated strategic tension
    const postOpTension = await request(app)
      .get("/api/v1/campaigns/current/tensions")
      .set("Cookie", sessionCookie)
      .expect(200);

    expect(postOpTension.body.tension.tensionIndex).toBeGreaterThan(
      initialTension.body.tension.tensionIndex,
    );
  });
});
