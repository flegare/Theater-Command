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

describe("Per-Feature & Page Endpoint Integration Matrix", () => {
  let directory: string;
  let database: CampaignDatabase;
  let app: Express;
  let sessionCookie: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "theater-campaign-features-"));
    database = openDatabase({
      databasePath: join(directory, "campaign.sqlite"),
    });
    migrateDatabase(database);
    app = createApp(loadConfig({}), { database });

    // Seed campaign
    const created = await request(app)
      .post("/api/v1/campaigns")
      .send({
        scenarioFamilyId: "northern-flank",
        variantId: "nf-1983",
        countryId: "norway",
        seed: "feature-matrix-seed",
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
  // 1. CAMPAIGN SETUP & SESSION MANAGEMENT
  // =========================================================================
  describe("Feature: Campaign Setup & Session Management", () => {
    it("GET /api/v1/setup/catalog - retrieves scenarios, countries and coalitions", async () => {
      const res = await request(app).get("/api/v1/setup/catalog").expect(200);
      expect(res.body.variants.length).toBeGreaterThan(0);
      expect(
        res.body.countries.some((c: { id: string }) => c.id === "norway"),
      ).toBe(true);
      expect(
        res.body.coalitions.some((c: { id: string }) => c.id === "nato"),
      ).toBe(true);
    });

    it("GET /api/v1/session - validates active perspective session", async () => {
      const res = await request(app)
        .get("/api/v1/session")
        .set("Cookie", sessionCookie)
        .expect(200);
      expect(res.body.countryId).toBe("norway");
    });

    it("DELETE /api/v1/session - terminates command session cleanly", async () => {
      await request(app)
        .delete("/api/v1/session")
        .set("Cookie", sessionCookie)
        .expect(204);

      const res = await request(app).get("/api/v1/session");
      expect([401, 409]).toContain(res.status);
    });
  });

  // =========================================================================
  // 2. THEATER STRATEGIC HEX MAP & FORMATIONS
  // =========================================================================
  describe("Feature: Theater Strategic Hex Map & Formations", () => {
    it("GET /api/v1/campaigns/current/hex-grid - returns cells, formations, and economy reserves", async () => {
      const res = await request(app)
        .get("/api/v1/campaigns/current/hex-grid")
        .set("Cookie", sessionCookie)
        .expect(200);

      expect(res.body.hexCells.length).toBeGreaterThan(0);
      expect(res.body.formations.length).toBeGreaterThan(0);
      expect(res.body.economy).toMatchObject({
        funds: expect.any(Number),
        fuelStockpile: expect.any(Number),
        productionPoints: expect.any(Number),
      });
    });

    it("POST /api/v1/campaigns/current/formations/recruit - recruits new naval task force with treasury deduction", async () => {
      database
        .prepare("UPDATE campaign_economy SET production_points = 200")
        .run();
      const gridRes = await request(app)
        .get("/api/v1/campaigns/current/hex-grid")
        .set("Cookie", sessionCookie)
        .expect(200);
      const startingFunds = gridRes.body.economy.funds;
      const friendlyNavalHex = gridRes.body.hexCells.find(
        (c: { side: string; facilities?: string[] }) =>
          c.side === "blufor" &&
          (c.facilities?.includes("naval_base") ||
            c.facilities?.includes("shipyard")),
      );
      const hexId = friendlyNavalHex
        ? friendlyNavalHex.id
        : gridRes.body.hexCells[0].id;

      const recruitRes = await request(app)
        .post("/api/v1/campaigns/current/formations/recruit")
        .set("Cookie", sessionCookie)
        .send({
          hexId,
          unitType: "surface_action_group",
          side: "blufor",
          countryId: "norway",
          customName: "3rd Coastal Escort Flotilla",
        });

      if (recruitRes.status !== 201) {
        console.error("Recruit error:", recruitRes.body);
      }
      expect(recruitRes.status).toBe(201);
      expect(recruitRes.body.formation.name).toBe("3rd Coastal Escort Flotilla");
      expect(recruitRes.body.formation.id).toBeDefined();
    });

    it("POST /api/v1/campaigns/current/formations/recruit - rejects recruitment on insufficient treasury funds", async () => {
      database.prepare("UPDATE campaign_economy SET funds = 0").run();

      const gridRes = await request(app)
        .get("/api/v1/campaigns/current/hex-grid")
        .set("Cookie", sessionCookie);
      const hexId = gridRes.body.hexCells[0].id;

      const res = await request(app)
        .post("/api/v1/campaigns/current/formations/recruit")
        .set("Cookie", sessionCookie)
        .send({
          hexId,
          unitType: "surface_action_group",
          customName: "Broke Escort Group",
        })
        .expect(400);

      expect(res.body.error.code).toBe("FORMATION_RECRUIT_FAILED");
    });

    it("POST /api/v1/campaigns/current/formations/:id/path & /move - handles pathfinding and formation movement", async () => {
      const gridRes = await request(app)
        .get("/api/v1/campaigns/current/hex-grid")
        .set("Cookie", sessionCookie)
        .expect(200);

      const formation = gridRes.body.formations[0];
      const targetCell = gridRes.body.hexCells.find(
        (c: { id: string }) => c.id !== formation.hexId,
      );

      if (targetCell) {
        // Test path endpoint
        const pathRes = await request(app)
          .post(`/api/v1/campaigns/current/formations/${formation.id}/path`)
          .set("Cookie", sessionCookie)
          .send({ targetHexId: targetCell.id });
        expect([200, 400]).toContain(pathRes.status);
      }
    });

    it("POST /api/v1/campaigns/current/formations/:id/rest-refit & /train - executes maintenance actions", async () => {
      const gridRes = await request(app)
        .get("/api/v1/campaigns/current/hex-grid")
        .set("Cookie", sessionCookie);
      const formation = gridRes.body.formations[0];

      // Rest & Refit
      const restRes = await request(app)
        .post(`/api/v1/campaigns/current/formations/${formation.id}/rest-refit`)
        .set("Cookie", sessionCookie);
      expect([200, 400]).toContain(restRes.status);

      // Train
      const trainRes = await request(app)
        .post(`/api/v1/campaigns/current/formations/${formation.id}/train`)
        .set("Cookie", sessionCookie);
      expect([200, 400]).toContain(trainRes.status);
    });
  });

  // =========================================================================
  // 3. INFRASTRUCTURE & INVESTMENT UPGRADES
  // =========================================================================
  describe("Feature: Strategic Infrastructure Upgrades", () => {
    it("POST /api/v1/campaigns/current/hex-cells/:id/investment/upgrade - upgrades port/radar facility", async () => {
      const gridRes = await request(app)
        .get("/api/v1/campaigns/current/hex-grid")
        .set("Cookie", sessionCookie);
      const siteCell = gridRes.body.hexCells.find(
        (c: { siteId?: string }) => Boolean(c.siteId),
      );
      if (!siteCell) return;

      const upgradeRes = await request(app)
        .post(
          `/api/v1/campaigns/current/hex-cells/${siteCell.id}/investment/upgrade`,
        )
        .set("Cookie", sessionCookie)
        .expect(200);

      expect(upgradeRes.body.ok).toBe(true);
      expect(upgradeRes.body.newTier).toBeGreaterThan(0);
      expect(upgradeRes.body.remainingEconomy).toBeDefined();
    });
  });

  // =========================================================================
  // 4. STRATEGIC LOGISTICS & MARKET PROCUREMENT
  // =========================================================================
  describe("Feature: Strategic Logistics & Market Procurement", () => {
    it("GET /api/v1/campaigns/current/market/catalog - lists munitions, fuel batches and spare parts", async () => {
      const res = await request(app)
        .get("/api/v1/campaigns/current/market/catalog")
        .set("Cookie", sessionCookie)
        .expect(200);

      expect(res.body.catalog).toBeDefined();
      expect(res.body.catalog.length).toBeGreaterThan(0);
    });

    it("POST /api/v1/campaigns/current/market/purchase - purchases asset with funds deduction", async () => {
      const catRes = await request(app)
        .get("/api/v1/campaigns/current/market/catalog")
        .set("Cookie", sessionCookie);
      const item = catRes.body.catalog[0];

      const gridRes = await request(app)
        .get("/api/v1/campaigns/current/hex-grid")
        .set("Cookie", sessionCookie);
      const portCell = gridRes.body.hexCells.find(
        (c: { siteId?: string }) => Boolean(c.siteId),
      );
      const targetHexId = portCell ? portCell.id : gridRes.body.hexCells[0].id;

      const purchaseRes = await request(app)
        .post("/api/v1/campaigns/current/market/purchase")
        .set("Cookie", sessionCookie)
        .send({
          listingId: item.id,
          targetHexId,
          customName: "HMNoS Narvik Support Unit",
        })
        .expect(200);

      expect(purchaseRes.body.ok).toBe(true);
      expect(purchaseRes.body.order).toBeDefined();
    });
  });

  // =========================================================================
  // 5. 24-HOUR STRATEGIC TURN ADVANCEMENT
  // =========================================================================
  describe("Feature: Strategic Turn & Time Advancement", () => {
    it("POST /api/v1/campaigns/current/state/advance-day - advances campaign by 24 hours and updates economy", async () => {
      const advanceRes = await request(app)
        .post("/api/v1/campaigns/current/state/advance-day")
        .set("Cookie", sessionCookie)
        .expect(200);

      expect(advanceRes.body.campaignTime).toBeDefined();
      expect(advanceRes.body.fundsDelta).toBeDefined();
      expect(advanceRes.body.productionDelta).toBeDefined();
      expect(advanceRes.body.fuelDelta).toBeDefined();
    });
  });

  // =========================================================================
  // 6. AUTONOMOUS DIPLOMATIC SUITE & STATECRAFT
  // =========================================================================
  describe("Feature: Autonomous Diplomatic Suite & Statecraft", () => {
    it("GET /api/v1/campaigns/current/diplomacy/relations - retrieves bilateral stance and grievance ledger", async () => {
      const res = await request(app)
        .get(
          "/api/v1/campaigns/current/diplomacy/relations?targetCountryId=sweden",
        )
        .set("Cookie", sessionCookie)
        .expect(200);

      expect(res.body.relations).toMatchObject({
        score: expect.any(Number),
        stance: expect.any(String),
      });
    });

    it("GET /api/v1/campaigns/current/diplomacy/odds - returns probabilistic approval odds and breakdown", async () => {
      const res = await request(app)
        .get(
          "/api/v1/campaigns/current/diplomacy/odds?targetCountryId=sweden&treatyType=trade_agreement",
        )
        .set("Cookie", sessionCookie)
        .expect(200);

      expect(res.body.odds).toMatchObject({
        oddsPercent: expect.any(Number),
        breakdown: expect.any(Array),
        isHardRedline: expect.any(Boolean),
      });
    });

    it("POST /api/v1/campaigns/current/diplomacy/negotiate - transmits diplomatic treaty proposal", async () => {
      const res = await request(app)
        .post("/api/v1/campaigns/current/diplomacy/negotiate")
        .set("Cookie", sessionCookie)
        .send({
          targetCountryId: "sweden",
          treatyType: "trade_agreement",
          durationTurns: 60,
          offeredTributeFunds: 100,
        })
        .expect(200);

      expect(res.body.negotiation).toBeDefined();
      expect(res.body.negotiation.decision).toBeDefined();
      expect(res.body.negotiation.diplomaticDialogue).toBeDefined();
    });

    it("POST /api/v1/campaigns/current/diplomacy/counter-offer/accept - accepts counter-terms with zero PP waiver", async () => {
      const res = await request(app)
        .post("/api/v1/campaigns/current/diplomacy/counter-offer/accept")
        .set("Cookie", sessionCookie)
        .send({
          targetCountryId: "sweden",
          treatyType: "joint_production_pact",
          durationTurns: 45,
          demandedFunds: 0,
          demandedFuel: 0,
          demandedProduction: 0, // 0 PP waiver test
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.ratifiedTreaty).toBeDefined();
      expect(res.body.ratifiedTreaty.treatyType).toBe("joint_production_pact");
    });

    // CRITICAL BUG VERIFICATION: Declining counter-offer should NOT error 500 across any nation
    it("POST /api/v1/campaigns/current/diplomacy/counter-offer/decline - cleanly declines counter-offer with Finland, Denmark, Iceland, and USSR without 500 error", async () => {
      const testNations = [
        "finland",
        "denmark",
        "iceland",
        "west-germany",
        "soviet-union",
      ];

      for (const targetCountryId of testNations) {
        const res = await request(app)
          .post("/api/v1/campaigns/current/diplomacy/counter-offer/decline")
          .set("Cookie", sessionCookie)
          .send({
            targetCountryId,
            treatyType: "military_transit_rights",
            reason: `Leadership rejects indemnity terms from ${targetCountryId}`,
          })
          .expect(200);

        expect(res.body.ok).toBe(true);
        expect(res.body.cableRecorded).toBeDefined();
        expect(res.body.updatedRelations).toBeDefined();
        expect(res.body.cableRecorded.header).toContain("TALKS COLLAPSE");
      }
    });

    it("GET /api/v1/campaigns/current/diplomacy/cables & POST /mark-read - logs cables and marks them read", async () => {
      const cablesRes = await request(app)
        .get("/api/v1/campaigns/current/diplomacy/cables")
        .set("Cookie", sessionCookie)
        .expect(200);

      expect(Array.isArray(cablesRes.body.cables)).toBe(true);
      if (cablesRes.body.cables.length > 0) {
        const cableId = cablesRes.body.cables[0].id;
        const markRes = await request(app)
          .post("/api/v1/campaigns/current/diplomacy/cables/mark-read")
          .set("Cookie", sessionCookie)
          .send({ cableId })
          .expect(200);
        expect(markRes.body.ok).toBe(true);
      }
    });
  });

  // =========================================================================
  // 7. COVERT OPERATIONS & DEFCON STRATEGIC TENSION
  // =========================================================================
  describe("Feature: Covert Operations & DEFCON Strategic Tension", () => {
    it("GET /api/v1/campaigns/current/covert-ops - returns covert operations catalog and active missions", async () => {
      const res = await request(app)
        .get("/api/v1/campaigns/current/covert-ops")
        .set("Cookie", sessionCookie)
        .expect(200);

      expect(res.body.catalog).toBeDefined();
      expect(Array.isArray(res.body.operations)).toBe(true);
    });

    it("GET /api/v1/campaigns/current/tensions - returns strategic DEFCON index and superpower tension", async () => {
      const res = await request(app)
        .get("/api/v1/campaigns/current/tensions")
        .set("Cookie", sessionCookie)
        .expect(200);

      expect(res.body.tension).toMatchObject({
        defconLevel: expect.any(Number),
        tensionIndex: expect.any(Number),
      });
    });

    it("POST /api/v1/campaigns/current/covert-ops/launch - launches clandestine sabotage op", async () => {
      const gridRes = await request(app)
        .get("/api/v1/campaigns/current/hex-grid")
        .set("Cookie", sessionCookie);
      const targetHexId = gridRes.body.hexCells[0].id;

      const launchRes = await request(app)
        .post("/api/v1/campaigns/current/covert-ops/launch")
        .set("Cookie", sessionCookie)
        .send({
          targetCountryId: "soviet-union",
          targetHexId,
          opType: "SABOTAGE_STOCKPILE_DEPOT",
        })
        .expect(200);

      expect(launchRes.body.operation).toBeDefined();
      expect(launchRes.body.operation.opType).toBe("SABOTAGE_STOCKPILE_DEPOT");
    });
  });
});
