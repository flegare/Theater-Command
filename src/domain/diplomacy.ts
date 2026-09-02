import type { CampaignDatabase } from "../infrastructure/database.js";

function generateUUID(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `treaty-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export type TreatyType =
  "ceasefire" | "non_aggression" | "tribute" | "alliance" | "mutual_defense";

export type DiplomaticTreatyRecord = {
  id: string;
  campaignId: string;
  treatyType: TreatyType;
  partyACountryId: string;
  partyBCountryId: string;
  durationTurns: number;
  turnsRemaining: number;
  terms: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function establishDiplomaticTreaty(
  database: CampaignDatabase,
  campaignId: string,
  treatyType: TreatyType,
  partyACountryId: string,
  partyBCountryId: string,
  durationTurns: number,
  terms: Record<string, unknown> = {},
): DiplomaticTreatyRecord {
  const treatyId = generateUUID();
  const now = new Date().toISOString();
  const termsJson = JSON.stringify(terms);

  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO diplomatic_treaties (
          id, campaign_id, treaty_type, party_a_country_id, party_b_country_id, duration_turns, turns_remaining, terms_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        treatyId,
        campaignId,
        treatyType,
        partyACountryId,
        partyBCountryId,
        durationTurns,
        durationTurns,
        termsJson,
        now,
        now,
      );

    // Try updating country_relations if records exist in countries table
    const targetStance =
      treatyType === "alliance" || treatyType === "mutual_defense"
        ? "allied"
        : treatyType === "ceasefire" || treatyType === "non_aggression"
          ? "neutral"
          : undefined;

    if (targetStance) {
      try {
        database
          .prepare(
            `INSERT OR REPLACE INTO country_relations (campaign_id, country_id, related_country_id, stance)
             VALUES (?, ?, ?, ?)`,
          )
          .run(campaignId, partyACountryId, partyBCountryId, targetStance);

        database
          .prepare(
            `INSERT OR REPLACE INTO country_relations (campaign_id, country_id, related_country_id, stance)
             VALUES (?, ?, ?, ?)`,
          )
          .run(campaignId, partyBCountryId, partyACountryId, targetStance);
      } catch {
        // Ignored if country records are not in countries table
      }
    }
  })();

  return {
    id: treatyId,
    campaignId,
    treatyType,
    partyACountryId,
    partyBCountryId,
    durationTurns,
    turnsRemaining: durationTurns,
    terms,
    createdAt: now,
    updatedAt: now,
  };
}

export function getActiveDiplomaticTreaties(
  database: CampaignDatabase,
  campaignId: string,
): DiplomaticTreatyRecord[] {
  const rows = database
    .prepare(
      `SELECT id, campaign_id, treaty_type, party_a_country_id, party_b_country_id, duration_turns, turns_remaining, terms_json, created_at, updated_at
       FROM diplomatic_treaties
       WHERE campaign_id = ? AND turns_remaining > 0
       ORDER BY turns_remaining ASC`,
    )
    .all(campaignId) as Array<{
    id: string;
    campaign_id: string;
    treaty_type: TreatyType;
    party_a_country_id: string;
    party_b_country_id: string;
    duration_turns: number;
    turns_remaining: number;
    terms_json: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    treatyType: r.treaty_type,
    partyACountryId: r.party_a_country_id,
    partyBCountryId: r.party_b_country_id,
    durationTurns: r.duration_turns,
    turnsRemaining: r.turns_remaining,
    terms: JSON.parse(r.terms_json || "{}"),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
