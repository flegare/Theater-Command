import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app.js";
import { loadConfig } from "../../src/infrastructure/config.js";
import { migrateDatabase } from "../../src/infrastructure/migrations.js";
import {
  openDatabase,
  type CampaignDatabase,
} from "../../src/infrastructure/database.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Northern Flank mission hooks", () => {
  it("creates identification-sensitive missions with normal ROE", async () => {
    const response = await request(createApp(loadConfig({})))
      .get(
        "/api/v1/campaigns/northern-flank/missions?tension=0.2&routeRisk=0.2",
      )
      .expect(200);
    expect(response.body.contacts).toHaveLength(3);
    expect(response.body.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "shipping",
          commodity: "fuel",
          countryIds: ["norway", "united-kingdom"],
        }),
        expect.objectContaining({ kind: "air", commodity: "passengers" }),
      ]),
    );
    expect(response.body.laneTraffic[0].traffic).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "merchant" }),
        expect.objectContaining({ kind: "fishing" }),
        expect.objectContaining({ kind: "cruise" }),
      ]),
    );
    expect(
      response.body.missions.some(
        (mission: { type: string }) => mission.type === "identify_contact",
      ),
    ).toBe(true);
    expect(
      response.body.missions.find(
        (mission: { id: string }) => mission.id === "identify-nf-fishing-01",
      ).engagementAuthorized,
    ).toBe(false);
  });

  it("derives current mission risk from the selected campaign session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "theater-campaign-"));
    const database: CampaignDatabase = openDatabase({
      databasePath: join(directory, "state.sqlite"),
    });
    migrateDatabase(database);
    try {
      const app = createApp(loadConfig({}), { database });
      const created = await request(app)
        .post("/api/v1/campaigns")
        .send({
          scenarioFamilyId: "northern-flank",
          variantId: "nf-1983",
          countryId: "norway",
          seed: "campaign-owned-state",
          difficulty: "standard",
          techMode: "historical",
        })
        .expect(201);
      const response = await request(app)
        .get("/api/v1/campaigns/current/missions")
        .set("Cookie", created.headers["set-cookie"][0])
        .expect(200);
      expect(response.body.tension).toBe(0.25);
      expect(response.body.routeRisk).toBe(0.25);
      expect(response.body.contacts[0]).not.toHaveProperty("truthIdentity");
      await request(app)
        .post("/api/v1/campaigns/current/lane-actions")
        .set("Cookie", created.headers["set-cookie"][0])
        .send({ action: "escort", routeId: "bergen-scapa-fuel" })
        .expect(200)
        .expect((actionResponse) => {
          expect(actionResponse.body.disruption).toBe(0.05);
        });
      const secured = await request(app)
        .get("/api/v1/campaigns/current/missions")
        .set("Cookie", created.headers["set-cookie"][0])
        .expect(200);
      expect(secured.body.trade.delivered).toBe(95);
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("creates escort and investigation hooks when trade risk rises", async () => {
    const response = await request(createApp(loadConfig({})))
      .get(
        "/api/v1/campaigns/northern-flank/missions?tension=0.7&routeRisk=0.7",
      )
      .expect(200);
    expect(
      response.body.missions.map((mission: { type: string }) => mission.type),
    ).toContain("escort_trade");
    expect(
      response.body.missions.map((mission: { type: string }) => mission.type),
    ).toContain("investigate_disruption");
    expect(response.body.trade.delivered).toBe(30);
    expect(response.body.lanes[0].disruption).toBe(0.7);
  });

  it("does not expose contact truth or identity fields", async () => {
    const response = await request(createApp(loadConfig({})))
      .get("/api/v1/campaigns/northern-flank/missions")
      .expect(200);
    for (const contact of response.body.contacts) {
      expect(contact).not.toHaveProperty("truthCategory");
      expect(contact).not.toHaveProperty("truthIdentity");
      expect(contact).not.toHaveProperty("truthDisposition");
    }
  });
});
