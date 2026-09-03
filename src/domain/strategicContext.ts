import type { CampaignDatabase } from "../infrastructure/database.js";
import {
  getCampaignTension,
  type CampaignTensionState,
} from "./covertOperations.js";

export type ForcePowerSummary = {
  vesselCount: number;
  submarineCount: number;
  aircraftCount: number;
  totalFormations: number;
  totalStrength: number;
};

export type StrategicTheaterContext = {
  campaignId: string;
  evaluatingCountryId: string;
  tension: CampaignTensionState;
  forceIndex: {
    blufor: ForcePowerSummary;
    opfor: ForcePowerSummary;
    neutral: ForcePowerSummary;
    powerRatioBluforToOpfor: number;
  };
  geopolitics: {
    relations: Record<string, string>; // countryId -> stance
    activeTreaties: Array<{
      treatyType: string;
      partnerCountryId: string;
      turnsRemaining: number;
    }>;
  };
  territory: {
    sovereignHexCount: number;
    contestedHexCount: number;
    totalNationalDepotFuel: number;
    totalNationalDepotMissiles: number;
  };
  economy: {
    funds: number;
    productionPoints: number;
    fuelStockpile: number;
  };
  recentIncidents: string[];
};

export function compileStrategicTheaterContext(
  database: CampaignDatabase,
  campaignId: string,
  evaluatingCountryId: string,
): StrategicTheaterContext {
  const tension = getCampaignTension(database, campaignId);

  // 1. Calculate Force Index
  const formations = database
    .prepare(
      `SELECT side, unit_type, strength FROM campaign_formations
       WHERE campaign_id = ? AND status != 'depleted'`,
    )
    .all(campaignId) as Array<{
    side: "blufor" | "opfor" | "neutral";
    unit_type: string;
    strength: number;
  }>;

  const forceIndex = {
    blufor: {
      vesselCount: 0,
      submarineCount: 0,
      aircraftCount: 0,
      totalFormations: 0,
      totalStrength: 0,
    },
    opfor: {
      vesselCount: 0,
      submarineCount: 0,
      aircraftCount: 0,
      totalFormations: 0,
      totalStrength: 0,
    },
    neutral: {
      vesselCount: 0,
      submarineCount: 0,
      aircraftCount: 0,
      totalFormations: 0,
      totalStrength: 0,
    },
    powerRatioBluforToOpfor: 1.0,
  };

  for (const form of formations) {
    const target = forceIndex[form.side] || forceIndex.neutral;
    target.totalFormations += 1;
    target.totalStrength += form.strength;
    if (form.unit_type === "submarine_squadron") {
      target.submarineCount += 1;
    } else if (
      form.unit_type === "tactical_fighter_wing" ||
      form.unit_type === "maritime_strike_squadron"
    ) {
      target.aircraftCount += 1;
    } else {
      target.vesselCount += 1;
    }
  }

  forceIndex.powerRatioBluforToOpfor =
    forceIndex.opfor.totalStrength > 0
      ? Number(
          (
            forceIndex.blufor.totalStrength / forceIndex.opfor.totalStrength
          ).toFixed(2),
        )
      : 2.0;

  // 2. Geopolitics & Relations
  const relationsRows = database
    .prepare(
      `SELECT related_country_id, stance FROM country_relations
       WHERE campaign_id = ? AND country_id = ?`,
    )
    .all(campaignId, evaluatingCountryId) as Array<{
    related_country_id: string;
    stance: string;
  }>;

  const relations: Record<string, string> = {};
  for (const r of relationsRows) {
    relations[r.related_country_id] = r.stance;
  }

  const treatiesRows = database
    .prepare(
      `SELECT treaty_type, party_a_country_id, party_b_country_id, turns_remaining
       FROM diplomatic_treaties
       WHERE campaign_id = ? AND (party_a_country_id = ? OR party_b_country_id = ?) AND turns_remaining > 0`,
    )
    .all(campaignId, evaluatingCountryId, evaluatingCountryId) as Array<{
    treaty_type: string;
    party_a_country_id: string;
    party_b_country_id: string;
    turns_remaining: number;
  }>;

  const activeTreaties = treatiesRows.map((t) => ({
    treatyType: t.treaty_type,
    partnerCountryId:
      t.party_a_country_id === evaluatingCountryId
        ? t.party_b_country_id
        : t.party_a_country_id,
    turnsRemaining: t.turns_remaining,
  }));

  // 3. Territorial & Stockpile State
  const hexRows = database
    .prepare(
      `SELECT hex_id, side, country_id, contested, depot_fuel, depot_missiles
       FROM campaign_hex_cells
       WHERE campaign_id = ?`,
    )
    .all(campaignId) as Array<{
    hex_id: string;
    side: string;
    country_id: string;
    contested: number;
    depot_fuel: number;
    depot_missiles: number;
  }>;

  let sovereignHexCount = 0;
  let contestedHexCount = 0;
  let totalNationalDepotFuel = 0;
  let totalNationalDepotMissiles = 0;

  for (const h of hexRows) {
    if (h.country_id === evaluatingCountryId) {
      sovereignHexCount += 1;
      totalNationalDepotFuel += h.depot_fuel || 0;
      totalNationalDepotMissiles += h.depot_missiles || 0;
    }
    if (h.contested) {
      contestedHexCount += 1;
    }
  }

  // 4. Economy
  const ecoRow = database
    .prepare(
      "SELECT funds, production_points, fuel_stockpile FROM campaign_economy WHERE campaign_id = ?",
    )
    .get(campaignId) as
    | { funds: number; production_points: number; fuel_stockpile: number }
    | undefined;

  const economy = {
    funds: ecoRow?.funds ?? 0,
    productionPoints: ecoRow?.production_points ?? 50,
    fuelStockpile: ecoRow?.fuel_stockpile ?? 200,
  };

  // 5. Recent Incidents
  const eventRows = database
    .prepare(
      `SELECT summary FROM events
       WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 5`,
    )
    .all(campaignId) as Array<{ summary: string }>;

  const recentIncidents = eventRows.map((e) => e.summary);

  return {
    campaignId,
    evaluatingCountryId,
    tension,
    forceIndex,
    geopolitics: {
      relations,
      activeTreaties,
    },
    territory: {
      sovereignHexCount,
      contestedHexCount,
      totalNationalDepotFuel,
      totalNationalDepotMissiles,
    },
    economy,
    recentIncidents,
  };
}
