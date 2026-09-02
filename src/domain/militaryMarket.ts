import type { CampaignDatabase } from "../infrastructure/database.js";
import type { FormationUnitType } from "./militaryFormations.js";

function generateUUID(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `order-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export type MilitaryMarketListing = {
  id: string;
  name: string;
  unitType: FormationUnitType;
  sourceCountry: string;
  costFunds: number;
  deliveryTurns: number;
  strength: number;
  description: string;
  defaultComposition: {
    classes: Array<{ className: string; role: string; count: number }>;
  };
};

export const COLD_WAR_MARKET_CATALOG: MilitaryMarketListing[] = [
  {
    id: "surplus-fletcher-dd",
    name: "Refitted Fletcher-class Destroyer",
    unitType: "surface_action_group",
    sourceCountry: "united-states",
    costFunds: 850,
    deliveryTurns: 2,
    strength: 65,
    description:
      "Cold War FRAM II modernized destroyer equipped with ASROC and sonar upgrades.",
    defaultComposition: {
      classes: [{ className: "Fletcher FRAM II", role: "Destroyer", count: 1 }],
    },
  },
  {
    id: "surplus-leander-ff",
    name: "Leander-class Frigate",
    unitType: "surface_action_group",
    sourceCountry: "united-kingdom",
    costFunds: 950,
    deliveryTurns: 2,
    strength: 75,
    description:
      "General-purpose frigate equipped with Ikara ASW and Seacat SAM missiles.",
    defaultComposition: {
      classes: [{ className: "Leander Batch 1", role: "Frigate", count: 1 }],
    },
  },
  {
    id: "surplus-type206-sub",
    name: "Type 206 Coastal Submarine",
    unitType: "submarine_squadron",
    sourceCountry: "west-germany",
    costFunds: 700,
    deliveryTurns: 3,
    strength: 80,
    description:
      "Highly stealthy diesel-electric submarine optimized for shallow littoral waters.",
    defaultComposition: {
      classes: [{ className: "Type 206", role: "Submarine", count: 1 }],
    },
  },
  {
    id: "surplus-hauk-fast-patrol",
    name: "Hauk-class Missile Boat Division",
    unitType: "surface_action_group",
    sourceCountry: "norway",
    costFunds: 600,
    deliveryTurns: 1,
    strength: 60,
    description:
      "High-speed coastal strike craft armed with Penguin Mk 2 anti-ship missiles.",
    defaultComposition: {
      classes: [{ className: "Hauk P986", role: "Missile Boat", count: 2 }],
    },
  },
  {
    id: "surplus-orion-p3b",
    name: "P-3B Orion Maritime Patrol Flight",
    unitType: "maritime_strike_squadron",
    sourceCountry: "united-states",
    costFunds: 1100,
    deliveryTurns: 2,
    strength: 85,
    description:
      "Long-range maritime patrol aircraft equipped with sonobuoys and Mk 46 torpedoes.",
    defaultComposition: {
      classes: [{ className: "P-3B Orion", role: "Maritime Patrol", count: 2 }],
    },
  },
  {
    id: "surplus-f104-starfighter",
    name: "F-104G Starfighter Strike Squadron",
    unitType: "tactical_fighter_wing",
    sourceCountry: "west-germany",
    costFunds: 900,
    deliveryTurns: 2,
    strength: 70,
    description:
      "Supersonic anti-ship strike squadron armed with Kormoran missiles.",
    defaultComposition: {
      classes: [{ className: "F-104G", role: "Strike Fighter", count: 4 }],
    },
  },
];

export type MarketOrderRecord = {
  id: string;
  campaignId: string;
  unitName: string;
  unitType: FormationUnitType;
  countryId: string;
  targetHexId: string;
  costFunds: number;
  deliveryTurn: number;
  turnsRemaining: number;
  status: "pending" | "delivered" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export function getMarketListing(
  listingId: string,
): MilitaryMarketListing | undefined {
  return COLD_WAR_MARKET_CATALOG.find((l) => l.id === listingId);
}

export function purchaseMarketUnit(
  database: CampaignDatabase,
  campaignId: string,
  buyerCountryId: string,
  listingId: string,
  targetHexId: string,
  customName?: string,
): { orderId: string; listing: MilitaryMarketListing; turnsRemaining: number } {
  const listing = getMarketListing(listingId);
  if (!listing) {
    throw new Error(`Market listing not found: ${listingId}`);
  }

  const economy = database
    .prepare("SELECT funds FROM campaign_economy WHERE campaign_id = ?")
    .get(campaignId) as { funds: number } | undefined;

  if (!economy || economy.funds < listing.costFunds) {
    throw new Error(
      `Insufficient funds to purchase ${listing.name}. Required: $${listing.costFunds}, Available: $${economy?.funds ?? 0}`,
    );
  }

  const orderId = generateUUID();
  const now = new Date().toISOString();
  const finalName = customName?.trim() || `${listing.name} (Surplus)`;

  database.transaction(() => {
    database
      .prepare(
        "UPDATE campaign_economy SET funds = funds - ?, updated_at = ? WHERE campaign_id = ?",
      )
      .run(listing.costFunds, now, campaignId);

    database
      .prepare(
        `INSERT INTO military_market_orders (
          id, campaign_id, unit_name, unit_type, country_id, target_hex_id, cost_funds, delivery_turn, turns_remaining, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        orderId,
        campaignId,
        finalName,
        listing.unitType,
        buyerCountryId,
        targetHexId,
        listing.costFunds,
        listing.deliveryTurns,
        listing.deliveryTurns,
        "pending",
        now,
        now,
      );
  })();

  return { orderId, listing, turnsRemaining: listing.deliveryTurns };
}

export function getPendingMarketOrders(
  database: CampaignDatabase,
  campaignId: string,
): MarketOrderRecord[] {
  const rows = database
    .prepare(
      `SELECT id, campaign_id, unit_name, unit_type, country_id, target_hex_id, cost_funds, delivery_turn, turns_remaining, status, created_at, updated_at
       FROM military_market_orders
       WHERE campaign_id = ? AND status = 'pending'
       ORDER BY turns_remaining ASC`,
    )
    .all(campaignId) as Array<{
    id: string;
    campaign_id: string;
    unit_name: string;
    unit_type: FormationUnitType;
    country_id: string;
    target_hex_id: string;
    cost_funds: number;
    delivery_turn: number;
    turns_remaining: number;
    status: "pending" | "delivered" | "cancelled";
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    unitName: r.unit_name,
    unitType: r.unit_type,
    countryId: r.country_id,
    targetHexId: r.target_hex_id,
    costFunds: r.cost_funds,
    deliveryTurn: r.delivery_turn,
    turnsRemaining: r.turns_remaining,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
