import { randomUUID } from "node:crypto";
import type { CampaignDatabase } from "../infrastructure/database.js";
import type { StrategicSite } from "../seeds/northernFlank.js";
import type { GlobalStrategicSite } from "../seeds/globalTheaters.js";
import {
  getStartingEconomyForCountry,
  seedCampaignFormations,
  getCampaignHexState,
  processTurnMovementOrders,
  processTurnDailyFormationsUpdate,
} from "./hexStrategicSystem.js";

export type WorldEntityStatus =
  "active" | "damaged" | "destroyed" | "repairing" | "sunk";

export type CampaignStateSnapshot = {
  economy: {
    funds: number;
    productionPoints: number;
    fuelStockpile: number;
    projectedDailyDelta: number;
  };
  entities: Array<{
    id: string;
    entityType: string;
    side: string;
    tag: string;
    displayName: string;
    status: string;
    quantity: number;
    metadata: Record<string, unknown>;
  }>;
  forceInventory: Array<{
    id: string;
    side: string;
    countryId: string;
    platformType: string;
    status: string;
    quantity: number;
    replacementCost: number;
    repairCost: number;
    repairHours: number;
  }>;
  destroyedInfrastructureTags: string[];
};

export type AaSiteProcurementFailure =
  | "campaign_not_found"
  | "economy_not_found"
  | "region_not_found"
  | "region_full"
  | "insufficient_funds";

export type AaSitePurchaseResult =
  | {
      ok: true;
      entityId: string;
      fundsRemaining: number;
      regionKey: string;
      purchaseCost: number;
    }
  | { ok: false; reason: AaSiteProcurementFailure };

export type SectorAssetPurchaseFailure =
  "campaign_not_found" | "economy_not_found" | "insufficient_funds";

export type SectorAssetPurchaseResult =
  | {
      ok: true;
      entityId: string;
      fundsRemaining: number;
      cost: number;
    }
  | { ok: false; reason: SectorAssetPurchaseFailure };

const inactiveEntityStatuses = new Set<WorldEntityStatus>([
  "destroyed",
  "sunk",
]);
export const AA_SITE_PURCHASE_COST = 180;

type LedgerStrategicSite = StrategicSite | GlobalStrategicSite;

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function siteEntityType(): string {
  return "infrastructure";
}

function strategicSiteRegionKey(siteId: string): string {
  const base = slug(siteId);
  const [region] = base.split("-");
  return region && region.length > 0 ? region : base;
}

function siteTag(site: LedgerStrategicSite): string {
  const name = `${site.id} ${site.name}`.toLowerCase();
  if (/refiner|mongstad/.test(name)) return "refinery";
  if (/hawk|air\s*defense|aa/.test(name) || site.kind === "aa_site")
    return "hawk_site";
  if (
    /airport|air\s*station|air\s*base|flesland/.test(name) ||
    site.kind === "air_base"
  ) {
    return "airport";
  }
  if (/oil\s*platform|platform|offshore/.test(name)) return "oil_platform";
  if (/port|harbor|harbour/.test(name) || site.kind === "port") return "port";
  if (site.kind === "fuel_terminal") return "fuel_terminal";
  if (site.kind === "resource_site") return "resource_site";
  return slug(site.kind);
}

function sideForCountry(
  countryId: string,
  playerCountryId: string,
): "blufor" | "opfor" | "neutral" {
  if (countryId === playerCountryId) return "blufor";
  if (["soviet-union", "iraq"].includes(countryId)) return "opfor";
  return "neutral";
}

function siteDailyFundsDelta(site: LedgerStrategicSite): number {
  if (site.revenuePerDay !== undefined) return site.revenuePerDay;
  const tag = siteTag(site);
  if (tag === "refinery") return 24;
  if (tag === "oil_platform") return 18;
  if (tag === "port") return 10;
  if (site.kind === "city_region") return 14;
  if (site.kind === "factory") return 8;
  return 0;
}

function toIsoDay(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function jsonParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

type AaRow = {
  status: string;
  metadata_json: string;
};

function aaRegionStats(
  rows: AaRow[],
  playerCountryId: string,
  regionKey: string,
): { capacity: number; active: number; anchor?: Record<string, unknown> } {
  let capacity = 0;
  let active = 0;
  let anchor: Record<string, unknown> | undefined;

  for (const row of rows) {
    const metadata = jsonParse(row.metadata_json);
    const countryId = asText(metadata.countryId);
    if (countryId !== playerCountryId) continue;
    const source = asText(metadata.source);
    const rowRegion =
      asText(metadata.regionKey) ??
      asText(metadata.strategicSiteId)?.split("-")[0];
    if (rowRegion !== regionKey) continue;

    if (source === "strategic-site") {
      capacity += 1;
      if (!anchor) anchor = metadata;
    }
    if (!inactiveEntityStatuses.has(row.status as WorldEntityStatus)) {
      active += 1;
    }
  }

  return anchor ? { capacity, active, anchor } : { capacity, active };
}

export function seedCampaignLedger(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    scenarioFamilyId: string;
    playerCountryId: string;
    campaignTime: string;
    strategicSites: LedgerStrategicSite[];
  },
): void {
  const now = toIsoDay(input.campaignTime);
  const starting = getStartingEconomyForCountry(input.playerCountryId);
  const insertEconomy = database.prepare(
    `INSERT OR IGNORE INTO campaign_economy (campaign_id, funds, production_points, fuel_stockpile, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  insertEconomy.run(
    input.campaignId,
    starting.funds,
    starting.productionPoints,
    starting.fuelStockpile,
    now,
  );
  seedCampaignFormations(database, input.campaignId);

  const insertEntity = database.prepare(
    `INSERT OR IGNORE INTO world_entities (
      id, campaign_id, entity_type, side, tag, display_name, status, quantity, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEffect = database.prepare(
    `INSERT OR IGNORE INTO world_entity_effects (
      id, campaign_id, entity_id, effect_type, amount, active, reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertForce = database.prepare(
    `INSERT OR IGNORE INTO force_inventory (
      id, campaign_id, side, country_id, platform_type, status, quantity, replacement_cost, repair_cost, repair_hours, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const site of input.strategicSites) {
    const entityId = `${input.campaignId}:site:${slug(site.id)}`;
    const dailyDelta = siteDailyFundsDelta(site);
    insertEntity.run(
      entityId,
      input.campaignId,
      siteEntityType(),
      sideForCountry(site.countryId, input.playerCountryId),
      siteTag(site),
      site.name,
      "active",
      1,
      JSON.stringify({
        theater: input.scenarioFamilyId,
        source: "strategic-site",
        strategicSiteId: site.id,
        regionKey: strategicSiteRegionKey(site.id),
        countryId: site.countryId,
        latitude: site.latitude,
        longitude: site.longitude,
        kind: site.kind,
      }),
      now,
      now,
    );
    if (dailyDelta !== 0) {
      insertEffect.run(
        `${entityId}:daily-funds`,
        input.campaignId,
        entityId,
        "daily_funds_delta",
        dailyDelta,
        1,
        `${site.name} operational daily effect`,
        now,
        now,
      );
    }
  }

  insertForce.run(
    `${input.campaignId}:force:blufor:sleipner`,
    input.campaignId,
    "blufor",
    input.playerCountryId,
    "knm_fs_sleipner",
    "available",
    1,
    320,
    90,
    36,
    now,
    now,
  );
  insertForce.run(
    `${input.campaignId}:force:opfor:submarine`,
    input.campaignId,
    "opfor",
    "soviet-union",
    "wp_ssn_victor1",
    "available",
    2,
    450,
    140,
    60,
    now,
    now,
  );
}

export function getCampaignStateSnapshot(
  database: CampaignDatabase,
  campaignId: string,
): CampaignStateSnapshot {
  const economy = database
    .prepare(
      `SELECT funds, production_points, fuel_stockpile FROM campaign_economy WHERE campaign_id = ?`,
    )
    .get(campaignId) as
    | { funds: number; production_points: number; fuel_stockpile: number }
    | undefined;

  const projected = database
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM world_entity_effects
       WHERE campaign_id = ? AND effect_type = 'daily_funds_delta' AND active = 1`,
    )
    .get(campaignId) as { total: number };

  const entities = database
    .prepare(
      `SELECT id, entity_type, side, tag, display_name, status, quantity, metadata_json
       FROM world_entities
       WHERE campaign_id = ?
       ORDER BY entity_type, display_name`,
    )
    .all(campaignId) as Array<{
    id: string;
    entity_type: string;
    side: string;
    tag: string;
    display_name: string;
    status: string;
    quantity: number;
    metadata_json: string;
  }>;

  const forceInventory = database
    .prepare(
      `SELECT id, side, country_id, platform_type, status, quantity, replacement_cost, repair_cost, repair_hours
       FROM force_inventory
       WHERE campaign_id = ?
       ORDER BY side, platform_type`,
    )
    .all(campaignId) as Array<{
    id: string;
    side: string;
    country_id: string;
    platform_type: string;
    status: string;
    quantity: number;
    replacement_cost: number;
    repair_cost: number;
    repair_hours: number;
  }>;

  const destroyedInfrastructureTags = entities
    .filter(
      (entity) =>
        entity.entity_type === "infrastructure" &&
        (entity.status === "destroyed" || entity.status === "sunk"),
    )
    .map((entity) => entity.tag);

  const hexState = getCampaignHexState(database, campaignId);
  const totalProjectedFunds =
    projected.total + hexState.turnSummary.netFundsDelta;

  return {
    economy: {
      funds: economy?.funds ?? 0,
      productionPoints: economy?.production_points ?? 50,
      fuelStockpile: economy?.fuel_stockpile ?? 200,
      projectedDailyDelta: totalProjectedFunds,
    },
    entities: entities.map((entity) => ({
      id: entity.id,
      entityType: entity.entity_type,
      side: entity.side,
      tag: entity.tag,
      displayName: entity.display_name,
      status: entity.status,
      quantity: entity.quantity,
      metadata: jsonParse(entity.metadata_json),
    })),
    forceInventory: forceInventory.map((entry) => ({
      id: entry.id,
      side: entry.side,
      countryId: entry.country_id,
      platformType: entry.platform_type,
      status: entry.status,
      quantity: entry.quantity,
      replacementCost: entry.replacement_cost,
      repairCost: entry.repair_cost,
      repairHours: entry.repair_hours,
    })),
    destroyedInfrastructureTags,
  };
}

export function updateWorldEntityStatus(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    entityId: string;
    status: WorldEntityStatus;
    quantity?: number;
  },
): boolean {
  const now = new Date().toISOString();
  const existing = database
    .prepare(`SELECT id FROM world_entities WHERE campaign_id = ? AND id = ?`)
    .get(input.campaignId, input.entityId) as { id: string } | undefined;
  if (!existing) return false;

  database
    .prepare(
      `UPDATE world_entities
       SET status = ?,
           quantity = COALESCE(?, quantity),
           updated_at = ?
       WHERE campaign_id = ? AND id = ?`,
    )
    .run(
      input.status,
      input.quantity ?? null,
      now,
      input.campaignId,
      input.entityId,
    );

  const active = inactiveEntityStatuses.has(input.status) ? 0 : 1;
  database
    .prepare(
      `UPDATE world_entity_effects
       SET active = ?, updated_at = ?
       WHERE campaign_id = ? AND entity_id = ?`,
    )
    .run(active, now, input.campaignId, input.entityId);
  return true;
}

export function registerWorldEntity(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    entityType: string;
    side: string;
    tag: string;
    displayName: string;
    quantity?: number;
    metadata?: Record<string, unknown>;
    dailyFundsDelta?: number;
  },
): string {
  const now = new Date().toISOString();
  const entityId = `${input.campaignId}:entity:${randomUUID()}`;
  database
    .prepare(
      `INSERT INTO world_entities (
        id, campaign_id, entity_type, side, tag, display_name, status, quantity, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    )
    .run(
      entityId,
      input.campaignId,
      input.entityType,
      input.side,
      input.tag,
      input.displayName,
      Math.max(1, input.quantity ?? 1),
      JSON.stringify(input.metadata ?? {}),
      now,
      now,
    );

  if ((input.dailyFundsDelta ?? 0) !== 0) {
    database
      .prepare(
        `INSERT INTO world_entity_effects (
          id, campaign_id, entity_id, effect_type, amount, active, reason, created_at, updated_at
        ) VALUES (?, ?, ?, 'daily_funds_delta', ?, 1, ?, ?, ?)`,
      )
      .run(
        `${entityId}:daily-funds`,
        input.campaignId,
        entityId,
        input.dailyFundsDelta,
        `${input.displayName} operational daily effect`,
        now,
        now,
      );
  }
  return entityId;
}

export function applyForceInventoryAction(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    inventoryId: string;
    action: "purchase" | "loss" | "repair";
    quantity: number;
  },
): boolean {
  const now = new Date().toISOString();
  const row = database
    .prepare(
      `SELECT quantity, replacement_cost, repair_cost
       FROM force_inventory
       WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.inventoryId) as
    | { quantity: number; replacement_cost: number; repair_cost: number }
    | undefined;
  if (!row) return false;
  if (input.quantity <= 0) return false;

  let nextQuantity = row.quantity;
  let fundsDelta = 0;
  if (input.action === "purchase") {
    nextQuantity += input.quantity;
    fundsDelta -= row.replacement_cost * input.quantity;
  } else if (input.action === "loss") {
    nextQuantity = Math.max(0, row.quantity - input.quantity);
  } else {
    fundsDelta -= row.repair_cost * input.quantity;
  }

  database
    .prepare(
      `UPDATE force_inventory
       SET quantity = ?,
           status = ?,
           updated_at = ?
       WHERE campaign_id = ? AND id = ?`,
    )
    .run(
      nextQuantity,
      nextQuantity > 0 ? "available" : "depleted",
      now,
      input.campaignId,
      input.inventoryId,
    );

  if (fundsDelta !== 0) {
    database
      .prepare(
        `UPDATE campaign_economy
         SET funds = funds + ?, updated_at = ?
         WHERE campaign_id = ?`,
      )
      .run(fundsDelta, now, input.campaignId);
  }
  return true;
}

export function purchaseAaSite(
  database: CampaignDatabase,
  input: { campaignId: string; regionKey: string },
): AaSitePurchaseResult {
  const normalizedRegion = slug(input.regionKey);
  if (!normalizedRegion) return { ok: false, reason: "region_not_found" };

  const getPlayerCountry = database.prepare(
    `SELECT country_id FROM campaign_players WHERE campaign_id = ? ORDER BY created_at ASC LIMIT 1`,
  );
  const getEconomy = database.prepare(
    `SELECT funds FROM campaign_economy WHERE campaign_id = ?`,
  );
  const getAaRows = database.prepare(
    `SELECT status, metadata_json
     FROM world_entities
     WHERE campaign_id = ? AND tag = 'hawk_site'`,
  );
  const insertEntity = database.prepare(
    `INSERT INTO world_entities (
      id, campaign_id, entity_type, side, tag, display_name, status, quantity, metadata_json, created_at, updated_at
    ) VALUES (?, ?, 'infrastructure', 'blufor', 'hawk_site', ?, 'active', 1, ?, ?, ?)`,
  );
  const updateEconomy = database.prepare(
    `UPDATE campaign_economy
     SET funds = funds - ?, updated_at = ?
     WHERE campaign_id = ?`,
  );

  const result = database.transaction((): AaSitePurchaseResult => {
    const player = getPlayerCountry.get(input.campaignId) as
      { country_id: string } | undefined;
    if (!player) return { ok: false, reason: "campaign_not_found" };

    const economy = getEconomy.get(input.campaignId) as
      { funds: number } | undefined;
    if (!economy) return { ok: false, reason: "economy_not_found" };

    const rows = getAaRows.all(input.campaignId) as AaRow[];
    const region = aaRegionStats(rows, player.country_id, normalizedRegion);
    if (region.capacity === 0) {
      return { ok: false, reason: "region_not_found" };
    }
    if (region.active >= region.capacity) {
      return { ok: false, reason: "region_full" };
    }
    if (economy.funds < AA_SITE_PURCHASE_COST) {
      return { ok: false, reason: "insufficient_funds" };
    }

    const now = new Date().toISOString();
    const entityId = `${input.campaignId}:entity:${randomUUID()}`;
    const latitude = Number(region.anchor?.latitude ?? 0);
    const longitude = Number(region.anchor?.longitude ?? 0);
    insertEntity.run(
      entityId,
      input.campaignId,
      `${normalizedRegion.toUpperCase()} AA Redeployment`,
      JSON.stringify({
        source: "purchased-aa-site",
        regionKey: normalizedRegion,
        countryId: player.country_id,
        latitude,
        longitude,
        purchaseCost: AA_SITE_PURCHASE_COST,
      }),
      now,
      now,
    );
    updateEconomy.run(AA_SITE_PURCHASE_COST, now, input.campaignId);

    return {
      ok: true,
      entityId,
      fundsRemaining: economy.funds - AA_SITE_PURCHASE_COST,
      regionKey: normalizedRegion,
      purchaseCost: AA_SITE_PURCHASE_COST,
    };
  })();

  return result;
}

export function purchaseSectorAsset(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    sectorId: string;
    assetKind: "unit" | "strategic";
    category: string;
    displayName: string;
    cost: number;
    side: "blufor" | "opfor" | "neutral";
    quantity?: number;
    dailyFundsDelta?: number;
    metadata?: Record<string, unknown>;
  },
): SectorAssetPurchaseResult {
  const getPlayerCountry = database.prepare(
    `SELECT country_id FROM campaign_players WHERE campaign_id = ? ORDER BY created_at ASC LIMIT 1`,
  );
  const getEconomy = database.prepare(
    `SELECT funds FROM campaign_economy WHERE campaign_id = ?`,
  );
  const insertEntity = database.prepare(
    `INSERT INTO world_entities (
      id, campaign_id, entity_type, side, tag, display_name, status, quantity, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
  );
  const insertEffect = database.prepare(
    `INSERT INTO world_entity_effects (
      id, campaign_id, entity_id, effect_type, amount, active, reason, created_at, updated_at
    ) VALUES (?, ?, ?, 'daily_funds_delta', ?, 1, ?, ?, ?)`,
  );
  const updateEconomy = database.prepare(
    `UPDATE campaign_economy
     SET funds = funds - ?, updated_at = ?
     WHERE campaign_id = ?`,
  );

  const safeCost = Math.max(0, Math.floor(input.cost));
  const result = database.transaction((): SectorAssetPurchaseResult => {
    const player = getPlayerCountry.get(input.campaignId) as
      { country_id: string } | undefined;
    if (!player) return { ok: false, reason: "campaign_not_found" };

    const economy = getEconomy.get(input.campaignId) as
      { funds: number } | undefined;
    if (!economy) return { ok: false, reason: "economy_not_found" };
    if (economy.funds < safeCost) {
      return { ok: false, reason: "insufficient_funds" };
    }

    const now = new Date().toISOString();
    const entityId = `${input.campaignId}:entity:${randomUUID()}`;
    const entityType =
      input.assetKind === "unit" ? "unit_asset" : "strategic_asset";
    const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
    const metadata = {
      ...(input.metadata ?? {}),
      source: "sector-asset-purchase",
      sectorId: input.sectorId,
      category: input.category,
      assetKind: input.assetKind,
      purchaserCountryId: player.country_id,
      purchaseCost: safeCost,
    };

    insertEntity.run(
      entityId,
      input.campaignId,
      entityType,
      input.side,
      input.category,
      input.displayName,
      quantity,
      JSON.stringify(metadata),
      now,
      now,
    );

    const dailyFundsDelta = Math.floor(input.dailyFundsDelta ?? 0);
    if (dailyFundsDelta !== 0) {
      insertEffect.run(
        `${entityId}:daily-funds`,
        input.campaignId,
        entityId,
        dailyFundsDelta,
        `${input.displayName} sector asset effect`,
        now,
        now,
      );
    }

    if (safeCost > 0) {
      updateEconomy.run(safeCost, now, input.campaignId);
    }

    return {
      ok: true,
      entityId,
      fundsRemaining: economy.funds - safeCost,
      cost: safeCost,
    };
  })();

  return result;
}

export function advanceCampaignDay(
  database: CampaignDatabase,
  campaignId: string,
):
  | {
      fundsDelta: number;
      productionDelta: number;
      fuelDelta: number;
      campaignTime: string;
    }
  | undefined {
  const current = database
    .prepare(`SELECT campaign_time FROM campaigns WHERE id = ?`)
    .get(campaignId) as { campaign_time: string } | undefined;
  if (!current) return undefined;

  const hexState = getCampaignHexState(database, campaignId);
  const daily = database
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM world_entity_effects
       WHERE campaign_id = ? AND effect_type = 'daily_funds_delta' AND active = 1`,
    )
    .get(campaignId) as { total: number };

  const netFunds = daily.total + hexState.turnSummary.netFundsDelta;
  const netProd = hexState.turnSummary.netProductionDelta;
  const netFuel = hexState.turnSummary.netFuelDelta;

  const nextDate = new Date(current.campaign_time);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextTime = nextDate.toISOString();
  const now = new Date().toISOString();

  database.transaction(() => {
    database
      .prepare(
        `UPDATE campaign_economy
         SET funds = funds + ?,
             production_points = production_points + ?,
             fuel_stockpile = MAX(0, fuel_stockpile + ?),
             updated_at = ?
         WHERE campaign_id = ?`,
      )
      .run(netFunds, netProd, netFuel, now, campaignId);

    // Process daily formation lifecycle updates (embarking, disembarking, training, morale, fuel)
    processTurnDailyFormationsUpdate(database, campaignId);

    // Process all formations with active multi-turn movement orders
    const movementLogs = processTurnMovementOrders(database, campaignId);
    for (const move of movementLogs) {
      const moveSummary =
        move.status === "arrived"
          ? `${move.name} reached destination sector (${move.toHexId}) on Turn ${move.turnsElapsed}/${move.totalTurns}.`
          : move.status === "interrupted"
            ? `${move.name} halted at ${move.toHexId} due to hostile engagement!`
            : `${move.name} advanced to ${move.toHexId} (Step ${move.currentStep}/${move.totalSteps}, Turn ${move.turnsElapsed}/${move.totalTurns}).`;

      database
        .prepare(
          `INSERT INTO events (id, campaign_id, campaign_time, kind, summary, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          campaignId,
          nextTime,
          "formation_movement_advanced",
          moveSummary,
          now,
        );
    }

    database
      .prepare(`UPDATE campaigns SET campaign_time = ? WHERE id = ?`)
      .run(nextTime, campaignId);
    database
      .prepare(
        `INSERT INTO events (id, campaign_id, campaign_time, kind, summary, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        campaignId,
        nextTime,
        "campaign_day_advanced",
        `Turn advanced. Net Economy: Funds +${netFunds}, Production +${netProd}, Fuel +${netFuel}.`,
        now,
      );
  })();

  return {
    fundsDelta: netFunds,
    productionDelta: netProd,
    fuelDelta: netFuel,
    campaignTime: nextTime,
  };
}
