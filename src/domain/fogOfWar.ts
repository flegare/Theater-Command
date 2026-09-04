import type { CampaignDatabase } from "../infrastructure/database.js";
import {
  getAllBalticCoreHexCells,
  getHexNeighbors,
  getAxialDistance,
} from "./hexGrid.js";
import type { CampaignFormation } from "./militaryFormations.js";

export type HexVisibilityLevel = "full" | "recon" | "shrouded";

export type HexVisibilityMatrix = Record<string, HexVisibilityLevel>;

export type FilteredCampaignFormation = CampaignFormation & {
  isContact?: boolean;
  contactType?: "surface" | "subsurface" | "air" | "ground";
  intelConfidence?:
    "confirmed" | "acoustic_track" | "radar_return" | "visual_sentry";
};

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
  try {
    const playerSideRow = database
      .prepare(
        `SELECT co.side FROM countries c
         JOIN coalitions co ON c.coalition_id = co.id AND c.campaign_id = co.campaign_id
         WHERE c.campaign_id = ? AND c.id = ? LIMIT 1`,
      )
      .get(campaignId, playerCountryId) as { side?: string } | undefined;
    playerSide = playerSideRow?.side ?? "blufor";
  } catch {
    playerSide = "blufor";
  }

  const alliedCountries = new Set<string>([playerCountryId]);

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

  // Also include baseline alliance partners if player is NATO
  if (playerSide === "blufor") {
    alliedCountries.add("united-states");
    alliedCountries.add("united-kingdom");
    alliedCountries.add("denmark");
    alliedCountries.add("west-germany");
  }

  // 2. Process friendly & allied strategic hexes and facilities
  const hexOverrides = database
    .prepare(
      `SELECT hex_id, side, country_id FROM campaign_hex_cells WHERE campaign_id = ?`,
    )
    .all(campaignId) as Array<{
    hex_id: string;
    side: string;
    country_id: string;
  }>;
  const hexOwnershipMap = new Map<
    string,
    { side: string; countryId: string }
  >();
  for (const o of hexOverrides) {
    hexOwnershipMap.set(o.hex_id, { side: o.side, countryId: o.country_id });
  }

  for (const hex of allHexes) {
    const owner = hexOwnershipMap.get(hex.id) ?? hex.ownership;
    const isFriendlyOwner =
      alliedCountries.has(owner.countryId) ||
      owner.countryId === playerCountryId;

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

    const currentHex = allHexes.find((h) => h.id === f.hex_id);
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
      for (const target of allHexes) {
        const dist = getAxialDistance(currentHex.axial, target.axial);
        if (dist <= 1) {
          matrix[target.id] = "full";
        } else if (dist === 2 && matrix[target.id] !== "full") {
          matrix[target.id] = "recon";
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
      const reconHex = allHexes.find((h) => h.id === op.target_hex_id);
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

    const visibility = visibilityMatrix[f.hexId] ?? "shrouded";

    if (visibility === "full") {
      // Direct visual/radar lock: fully identified
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
