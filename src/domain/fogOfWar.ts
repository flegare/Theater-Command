import type { CampaignDatabase } from "../infrastructure/database.js";
import {
  getAllBalticCoreHexCells,
  getHexNeighbors,
  getAxialDistance,
  getHexCellDefinition,
} from "./hexGrid.js";
import { generatedLandHexes } from "./generatedGlobalHexData.js";
import type { CampaignFormation } from "./militaryFormations.js";

export type HexVisibilityLevel = "full" | "recon" | "shrouded";

export type HexVisibilityMatrix = Record<string, HexVisibilityLevel>;

export type FilteredCampaignFormation = CampaignFormation & {
  isContact?: boolean;
  contactType?: "surface" | "subsurface" | "air" | "ground";
  intelConfidence?:
    "confirmed" | "acoustic_track" | "radar_return" | "visual_sentry";
};

// Fast lookup map for land hexes grouped by sovereign country ID
const countryLandHexMap = new Map<string, string[]>();
for (const [key, land] of Object.entries(generatedLandHexes)) {
  const match = /^q(-?\d+)_r(-?\d+)$/.exec(key);
  if (match) {
    const q = Number.parseInt(match[1]!, 10);
    const r = Number.parseInt(match[2]!, 10);
    const hexId = `hex-w-q${q >= 0 ? `p${q}` : `m${Math.abs(q)}`}-r${r >= 0 ? `p${r}` : `m${Math.abs(r)}`}`;
    let list = countryLandHexMap.get(land.c);
    if (!list) {
      list = [];
      countryLandHexMap.set(land.c, list);
    }
    list.push(hexId);
  }
}

/**
 * Calculates the complete Fog of War sensor and intelligence visibility matrix
 * for the human player's sovereign nation and its allied treaty network.
 */
export function calculatePlayerVisibilityMatrix(
  database: CampaignDatabase,
  campaignId: string,
  playerCountryId: string,
): HexVisibilityMatrix {
  const matrix: HexVisibilityMatrix = {};
  const allHexes = getAllBalticCoreHexCells();

  // Initialize all hexes as shrouded by default
  for (const hex of allHexes) {
    matrix[hex.id] = "shrouded";
  }

  // 1. Determine player side & allied countries with intelligence-sharing treaties
  let playerSide = "blufor";
  const alliedCountries = new Set<string>([playerCountryId]);

  try {
    const playerRow = database
      .prepare(
        `SELECT c.coalition_id, co.id AS co_id, co.side
         FROM countries c
         LEFT JOIN coalitions co ON c.coalition_id = co.id AND c.campaign_id = co.campaign_id
         WHERE c.campaign_id = ? AND c.id = ? LIMIT 1`,
      )
      .get(campaignId, playerCountryId) as
      { coalition_id?: string; co_id?: string; side?: string } | undefined;

    const rawSide = (playerRow?.side ?? "").toLowerCase();
    const rawCoId = (
      playerRow?.co_id ??
      playerRow?.coalition_id ??
      ""
    ).toLowerCase();
    if (
      rawSide.includes("nato") ||
      rawCoId.includes("nato") ||
      rawSide === "blufor"
    ) {
      playerSide = "blufor";
    } else if (
      rawSide.includes("warsaw") ||
      rawCoId.includes("warsaw") ||
      rawSide === "opfor"
    ) {
      playerSide = "opfor";
    }

    if (playerRow?.coalition_id) {
      const members = database
        .prepare(
          `SELECT id FROM countries WHERE campaign_id = ? AND coalition_id = ?`,
        )
        .all(campaignId, playerRow.coalition_id) as Array<{ id: string }>;
      for (const m of members) {
        alliedCountries.add(m.id);
      }
    }
  } catch {
    playerSide = "blufor";
  }

  // Check active treaties in database (mutual defense, intelligence sharing, or NATO coalition)
  try {
    const treaties = database
      .prepare(
        `SELECT party_a_country_id, party_b_country_id, treaty_type
         FROM campaign_treaties
         WHERE campaign_id = ? AND turns_remaining > 0`,
      )
      .all(campaignId) as Array<{
      party_a_country_id: string;
      party_b_country_id: string;
      treaty_type: string;
    }>;

    for (const t of treaties) {
      if (
        t.treaty_type === "intelligence_sharing_treaty" ||
        t.treaty_type === "joint_defense_pact" ||
        t.treaty_type === "mutual_defense_alliance"
      ) {
        if (t.party_a_country_id === playerCountryId) {
          alliedCountries.add(t.party_b_country_id);
        } else if (t.party_b_country_id === playerCountryId) {
          alliedCountries.add(t.party_a_country_id);
        }
      }
    }
  } catch {
    // Treaties table may be empty or unmigrated in tests
  }

  // Baseline alliance partners if player is NATO / BLUFOR
  if (playerSide === "blufor" || playerCountryId === "norway") {
    alliedCountries.add("norway");
    alliedCountries.add("united-states");
    alliedCountries.add("united-kingdom");
    alliedCountries.add("denmark");
    alliedCountries.add("west-germany");
  }

  // 2. Process friendly & allied strategic hexes and facilities
  const hexOverrides = database
    .prepare(
      `SELECT hex_id, side, country_id, occupying_country_id, contested FROM campaign_hex_cells WHERE campaign_id = ?`,
    )
    .all(campaignId) as Array<{
    hex_id: string;
    side: string;
    country_id: string;
    occupying_country_id: string | null;
    contested: number;
  }>;
  const hexOwnershipMap = new Map<
    string,
    {
      side: string;
      countryId: string;
      occupyingCountryId?: string | null;
      contested?: boolean;
    }
  >();
  for (const o of hexOverrides) {
    hexOwnershipMap.set(o.hex_id, {
      side: o.side,
      countryId: o.country_id,
      occupyingCountryId: o.occupying_country_id,
      contested: Boolean(o.contested),
    });
  }

  for (const hex of allHexes) {
    const override = hexOwnershipMap.get(hex.id);
    const ownerCountryId = override?.countryId ?? hex.ownership.countryId;
    const isFriendlyOwner =
      alliedCountries.has(ownerCountryId) ||
      ownerCountryId === playerCountryId ||
      override?.side === "blufor" ||
      (hex.ownership.side === "blufor" && playerSide === "blufor");

    if (isFriendlyOwner) {
      // Sovereign / allied base sectors have full internal visibility
      matrix[hex.id] = "full";

      // Immediate 1-hex security perimeter for standard naval/air bases
      const neighbors = getHexNeighbors(hex);
      for (const n of neighbors) {
        if (matrix[n.id] !== "full") {
          matrix[n.id] = "recon";
        }
      }

      // Early Warning Radar Sites (e.g. Vardø Globus, Bodø, Tingstäde) have extended range (radius 2)
      if (hex.facilities.includes("radar_site")) {
        for (const target of allHexes) {
          const dist = getAxialDistance(hex.axial, target.axial);
          if (dist === 1) {
            matrix[target.id] = "full";
          } else if (dist === 2 && matrix[target.id] !== "full") {
            matrix[target.id] = "recon";
          }
        }
      }
    }

    // Acoustic SOSUS Hydrophone array nodes detect sub/surface activity in their exact maritime sector
    if (
      hex.id === "hex-sea-norwegian" &&
      (playerSide === "blufor" || alliedCountries.has("united-states"))
    ) {
      if (matrix[hex.id] === "shrouded") {
        matrix[hex.id] = "recon";
      }
    }
  }

  // 2b. All procedural sovereign & allied land hexes:
  // "hex owned by a country shouldnt be invisible on the fog of war (ie. local authorities would report a full scale invasion to hq)"
  for (const cid of alliedCountries) {
    const hexList = countryLandHexMap.get(cid);
    if (hexList) {
      for (const hId of hexList) {
        const override = hexOwnershipMap.get(hId);
        // Only shroud if completely conquered, pacified, and non-contested by enemy
        if (
          override &&
          override.side === "opfor" &&
          !override.contested &&
          override.countryId !== playerCountryId
        ) {
          continue;
        }
        matrix[hId] = "full";
      }
    }
  }

  // Also include any campaign_hex_cells records belonging to player/allies
  for (const o of hexOverrides) {
    if (
      o.country_id === playerCountryId ||
      alliedCountries.has(o.country_id) ||
      o.side === "blufor"
    ) {
      matrix[o.hex_id] = "full";
    }
  }

  // 3. Process friendly & allied mobile formations (Ships, Aircraft, Ground forces)
  const formations = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, hex_id, status FROM campaign_formations WHERE campaign_id = ? AND status != 'depleted'`,
    )
    .all(campaignId) as Array<{
    id: string;
    name: string;
    unit_type: string;
    side: string;
    country_id: string;
    hex_id: string;
    status: string;
  }>;

  for (const f of formations) {
    const isFriendly =
      alliedCountries.has(f.country_id) || f.country_id === playerCountryId;
    if (!isFriendly) continue;

    const currentHex = getHexCellDefinition(f.hex_id);
    if (!currentHex) continue;

    // Unit's own sector is always 100% full visibility
    matrix[f.hex_id] = "full";

    // Standard surface / ground units scout adjacent 1-hex radius
    const neighbors = getHexNeighbors(currentHex);
    for (const n of neighbors) {
      if (matrix[n.id] !== "full") {
        matrix[n.id] = "recon";
      }
    }

    // High-altitude Tactical Fighter Wings and Maritime Strike Squadrons provide radius-2 air surveillance
    if (
      f.unit_type === "tactical_fighter_wing" ||
      f.unit_type === "maritime_strike_squadron"
    ) {
      for (const n of neighbors) {
        const nNeighbors = getHexNeighbors(n);
        for (const n2 of nNeighbors) {
          if (matrix[n2.id] !== "full") {
            matrix[n2.id] = "recon";
          }
        }
      }
    }
  }

  // 4. Check active covert reconnaissance missions (Spy satellites / SBS / Spetsnaz overflights)
  try {
    const activeReconOps = database
      .prepare(
        `SELECT target_hex_id FROM campaign_covert_operations
         WHERE campaign_id = ? AND op_type = 'COVERT_RECON_INFILTRATION' AND status = 'success'`,
      )
      .all(campaignId) as Array<{ target_hex_id: string }>;

    for (const op of activeReconOps) {
      const reconHex = getHexCellDefinition(op.target_hex_id);
      if (reconHex) {
        matrix[reconHex.id] = "full";
        for (const n of getHexNeighbors(reconHex)) {
          if (matrix[n.id] !== "full") {
            matrix[n.id] = "recon";
          }
        }
      }
    }
  } catch {
    // Covert ops table might be unpopulated
  }

  return matrix;
}

/**
 * Filters and fuzzes campaign formations based on the Fog of War visibility matrix.
 * In God Mode, returns all formations with 100% true identity.
 */
export function filterFormationsByVisibility(
  formations: CampaignFormation[],
  visibilityMatrix: HexVisibilityMatrix,
  playerCountryId: string,
  alliedCountryIds: Set<string>,
  godMode: boolean = false,
): FilteredCampaignFormation[] {
  if (godMode) {
    return formations.map((f) => ({
      ...f,
      intelConfidence: "confirmed",
    }));
  }

  const filtered: FilteredCampaignFormation[] = [];

  for (const f of formations) {
    const isFriendly =
      f.countryId === playerCountryId || alliedCountryIds.has(f.countryId);

    // Friendly and allied units are always visible to the player
    if (isFriendly) {
      filtered.push({
        ...f,
        intelConfidence: "confirmed",
      });
      continue;
    }

    // Check if the formation is located in sovereign or allied territory:
    // Local civilian authorities, border sentries, police, and home guard immediately report invaders to military HQ!
    const cell = getHexCellDefinition(f.hexId);
    const inSovereignTerritory =
      cell.ownership.countryId === playerCountryId ||
      alliedCountryIds.has(cell.ownership.countryId);

    const visibility =
      visibilityMatrix[f.hexId] ?? (inSovereignTerritory ? "full" : "shrouded");

    if (visibility === "full" || inSovereignTerritory) {
      // Direct visual/radar lock or reported by local sovereign civilian/military authorities: fully identified
      filtered.push({
        ...f,
        intelConfidence: "confirmed",
      });
    } else if (visibility === "recon") {
      // Sensor track on edge of radar / SOSUS acoustic horizon:
      // Fuzz identity into an unidentified contact
      const domain = f.archetype?.domain ?? "naval";
      let contactType: FilteredCampaignFormation["contactType"] = "surface";
      let contactName = "Unidentified Surface Contact";
      let confidence: FilteredCampaignFormation["intelConfidence"] =
        "radar_return";

      if (domain === "air") {
        contactType = "air";
        contactName = "Unidentified High-Speed Air Track";
        confidence = "radar_return";
      } else if (domain === "naval") {
        if (f.unitType === "submarine_squadron") {
          contactType = "subsurface";
          contactName = "Unidentified Subsurface Acoustic Contact";
          confidence = "acoustic_track";
        } else {
          contactType = "surface";
          contactName = "Unidentified Flotilla Radar Return";
          confidence = "radar_return";
        }
      } else {
        contactType = "ground";
        contactName = "Unidentified Ground Formation";
        confidence = "visual_sentry";
      }

      const contactFormation: FilteredCampaignFormation = {
        ...f,
        isContact: true,
        contactType,
        intelConfidence: confidence,
        name: contactName,
      };

      if (f.composition) {
        contactFormation.composition = {
          ...f.composition,
          flagshipName: "Unknown Command Vessel",
          summary: "Acoustic / Radar contact classification in progress.",
          units: [],
        };
      }

      filtered.push(contactFormation);
    }
    // If "shrouded", the enemy unit is completely hidden and omitted!
  }

  return filtered;
}
