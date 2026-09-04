import type { CampaignDatabase } from "../infrastructure/database.js";
import { findFormationHexPath } from "./hexPathfinding.js";
import {
  getAllBalticCoreHexCells,
  getHexCellDefinition,
  type StrategicHexCell,
} from "./hexGrid.js";
import {
  isWaterTerrain,
  type FormationUnitType,
} from "./militaryFormations.js";
import { getCampaignTension } from "./covertOperations.js";

export type AiOrderResult = {
  formationId: string;
  formationName: string;
  countryId: string;
  action: "move" | "rtb" | "defend" | "assault";
  targetHexId: string;
  summary: string;
};

export function processAiStrategicTurns(
  database: CampaignDatabase,
  campaignId: string,
  playerCountryId: string,
): AiOrderResult[] {
  const results: AiOrderResult[] = [];
  const tension = getCampaignTension(database, campaignId);
  const now = new Date().toISOString();

  // 1. Get all AI-controlled formations (formations not belonging to player)
  const aiFormations = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json
       FROM campaign_formations
       WHERE campaign_id = ? AND country_id != ? AND status != 'depleted'`,
    )
    .all(campaignId, playerCountryId) as Array<{
    id: string;
    name: string;
    unit_type: FormationUnitType;
    side: "blufor" | "opfor" | "neutral";
    country_id: string;
    hex_id: string;
    strength: number;
    action_points: number;
    max_action_points: number;
    status: string;
    metadata_json: string;
  }>;

  const hexCells = getAllBalticCoreHexCells();
  const hexMap = new Map<string, StrategicHexCell>();
  for (const h of hexCells) {
    hexMap.set(h.id, h);
  }

  // Find all friendly bases for each side
  const navalBasesBySide = new Map<string, string[]>();
  navalBasesBySide.set("blufor", [
    "hex-nor-bergen",
    "hex-nor-bodo",
    "hex-nor-oslo",
  ]);
  navalBasesBySide.set("opfor", [
    "hex-sov-kola",
    "hex-sov-polyarny",
    "hex-sov-kaliningrad",
    "hex-sov-kronstadt",
    "hex-sov-tallinn",
  ]);
  navalBasesBySide.set("neutral", [
    "hex-swe-stockholm",
    "hex-swe-karlskrona",
    "hex-fin-helsinki",
  ]);

  for (const form of aiFormations) {
    // If unit already has an active route in transit, skip issuing new command
    let meta: {
      fuelLevel?: number;
      ammoLevel?: number;
      activeRoute?: { targetHexId: string };
    } = {};
    try {
      meta = JSON.parse(form.metadata_json);
    } catch {
      meta = {};
    }

    if (meta.activeRoute) {
      continue;
    }

    const currentHex =
      hexMap.get(form.hex_id) ?? getHexCellDefinition(form.hex_id);
    if (!currentHex) continue;

    const isLowSupplies =
      (meta.fuelLevel ?? 100) < 30 || (meta.ammoLevel ?? 100) < 30;

    // If unit is occupying an enemy hex and actively capturing it, hold position to complete capture
    const currentHexDb = database
      .prepare(
        "SELECT side, country_id, contested, capture_turns_counter FROM campaign_hex_cells WHERE campaign_id = ? AND hex_id = ?",
      )
      .get(campaignId, form.hex_id) as
      | {
          side: string;
          country_id: string;
          contested: number;
          capture_turns_counter: number;
        }
      | undefined;

    if (
      currentHexDb &&
      currentHexDb.side !== form.side &&
      currentHexDb.capture_turns_counter > 0 &&
      !isLowSupplies
    ) {
      results.push({
        formationId: form.id,
        formationName: form.name,
        countryId: form.country_id,
        action: "assault",
        targetHexId: form.hex_id,
        summary: `${form.name} securing capture of sector ${form.hex_id} (Turn ${currentHexDb.capture_turns_counter}/5).`,
      });
      continue;
    }

    // If unit is in a contested hex, hold position and engage the enemy
    if (currentHexDb && currentHexDb.contested === 1 && !isLowSupplies) {
      results.push({
        formationId: form.id,
        formationName: form.name,
        countryId: form.country_id,
        action: "defend",
        targetHexId: form.hex_id,
        summary: `${form.name} engaged in tactical combat defending contested sector ${form.hex_id}.`,
      });
      continue;
    }

    // Maintain base garrison: if sole friendly unit in a key base sector, hold garrison
    const isBaseSector = currentHex.facilities.some(
      (f) => f === "naval_base" || f === "air_base" || f === "coastal_fort",
    );
    if (isBaseSector && currentHexDb?.side === form.side) {
      const friendlyInHex = aiFormations.filter(
        (f) => f.hex_id === form.hex_id && f.side === form.side,
      );
      if (friendlyInHex.length <= 1) {
        results.push({
          formationId: form.id,
          formationName: form.name,
          countryId: form.country_id,
          action: "defend",
          targetHexId: form.hex_id,
          summary: `${form.name} garrisoning strategic base at ${form.hex_id}.`,
        });
        continue;
      }
    }

    // A. If low on fuel/ammo -> RTB to nearest base
    if (isLowSupplies) {
      const bases = navalBasesBySide.get(form.side) || [];
      const targetBaseId = bases[0] || "hex-nor-bergen";
      const targetBase =
        hexMap.get(targetBaseId) ?? getHexCellDefinition(targetBaseId);

      if (targetBase && targetBaseId !== form.hex_id) {
        const path = findFormationHexPath({
          startAxial: currentHex.axial,
          targetAxial: targetBase.axial,
          unitType: form.unit_type,
          isEmbarked: false,
          currentAP: form.action_points,
          maxAP: form.max_action_points,
        });

        if (path.found && path.path.length > 1) {
          const nextHex = path.path[1]!;
          meta.activeRoute = { targetHexId: targetBaseId };

          database
            .prepare(
              `UPDATE campaign_formations
               SET hex_id = ?, updated_at = ?, metadata_json = ?
               WHERE id = ?`,
            )
            .run(nextHex.hexId, now, JSON.stringify(meta), form.id);

          results.push({
            formationId: form.id,
            formationName: form.name,
            countryId: form.country_id,
            action: "rtb",
            targetHexId: targetBaseId,
            summary: `${form.name} low on fuel/ammo; RTB movement ordered to ${targetBaseId}.`,
          });
          continue;
        } else {
          meta.activeRoute = { targetHexId: targetBaseId };
          database
            .prepare(
              `UPDATE campaign_formations
               SET updated_at = ?, metadata_json = ?
               WHERE id = ?`,
            )
            .run(now, JSON.stringify(meta), form.id);

          results.push({
            formationId: form.id,
            formationName: form.name,
            countryId: form.country_id,
            action: "rtb",
            targetHexId: targetBaseId,
            summary: `${form.name} low on fuel/ammo; RTB movement ordered to ${targetBaseId}.`,
          });
          continue;
        }
      }
    }

    // B. If OPFOR and high tension -> advance toward strategic choke points or carrier lanes
    if (form.side === "opfor" && tension.defconLevel <= 3) {
      const strategicTargets = [
        "hex-nor-bodo",
        "hex-nor-tromso",
        "hex-nor-bergen",
      ];
      const targetId =
        strategicTargets[Math.floor(Math.random() * strategicTargets.length)]!;
      const targetHex = hexMap.get(targetId) ?? getHexCellDefinition(targetId);

      if (targetHex && targetId !== form.hex_id) {
        const path = findFormationHexPath({
          startAxial: currentHex.axial,
          targetAxial: targetHex.axial,
          unitType: form.unit_type,
          isEmbarked: false,
          currentAP: form.action_points,
          maxAP: form.max_action_points,
        });

        if (path.found && path.path.length > 1) {
          const nextHex = path.path[1]!;

          database
            .prepare(
              `UPDATE campaign_formations
               SET hex_id = ?, updated_at = ?, metadata_json = ?
               WHERE id = ?`,
            )
            .run(nextHex.hexId, now, JSON.stringify(meta), form.id);

          results.push({
            formationId: form.id,
            formationName: form.name,
            countryId: form.country_id,
            action: "assault",
            targetHexId: targetId,
            summary: `${form.name} advanced toward frontline sector ${nextHex.hexId}.`,
          });
          continue;
        }
      }
    }

    // C. Default Defensive Patrol: if at sea, patrol adjacent water hex
    if (isWaterTerrain(currentHex.terrain) && Math.random() < 0.4) {
      results.push({
        formationId: form.id,
        formationName: form.name,
        countryId: form.country_id,
        action: "defend",
        targetHexId: form.hex_id,
        summary: `${form.name} maintaining combat air/naval patrol on sector ${form.hex_id}.`,
      });
    }
  }

  return results;
}
