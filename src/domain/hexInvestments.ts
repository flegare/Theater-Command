import type { CampaignDatabase } from "../infrastructure/database.js";
import { getHexCellDefinition } from "./hexGrid.js";

export type RegionalInvestmentTier = {
  tier: number;
  name: string;
  costFunds: number;
  fundsMultiplier: number;
  bonusProduction: number;
  bonusFuel: number;
  description: string;
};

export const INVESTMENT_TIERS: Record<number, RegionalInvestmentTier> = {
  0: {
    tier: 0,
    name: "Standard Territorial Administration",
    costFunds: 0,
    fundsMultiplier: 1.0,
    bonusProduction: 0,
    bonusFuel: 0,
    description:
      "Baseline territorial administration with no specialized capital investment.",
  },
  1: {
    tier: 1,
    name: "Industrial Modernization",
    costFunds: 500,
    fundsMultiplier: 1.15,
    bonusProduction: 10,
    bonusFuel: 15,
    description:
      "Expands manufacturing plants and modernized cargo berths (+15% revenue, +10 prod, +15 fuel).",
  },
  2: {
    tier: 2,
    name: "Heavy Fortification & Logistics Hub",
    costFunds: 1200,
    fundsMultiplier: 1.35,
    bonusProduction: 25,
    bonusFuel: 40,
    description:
      "Hardened supply bunkers, expanded drydocks, and local refinery capacity (+35% revenue, +25 prod, +40 fuel).",
  },
  3: {
    tier: 3,
    name: "Strategic Command & Advanced Industrial Complex",
    costFunds: 2500,
    fundsMultiplier: 1.6,
    bonusProduction: 50,
    bonusFuel: 80,
    description:
      "Premier military-industrial complex with integrated SAM batteries and naval yards (+60% revenue, +50 prod, +80 fuel).",
  },
};

export function upgradeHexInvestment(
  database: CampaignDatabase,
  campaignId: string,
  hexId: string,
): {
  newTier: number;
  tierInfo: RegionalInvestmentTier;
  remainingFunds: number;
} {
  const hexRow = database
    .prepare(
      "SELECT investment_tier, side, country_id FROM campaign_hex_cells WHERE campaign_id = ? AND hex_id = ?",
    )
    .get(campaignId, hexId) as
    { investment_tier: number; side?: string; country_id?: string } | undefined;

  const currentTier = hexRow?.investment_tier ?? 0;
  if (currentTier >= 3) {
    throw new Error(
      `Hex ${hexId} is already at maximum investment tier (Tier 3).`,
    );
  }

  const nextTier = currentTier + 1;
  const targetInfo = INVESTMENT_TIERS[nextTier];
  if (!targetInfo) {
    throw new Error(`Invalid target investment tier: ${nextTier}`);
  }

  const economy = database
    .prepare("SELECT funds FROM campaign_economy WHERE campaign_id = ?")
    .get(campaignId) as { funds: number } | undefined;

  if (!economy || economy.funds < targetInfo.costFunds) {
    throw new Error(
      `Insufficient funds for ${targetInfo.name}. Required: $${targetInfo.costFunds}, Available: $${economy?.funds ?? 0}`,
    );
  }

  const baseDef = getHexCellDefinition(hexId);
  const side = hexRow?.side ?? baseDef?.ownership.side ?? "blufor";
  const countryId =
    hexRow?.country_id ?? baseDef?.ownership.countryId ?? "norway";

  const now = new Date().toISOString();
  const remainingFunds = economy.funds - targetInfo.costFunds;

  database.transaction(() => {
    database
      .prepare(
        "UPDATE campaign_economy SET funds = funds - ?, updated_at = ? WHERE campaign_id = ?",
      )
      .run(targetInfo.costFunds, now, campaignId);

    database
      .prepare(
        `INSERT INTO campaign_hex_cells (
          campaign_id, hex_id, side, country_id, investment_tier, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(campaign_id, hex_id) DO UPDATE SET
          investment_tier = excluded.investment_tier,
          updated_at = excluded.updated_at`,
      )
      .run(campaignId, hexId, side, countryId, nextTier, now, now);
  })();

  return { newTier: nextTier, tierInfo: targetInfo, remainingFunds };
}
