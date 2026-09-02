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

describe("campaign setup flow", () => {
  let directory: string;
  let database: CampaignDatabase;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "theater-campaign-"));
    database = openDatabase({
      databasePath: join(directory, "campaign.sqlite"),
    });
    migrateDatabase(database);
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("creates a Norway campaign and returns the selected perspective through its session", async () => {
    const app = createApp(loadConfig({}), { database });
    const catalog = await request(app).get("/api/v1/setup/catalog").expect(200);
    expect(catalog.body.variants).toHaveLength(3);
    expect(
      catalog.body.countries.map((country: { id: string }) => country.id),
    ).toContain("norway");

    const created = await request(app)
      .post("/api/v1/campaigns")
      .send({
        scenarioFamilyId: "northern-flank",
        variantId: "nf-1983",
        countryId: "norway",
        seed: "test-seed",
        difficulty: "standard",
        techMode: "historical",
      })
      .expect(201);
    const cookie = created.headers["set-cookie"][0];
    expect(cookie).toContain("HttpOnly");

    const session = await request(app)
      .get("/api/v1/session")
      .set("Cookie", cookie)
      .expect(200);
    expect(session.body).toMatchObject({
      countryId: "norway",
      countryName: "Norway",
      variantId: "nf-1983",
    });
    expect(session.body).not.toHaveProperty("countries");

    await request(app)
      .delete("/api/v1/session")
      .set("Cookie", cookie)
      .expect(204);
    await request(app).get("/api/v1/session").set("Cookie", cookie).expect(409);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM campaigns").get(),
    ).toMatchObject({ count: 1 });
  });

  it("requires the server-owned session perspective and ignores client country overrides", async () => {
    const app = createApp(loadConfig({}), { database });
    const created = await request(app)
      .post("/api/v1/campaigns")
      .send({
        scenarioFamilyId: "northern-flank",
        variantId: "nf-1983",
        countryId: "norway",
        seed: "perspective-test",
        difficulty: "standard",
        techMode: "historical",
      })
      .expect(201);

    const cookie = created.headers["set-cookie"][0];
    const response = await request(app)
      .get("/api/v1/session?countryId=ussr")
      .set("Cookie", cookie)
      .set("x-country-id", "ussr")
      .send({ countryId: "ussr" })
      .expect(200);
    expect(response.body.countryId).toBe("norway");
  });

  it("persists world-entity lifecycle and applies daily economy effects", async () => {
    const app = createApp(loadConfig({}), { database });
    const created = await request(app)
      .post("/api/v1/campaigns")
      .send({
        scenarioFamilyId: "northern-flank",
        variantId: "nf-1983",
        countryId: "norway",
        seed: "ledger-test",
        difficulty: "standard",
        techMode: "historical",
      })
      .expect(201);

    const cookie = created.headers["set-cookie"][0];
    const state = await request(app)
      .get("/api/v1/campaigns/current/state")
      .set("Cookie", cookie)
      .expect(200);

    const tags = new Set(
      state.body.entities.map((entity: { tag: string }) => entity.tag),
    );
    expect(tags.has("airport")).toBe(true);
    expect(tags.has("port")).toBe(true);
    expect(tags.has("refinery")).toBe(true);
    expect(tags.has("oil_platform")).toBe(true);

    const refinery = state.body.entities.find(
      (entity: { tag: string }) => entity.tag === "refinery",
    );
    expect(refinery).toBeTruthy();
    expect(state.body.economy.projectedDailyDelta).toBeGreaterThan(0);

    await request(app)
      .patch(`/api/v1/campaigns/current/state/entities/${refinery.id}`)
      .set("Cookie", cookie)
      .send({ status: "destroyed" })
      .expect(204);

    const destroyedState = await request(app)
      .get("/api/v1/campaigns/current/state")
      .set("Cookie", cookie)
      .expect(200);

    expect(destroyedState.body.destroyedInfrastructureTags).toContain(
      "refinery",
    );

    const beforeFunds = destroyedState.body.economy.funds;
    const advance = await request(app)
      .post("/api/v1/campaigns/current/state/advance-day")
      .set("Cookie", cookie)
      .expect(200);

    const afterState = await request(app)
      .get("/api/v1/campaigns/current/state")
      .set("Cookie", cookie)
      .expect(200);

    expect(afterState.body.economy.funds).toBe(
      beforeFunds + advance.body.fundsDelta,
    );
    expect(advance.body.fundsDelta).toBeLessThan(
      state.body.economy.projectedDailyDelta,
    );
  });

  it("allows AA site redeployment only when a region has an open slot", async () => {
    const app = createApp(loadConfig({}), { database });
    const created = await request(app)
      .post("/api/v1/campaigns")
      .send({
        scenarioFamilyId: "northern-flank",
        variantId: "nf-1983",
        countryId: "norway",
        seed: "aa-redeploy-test",
        difficulty: "standard",
        techMode: "historical",
      })
      .expect(201);

    const cookie = created.headers["set-cookie"][0];
    const state = await request(app)
      .get("/api/v1/campaigns/current/state")
      .set("Cookie", cookie)
      .expect(200);

    const bergenAa = state.body.entities.find(
      (entity: {
        id: string;
        tag: string;
        metadata: { regionKey?: string; strategicSiteId?: string };
      }) =>
        entity.tag === "hawk_site" &&
        (entity.metadata?.regionKey === "bergen" ||
          entity.metadata?.strategicSiteId === "bergen-aa"),
    );
    expect(bergenAa).toBeTruthy();

    await request(app)
      .patch(`/api/v1/campaigns/current/state/entities/${bergenAa.id}`)
      .set("Cookie", cookie)
      .send({ status: "destroyed" })
      .expect(204);

    const purchase = await request(app)
      .post("/api/v1/campaigns/current/state/aa-sites/purchase")
      .set("Cookie", cookie)
      .send({ regionKey: "bergen" })
      .expect(201);

    expect(purchase.body.regionKey).toBe("bergen");
    expect(purchase.body.purchaseCost).toBe(180);

    const afterPurchase = await request(app)
      .get("/api/v1/campaigns/current/state")
      .set("Cookie", cookie)
      .expect(200);
    const activeBergenAa = afterPurchase.body.entities.filter(
      (entity: {
        tag: string;
        status: string;
        metadata: { regionKey?: string; strategicSiteId?: string };
      }) =>
        entity.tag === "hawk_site" &&
        entity.status !== "destroyed" &&
        entity.status !== "sunk" &&
        (entity.metadata?.regionKey === "bergen" ||
          entity.metadata?.strategicSiteId === "bergen-aa"),
    );
    expect(activeBergenAa).toHaveLength(1);

    await request(app)
      .post("/api/v1/campaigns/current/state/aa-sites/purchase")
      .set("Cookie", cookie)
      .send({ regionKey: "bergen" })
      .expect(409);
  });

  it("returns sector clusters with owner and side-specific actions", async () => {
    const app = createApp(loadConfig({}), { database });
    const created = await request(app)
      .post("/api/v1/campaigns")
      .send({
        scenarioFamilyId: "northern-flank",
        variantId: "nf-1983",
        countryId: "norway",
        seed: "sectors-test",
        difficulty: "standard",
        techMode: "historical",
      })
      .expect(201);
    const cookie = created.headers["set-cookie"][0];

    const sectors = await request(app)
      .get("/api/v1/campaigns/current/sectors")
      .set("Cookie", cookie)
      .expect(200);

    expect(sectors.body.playerSide).toBe("blufor");
    expect(
      sectors.body.sectors.map((sector: { id: string }) => sector.id),
    ).toContain("nf-denmark-skagerrak");

    const bergen = sectors.body.sectors.find(
      (sector: { id: string; actions: string[]; owner: { label: string } }) =>
        sector.id === "nf-bergen-scapa",
    );
    expect(bergen.owner.label).toBeTruthy();
    expect(bergen.actions).toContain("secure_sector");
  });

  it("purchases a sector-bound strategic asset and assigns it to the selected zone", async () => {
    const app = createApp(loadConfig({}), { database });
    const created = await request(app)
      .post("/api/v1/campaigns")
      .send({
        scenarioFamilyId: "northern-flank",
        variantId: "nf-1983",
        countryId: "norway",
        seed: "sector-purchase-test",
        difficulty: "standard",
        techMode: "historical",
      })
      .expect(201);
    const cookie = created.headers["set-cookie"][0];

    const purchase = await request(app)
      .post(
        "/api/v1/campaigns/current/sectors/nf-denmark-skagerrak/assets/purchase",
      )
      .set("Cookie", cookie)
      .send({
        assetKind: "strategic",
        category: "economic_booster",
        displayName: "Skagerrak Economic Booster",
        cost: 110,
        dailyFundsDelta: 5,
      })
      .expect(201);
    expect(purchase.body.entityId).toBeTruthy();

    const state = await request(app)
      .get("/api/v1/campaigns/current/state")
      .set("Cookie", cookie)
      .expect(200);
    const purchasedEntity = state.body.entities.find(
      (entity: {
        id: string;
        entityType: string;
        metadata: { sectorId?: string; source?: string };
      }) => entity.id === purchase.body.entityId,
    );
    expect(purchasedEntity.entityType).toBe("strategic_asset");
    expect(purchasedEntity.metadata.sectorId).toBe("nf-denmark-skagerrak");
    expect(purchasedEntity.metadata.source).toBe("sector-asset-purchase");
  });

  it("rejects campaign queries without a selected session", async () => {
    const app = createApp(loadConfig({}), { database });
    const response = await request(app).get("/api/v1/session").expect(409);
    expect(response.body.error.code).toBe("CAMPAIGN_NOT_SELECTED");
  });

  it.each([
    ["north-pacific", "japan"],
    ["persian-gulf", "iran"],
    ["indian-ocean", "india"],
  ])(
    "returns a populated command brief for %s",
    async (theaterId, countryId) => {
      const app = createApp(loadConfig({}), { database });
      const catalog = await request(app)
        .get(`/api/v1/setup/catalog?theaterId=${theaterId}`)
        .expect(200);
      const created = await request(app)
        .post("/api/v1/campaigns")
        .send({
          scenarioFamilyId: theaterId,
          variantId: catalog.body.variants[1].id,
          countryId,
          seed: `qa-${theaterId}`,
          difficulty: "standard",
          techMode: "historical",
        })
        .expect(201);
      const session = await request(app)
        .get("/api/v1/session")
        .set("Cookie", created.headers["set-cookie"][0])
        .expect(200);
      expect(session.body.countryName).toBeTruthy();
      expect(session.body.objectives.length).toBeGreaterThan(0);
    },
  );

  it("updates and customizes a formation flotilla composition via PATCH endpoint", async () => {
    const app = createApp(loadConfig({}), { database });
    const created = await request(app)
      .post("/api/v1/campaigns")
      .send({
        scenarioFamilyId: "northern-flank",
        variantId: "nf-1983",
        countryId: "norway",
        seed: "custom-formation-test",
        difficulty: "standard",
        techMode: "historical",
      })
      .expect(201);
    const cookie = created.headers["set-cookie"][0];

    const hexState = await request(app)
      .get("/api/v1/campaigns/current/hex-grid")
      .set("Cookie", cookie)
      .expect(200);

    const norwayFormation = hexState.body.formations.find(
      (f: { countryId: string; unitType: string }) =>
        f.countryId === "norway" && f.unitType === "surface_action_group",
    );
    expect(norwayFormation).toBeDefined();

    const patchResponse = await request(app)
      .patch(`/api/v1/campaigns/current/formations/${norwayFormation.id}`)
      .set("Cookie", cookie)
      .send({
        name: "KNM Oslo Escort Flotilla (Customized)",
        customComposition: {
          formationType: "surface_action_group",
          countryId: "norway",
          side: "blufor",
          callsignPrefix: "Task Group Viking",
          totalVessels: 4,
          totalSubmarines: 1,
          totalAircraft: 0,
          totalVehicles: 0,
          flagshipName: "KNM Oslo (F300)",
          summary:
            "Modernized Oslo-class frigate squadron with Kobben SSK support.",
          units: [
            {
              id: "custom-oslo",
              name: "KNM Oslo (F300)",
              unitClass: "Oslo-class Frigate",
              classIniRef: "knm_ff_oslo",
              category: "vessel",
              role: "Flotilla Flagship / ASW Escort",
              count: 2,
              isProxy: false,
            },
            {
              id: "custom-kobben",
              name: "KNM Kobben (S318)",
              unitClass: "Kobben-class Submarine (Type 207)",
              classIniRef: "knm_ssk_kobben",
              category: "submarine",
              role: "Fjord Patrol / Coastal Ambush",
              count: 1,
              isProxy: false,
            },
          ],
        },
      })
      .expect(200);

    expect(patchResponse.body.ok).toBe(true);
    expect(patchResponse.body.formation.name).toBe(
      "KNM Oslo Escort Flotilla (Customized)",
    );
    expect(patchResponse.body.formation.composition.units).toHaveLength(2);
    expect(patchResponse.body.formation.composition.totalVessels).toBe(2);
    expect(patchResponse.body.formation.composition.totalSubmarines).toBe(1);

    // Verify it persists upon querying hex-state again
    const hexStateAfter = await request(app)
      .get("/api/v1/campaigns/current/hex-grid")
      .set("Cookie", cookie)
      .expect(200);

    const updated = hexStateAfter.body.formations.find(
      (f: { id: string }) => f.id === norwayFormation.id,
    );
    expect(updated.name).toBe("KNM Oslo Escort Flotilla (Customized)");
    expect(updated.composition.flagshipName).toBe("KNM Oslo (F300)");

    // Verify Allied NATO formations (e.g. US carrier) CANNOT be modified by Norway
    const alliedCarrier = hexState.body.formations.find(
      (f: { countryId: string }) => f.countryId === "united-states",
    );
    if (alliedCarrier) {
      const rejectResponse = await request(app)
        .patch(`/api/v1/campaigns/current/formations/${alliedCarrier.id}`)
        .set("Cookie", cookie)
        .send({
          name: "Illegal US Roster Change",
        })
        .expect(404);

      expect(rejectResponse.body.error.message).toContain(
        "Allied NATO formation",
      );
    }
  });
});
