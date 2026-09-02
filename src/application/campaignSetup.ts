import { randomUUID } from "node:crypto";
import type { CampaignDatabase } from "../infrastructure/database.js";
import { seedCampaignLedger } from "./campaignLedger.js";
import { northernFlank } from "../seeds/northernFlank.js";
import { northernFlankTheaterLanes } from "../seeds/northernFlankGameplay.js";
import { globalTheaterLanes } from "../seeds/globalTheaterGameplay.js";
import {
  globalStrategicSites,
  globalTheaterBriefings,
  globalTheaters,
} from "../seeds/globalTheaters.js";

export type CampaignCreation = {
  scenarioFamilyId: string;
  variantId: string;
  countryId: string;
  seed: string;
  difficulty: "standard" | "challenging" | "hardcore";
  techMode: "historical" | "what-if";
};

export type CampaignSession = {
  id: string;
  campaignId: string;
  playerCountryId: string;
};

export function setupCatalog(theaterId = "northern-flank") {
  if (theaterId === northernFlank.id) return northernFlank;
  const theater = globalTheaters.find((entry) => entry.id === theaterId);
  if (!theater) throw new Error("Unknown theater.");
  const briefings = globalTheaterBriefings[theater.id];
  if (!briefings) throw new Error("Theater briefings are unavailable.");
  return {
    id: theater.id,
    name: theater.name,
    summary: theater.summary,
    variants: (["1975", "1983", "1989"] as const).map((year) => ({
      id: `${theater.id}-${year}`,
      label: briefings[year].label,
      startDate: briefings[year].startDate,
      summary: briefings[year].summary,
      situation: briefings[year].situation,
      commandGuidance: briefings[year].commandGuidance,
      capabilities: briefings[year].capabilities,
    })),
    countries: theater.actors
      .map((actor) => ({
        id: actor.id,
        name: actor.name,
        coalitionId: actor.posture["1983"],
        commandScope: actor.commandScope,
        objectives: [
          `Protect ${theater.name.toLowerCase()} access`,
          "Preserve national readiness and repair capacity",
          "Manage escalation while pursuing political aims",
        ],
        playable: actor.playableFrom.length > 0,
      }))
      .filter((actor) => actor.playable),
    coalitions: Array.from(
      new Set(theater.actors.map((actor) => actor.posture["1983"])),
    ).map((posture) => ({
      id: posture,
      name: posture
        .replace("-", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      side: posture,
    })),
  };
}

export function createCampaign(
  database: CampaignDatabase,
  input: CampaignCreation,
): CampaignSession {
  const catalog = setupCatalog(input.scenarioFamilyId);
  const variant = catalog.variants.find(
    (entry) => entry.id === input.variantId,
  );
  const country = catalog.countries.find(
    (entry) => entry.id === input.countryId,
  );
  if (!variant || !country)
    throw new Error(
      "The selected scenario variant or country is not available.",
    );

  const campaignId = randomUUID();
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const localNow = Date.now();
  const strategicSites =
    catalog.id === northernFlank.id
      ? northernFlank.strategicSites
      : globalStrategicSites.filter((site) => site.theaterId === catalog.id);
  database.transaction(() => {
    database
      .prepare(
        "INSERT INTO campaigns (id, scenario_family_id, scenario_variant_id, name, seed, difficulty, tech_mode, campaign_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        campaignId,
        catalog.id,
        variant.id,
        `${catalog.name} / ${country.name} / ${variant.label}`,
        input.seed,
        input.difficulty,
        input.techMode,
        variant.startDate,
        now,
      );
    const coalitionInsert = database.prepare(
      "INSERT INTO coalitions (campaign_id, id, name, side) VALUES (?, ?, ?, ?)",
    );
    for (const coalition of catalog.coalitions)
      coalitionInsert.run(
        campaignId,
        coalition.id,
        coalition.name,
        coalition.side,
      );
    const countryInsert = database.prepare(
      "INSERT INTO countries (campaign_id, id, name, coalition_id, objectives_json) VALUES (?, ?, ?, ?, ?)",
    );
    for (const entry of catalog.countries)
      countryInsert.run(
        campaignId,
        entry.id,
        entry.name,
        entry.coalitionId,
        JSON.stringify(entry.objectives),
      );
    database
      .prepare(
        "INSERT INTO campaign_players (campaign_id, country_id, created_at) VALUES (?, ?, ?)",
      )
      .run(campaignId, country.id, now);
    database
      .prepare(
        "INSERT INTO events (id, campaign_id, campaign_time, kind, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        randomUUID(),
        campaignId,
        variant.startDate,
        "campaign_created",
        "Campaign command assumed.",
        now,
      );
    database
      .prepare(
        "INSERT INTO local_sessions (id, campaign_id, player_country_id, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(sessionId, campaignId, country.id, localNow, localNow);
    seedCampaignLedger(database, {
      campaignId,
      scenarioFamilyId: catalog.id,
      playerCountryId: country.id,
      campaignTime: variant.startDate,
      strategicSites,
    });
  })();
  return { id: sessionId, campaignId, playerCountryId: country.id };
}

export function getSessionCampaign(
  database: CampaignDatabase,
  sessionId: string,
) {
  const session = database
    .prepare(
      "SELECT campaign_id, player_country_id FROM local_sessions WHERE id = ?",
    )
    .get(sessionId) as
    { campaign_id: string; player_country_id: string } | undefined;
  if (!session) return undefined;
  database
    .prepare("UPDATE local_sessions SET last_used_at = ? WHERE id = ?")
    .run(Date.now(), sessionId);
  const campaign = database
    .prepare(
      "SELECT id, name, scenario_family_id, scenario_variant_id, campaign_time, difficulty, tech_mode, status FROM campaigns WHERE id = ?",
    )
    .get(session.campaign_id) as Record<string, string>;
  const country = database
    .prepare(
      "SELECT name, objectives_json FROM countries WHERE campaign_id = ? AND id = ?",
    )
    .get(session.campaign_id, session.player_country_id) as {
    name: string;
    objectives_json: string;
  };
  const catalog = setupCatalog(campaign.scenario_family_id);
  const variant = catalog.variants.find(
    (entry) => entry.id === campaign.scenario_variant_id,
  );
  const catalogCountry = catalog.countries.find(
    (entry) => entry.id === session.player_country_id,
  );
  const strategicSites =
    campaign.scenario_family_id === northernFlank.id
      ? northernFlank.strategicSites
      : globalStrategicSites.filter(
          (site) => site.theaterId === campaign.scenario_family_id,
        );
  const theaterLanes =
    campaign.scenario_family_id === northernFlank.id
      ? northernFlankTheaterLanes
      : (globalTheaterLanes[campaign.scenario_family_id ?? ""] ?? []);
  return {
    campaignId: campaign.id,
    name: campaign.name,
    variantId: campaign.scenario_variant_id,
    scenarioFamilyId: campaign.scenario_family_id,
    campaignTime: campaign.campaign_time,
    variantStartDate: variant?.startDate ?? campaign.campaign_time,
    difficulty: campaign.difficulty,
    techMode: campaign.tech_mode,
    status: campaign.status,
    countryId: session.player_country_id,
    countryName: country.name,
    theaterName: catalog.name,
    theaterSummary: catalog.summary,
    situation: variant?.situation ?? variant?.summary ?? catalog.summary,
    commandGuidance: variant?.commandGuidance ?? "",
    commandScope: catalogCountry?.commandScope ?? "",
    objectives: JSON.parse(country.objectives_json) as string[],
    strategicSites,
    theaterLanes,
  };
}
