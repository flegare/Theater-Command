import type { CampaignDatabase } from "../infrastructure/database.js";
import { recordDiplomaticCable } from "./diplomacy.js";
import { getHexCellDefinition } from "./hexGrid.js";

function generateUUID(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `cov-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export type CovertOpType =
  | "SABOTAGE_STOCKPILE_DEPOT"
  | "DISABLE_RADAR_AND_AIR_DEFENSE"
  | "CLANDESTINE_SEA_MINING"
  | "INDUSTRIAL_DISRUPTION"
  | "PROXY_SUBMARINE_INCURSION"
  | "SPECIAL_FORCES_RAID";

export type CovertOpRequiredCategory =
  "submarine" | "surface_combatant" | "land_commando";

export type CovertSortieOutcome =
  | "clean_success"
  | "stealth_failed"
  | "compromised_evaded"
  | "destroyed_nearshore";

export type CovertOpCatalogListing = {
  opType: CovertOpType;
  title: string;
  summary: string;
  fundsCost: number;
  baseSuccessRate: number; // 0.0 to 1.0
  baseAttributionRisk: number; // 0.0 to 1.0
  tensionImpact: number;
  requiredCategory: CovertOpRequiredCategory;
  requiredUnitLabel: string;
  minActionPoints: number;
  targetTerrainTypes: string[];
};

export const COVERT_OPS_CATALOG: CovertOpCatalogListing[] = [
  {
    opType: "PROXY_SUBMARINE_INCURSION",
    title: "🐬 Clandestine Submarine Incursion & Littoral Wiretap",
    summary:
      "Deploy an attack submarine into sovereign territorial waters to tap undersea communication cables, probe littoral sonar networks, and gather SIGINT. Critical risk: nearshore destruction triggers Full-Scale War.",
    fundsCost: 500,
    baseSuccessRate: 0.7,
    baseAttributionRisk: 0.3,
    tensionImpact: 20,
    requiredCategory: "submarine",
    requiredUnitLabel: "Attack Submarine Flotilla (SSN / SSK)",
    minActionPoints: 1,
    targetTerrainTypes: ["deep_sea", "coastal_waters", "mountain_fjord"],
  },
  {
    opType: "CLANDESTINE_SEA_MINING",
    title: "⚓ Clandestine Littoral Sea Mining",
    summary:
      "Deploy an unmarked rising-mine field in critical maritime chokepoints, inflicting heavy attrition and mobility denial on passing naval flotillas.",
    fundsCost: 550,
    baseSuccessRate: 0.65,
    baseAttributionRisk: 0.35,
    tensionImpact: 25,
    requiredCategory: "submarine",
    requiredUnitLabel: "Submarine or Minelaying Flotilla",
    minActionPoints: 1,
    targetTerrainTypes: ["deep_sea", "coastal_waters", "mountain_fjord"],
  },
  {
    opType: "SPECIAL_FORCES_RAID",
    title: "🗡️ Commando Special Forces Infiltration",
    summary:
      "Insert amphibious SBS / Spetsnaz reconnaissance commandos to gather high-fidelity intelligence on stationed enemy formations and installations.",
    fundsCost: 400,
    baseSuccessRate: 0.75,
    baseAttributionRisk: 0.25,
    tensionImpact: 15,
    requiredCategory: "land_commando",
    requiredUnitLabel: "Naval Infantry, Marine, or Commando Brigade",
    minActionPoints: 1,
    targetTerrainTypes: ["coastal_waters", "mountain_fjord", "plains", "hills"],
  },
  {
    opType: "SABOTAGE_STOCKPILE_DEPOT",
    title: "💥 Sabotage Strategic Stockpile Depot",
    summary:
      "Infiltrate enemy naval or air base perimeter to detonate 50% of stored strategic fuel barrels and missile reserves.",
    fundsCost: 450,
    baseSuccessRate: 0.7,
    baseAttributionRisk: 0.3,
    tensionImpact: 20,
    requiredCategory: "land_commando",
    requiredUnitLabel: "Marine, Commando, or Ground Formation",
    minActionPoints: 1,
    targetTerrainTypes: ["coastal_waters", "mountain_fjord", "plains", "hills"],
  },
  {
    opType: "DISABLE_RADAR_AND_AIR_DEFENSE",
    title: "📡 Blind Early-Warning Radar Array",
    summary:
      "Sabotage generator power lines and microwave antenna feeds, blinding regional radar coverage for 2 strategic turns.",
    fundsCost: 350,
    baseSuccessRate: 0.8,
    baseAttributionRisk: 0.2,
    tensionImpact: 15,
    requiredCategory: "land_commando",
    requiredUnitLabel: "Special Forces / Ground Infiltration Unit",
    minActionPoints: 1,
    targetTerrainTypes: ["coastal_waters", "mountain_fjord", "plains", "hills"],
  },
  {
    opType: "INDUSTRIAL_DISRUPTION",
    title: "⚙️ Industrial Subversion & Shipyard Sabotage",
    summary:
      "Subvert shipyard tooling and foment dockworker labor unrest, halving sector industrial production output.",
    fundsCost: 300,
    baseSuccessRate: 0.85,
    baseAttributionRisk: 0.15,
    tensionImpact: 10,
    requiredCategory: "land_commando",
    requiredUnitLabel: "Clandestine Operative Cell",
    minActionPoints: 1,
    targetTerrainTypes: ["mountain_fjord", "plains", "hills"],
  },
];

export type CovertOperationRecord = {
  id: string;
  campaignId: string;
  sourceCountryId: string;
  targetCountryId: string;
  targetHexId: string;
  opType: CovertOpType;
  status: "planned" | "success" | "failed" | "compromised";
  fundsCost: number;
  successChance: number;
  attributionRisk: number;
  detected: boolean;
  resultSummary: string;
  createdAt: string;
  updatedAt: string;
  assignedFormationId?: string | undefined;
  assignedFormationName?: string | undefined;
  resolutionMode?: "auto_resolve" | "tactical_mission" | undefined;
  tacticalMissionIni?: string | undefined;
  sortieOutcome?:
    | "pending"
    | "clean_success"
    | "compromised_evaded"
    | "destroyed_nearshore"
    | undefined;
  warDeclared?: boolean | undefined;
};

export type CampaignTensionState = {
  campaignId: string;
  tensionIndex: number; // 0 to 100
  defconLevel: 1 | 2 | 3 | 4 | 5;
  peaceTurnsCounter: number;
  lastIncidentSummary: string | null;
  updatedAt: string;
};

export function calculateDefcon(tension: number): 1 | 2 | 3 | 4 | 5 {
  if (tension >= 80) return 1;
  if (tension >= 60) return 2;
  if (tension >= 40) return 3;
  if (tension >= 20) return 4;
  return 5;
}

export function getCampaignTension(
  database: CampaignDatabase,
  campaignId: string,
): CampaignTensionState {
  const row = database
    .prepare(
      `SELECT campaign_id, tension_index, defcon_level, peace_turns_counter, last_incident_summary, updated_at
       FROM campaign_tensions WHERE campaign_id = ?`,
    )
    .get(campaignId) as
    | {
        campaign_id: string;
        tension_index: number;
        defcon_level: number;
        peace_turns_counter: number;
        last_incident_summary: string | null;
        updated_at: string;
      }
    | undefined;

  if (row) {
    return {
      campaignId: row.campaign_id,
      tensionIndex: row.tension_index,
      defconLevel: row.defcon_level as 1 | 2 | 3 | 4 | 5,
      peaceTurnsCounter: row.peace_turns_counter,
      lastIncidentSummary: row.last_incident_summary,
      updatedAt: row.updated_at,
    };
  }

  // Seed default DEFCON 5 tension
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT OR REPLACE INTO campaign_tensions (
        campaign_id, tension_index, defcon_level, peace_turns_counter, last_incident_summary, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(campaignId, 20, 5, 0, "Initial Cold War baseline posture.", now);

  return {
    campaignId,
    tensionIndex: 20,
    defconLevel: 5,
    peaceTurnsCounter: 0,
    lastIncidentSummary: "Initial Cold War baseline posture.",
    updatedAt: now,
  };
}

export function adjustCampaignTension(
  database: CampaignDatabase,
  campaignId: string,
  delta: number,
  reason: string,
): CampaignTensionState {
  const current = getCampaignTension(database, campaignId);
  const nextTension = Math.max(0, Math.min(100, current.tensionIndex + delta));
  const nextDefcon = calculateDefcon(nextTension);
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE campaign_tensions
       SET tension_index = ?, defcon_level = ?, last_incident_summary = ?, updated_at = ?
       WHERE campaign_id = ?`,
    )
    .run(nextTension, nextDefcon, reason, now, campaignId);

  return {
    campaignId,
    tensionIndex: nextTension,
    defconLevel: nextDefcon,
    peaceTurnsCounter: current.peaceTurnsCounter,
    lastIncidentSummary: reason,
    updatedAt: now,
  };
}

/**
 * Validates whether a given formation meets the capability and AP requirements for a black op.
 */
export function isFormationEligibleForCovertOp(
  formation: {
    id?: string;
    name?: string;
    unitType: string;
    actionPoints: number;
    strength: number;
    status: string;
    composition?:
      | {
          totalSubmarines?: number;
          totalVehicles?: number;
          totalVessels?: number;
        }
      | undefined;
  },
  opType: CovertOpType,
): { eligible: boolean; reason?: string } {
  const listing = COVERT_OPS_CATALOG.find((l) => l.opType === opType);
  if (!listing) return { eligible: false, reason: "Unknown operation type" };

  if (formation.status === "depleted" || formation.strength <= 0) {
    return { eligible: false, reason: "Formation is depleted / destroyed" };
  }
  if (formation.actionPoints < listing.minActionPoints) {
    return {
      eligible: false,
      reason: `Insufficient Action Points (has ${formation.actionPoints}, requires ${listing.minActionPoints})`,
    };
  }

  if (listing.requiredCategory === "submarine") {
    const isSub =
      formation.unitType === "submarine_flotilla" ||
      formation.unitType === "submarine_squadron" ||
      formation.unitType.includes("sub") ||
      (formation.composition?.totalSubmarines ?? 0) > 0;
    if (!isSub) {
      return {
        eligible: false,
        reason: "Requires a submarine formation (SSN / SSK)",
      };
    }
  } else if (listing.requiredCategory === "surface_combatant") {
    const isNaval =
      formation.unitType === "surface_action_group" ||
      formation.unitType === "carrier_strike_group" ||
      formation.unitType === "submarine_flotilla" ||
      formation.unitType === "submarine_squadron" ||
      formation.unitType.includes("sub") ||
      (formation.composition?.totalVessels ?? 0) > 0 ||
      (formation.composition?.totalSubmarines ?? 0) > 0;
    if (!isNaval) {
      return {
        eligible: false,
        reason: "Requires a naval combatant or submarine formation",
      };
    }
  } else if (listing.requiredCategory === "land_commando") {
    const isLand =
      formation.unitType === "motorized_division" ||
      formation.unitType === "armored_division" ||
      formation.unitType === "naval_infantry_brigade" ||
      formation.unitType === "marine_brigade" ||
      formation.unitType === "amphibious_group" ||
      formation.unitType === "amphibious_ready_group" ||
      formation.unitType.includes("infantry") ||
      formation.unitType.includes("commando") ||
      formation.unitType.includes("brigade");
    if (!isLand) {
      return {
        eligible: false,
        reason:
          "Requires a marine, naval infantry, or ground commando formation",
      };
    }
  }

  return { eligible: true };
}

/**
 * Lists player formations eligible for a specific covert operation.
 */
export function getEligibleFormationsForCovertOp(
  database: CampaignDatabase,
  campaignId: string,
  countryId: string,
  opType: CovertOpType,
): Array<{
  id: string;
  name: string;
  unitType: string;
  actionPoints: number;
  strength: number;
  hexId: string;
  flagshipName?: string | undefined;
}> {
  const rows = database
    .prepare(
      `SELECT id, name, unit_type, action_points, strength, status, hex_id, metadata_json
       FROM campaign_formations
       WHERE campaign_id = ? AND country_id = ? AND status != 'depleted' AND strength > 0`,
    )
    .all(campaignId, countryId) as Array<{
    id: string;
    name: string;
    unit_type: string;
    action_points: number;
    strength: number;
    status: string;
    hex_id: string;
    metadata_json: string | null;
  }>;

  return rows
    .map((r) => {
      let comp:
        | {
            totalSubmarines?: number;
            totalVehicles?: number;
            totalVessels?: number;
            flagshipName?: string;
          }
        | undefined = undefined;
      if (r.metadata_json) {
        try {
          const parsed = JSON.parse(r.metadata_json);
          comp = parsed.composition;
        } catch {
          // ignore
        }
      }
      return {
        id: r.id,
        name: r.name,
        unitType: r.unit_type,
        actionPoints: r.action_points,
        strength: r.strength,
        status: r.status,
        hexId: r.hex_id,
        flagshipName: comp?.flagshipName,
        composition: comp,
      };
    })
    .filter((f) => isFormationEligibleForCovertOp(f, opType).eligible)
    .map((f) => ({
      id: f.id,
      name: f.name,
      unitType: f.unitType,
      actionPoints: f.actionPoints,
      strength: f.strength,
      hexId: f.hexId,
      flagshipName: f.flagshipName,
    }));
}

/**
 * Generates an authentic Sea Power mission INI string representing the covert operation.
 */
export function generateCovertTacticalMissionIni(input: {
  sourceCountryId: string;
  targetCountryId: string;
  targetHexId: string;
  opType: CovertOpType;
  assignedFormationName: string;
  assignedFormationUnitType?: string | undefined;
}): string {
  const hex = getHexCellDefinition(input.targetHexId);
  const hexName = hex?.name ?? input.targetHexId;
  const cLat = hex?.centroid[0] ?? 69.5;
  const cLon = hex?.centroid[1] ?? 33.5;

  // Offsets for tactical tactical geometry
  const pLat = (cLat - 0.15).toFixed(4);
  const pLon = (cLon - 0.2).toFixed(4);
  const tLat = cLat.toFixed(4);
  const tLon = cLon.toFixed(4);
  const oLat = (cLat + 0.06).toFixed(4);
  const oLon = (cLon + 0.08).toFixed(4);
  const hLat = (cLat + 0.03).toFixed(4);
  const hLon = (cLon - 0.05).toFixed(4);
  const eLat = (cLat - 0.3).toFixed(4);
  const eLon = (cLon - 0.35).toFixed(4);

  // Model codes for player unit
  let playerModel = "usn_ssn_los_angeles";
  if (input.sourceCountryId === "norway") {
    playerModel = "no_ss_kobben";
  } else if (input.sourceCountryId === "united-kingdom") {
    playerModel = "rn_ssn_swiftsure";
  } else if (input.sourceCountryId === "sweden") {
    playerModel = "sw_ss_nacken";
  } else if (input.sourceCountryId === "soviet-union") {
    playerModel = "wp_ssn_victor3";
  }

  // Model codes for OPFOR defensive screen
  let opforShipModel = "wp_cor_grisha3";
  let opforHeloModel = "wp_helo_ka25_asw";
  if (input.targetCountryId === "norway") {
    opforShipModel = "knm_oslo";
    opforHeloModel = "rn_helo_sea_king_asw";
  } else if (input.targetCountryId === "united-kingdom") {
    opforShipModel = "rn_ffg_leander";
    opforHeloModel = "rn_helo_sea_king_asw";
  } else if (input.targetCountryId === "sweden") {
    opforShipModel = "sw_cor_stockholm";
    opforHeloModel = "sw_helo_bo105";
  }

  return `; Sea Power: Naval Combat in the Missile Age
; MISSION: Covert Black Operation // TOP SECRET
; Generated by Sea Power Theater Command

[Mission]
Title=Black Op: Clandestine Incursion off ${hexName}
Description=TOP SECRET // CLANDESTINE EYES ONLY\\n\\nTarget Sector: ${hexName} (${input.targetCountryId.toUpperCase()})\\nExecuting Formation: ${input.assignedFormationName}\\nOperation: ${input.opType}\\n\\nMISSION DIRECTIVE:\\nInfiltrate sovereign littoral approaches, gather SIGINT without detection, and egress to international waters.\\n\\nCRITICAL ESCALATION WARNING:\\nYou are operating inside sovereign foreign territorial waters without diplomatic clearance. If your submarine is detected and destroyed nearshore, wreckage and acoustic torpedo forensic analysis will definitively establish national attribution. This will cause an IMMEDIATE DECLARATION OF FULL-SCALE WAR (DEFCON 1).
Year=1983
Month=11
Day=6
Hour=02
Minute=30
Weather=Overcast
SeaState=3
WindSpeed=15
WindDirection=245
Clouds=Heavy
Rain=None

[Taskforce1]
Side=Blue
Name=Covert Infiltration Group
Country=${input.sourceCountryId.toUpperCase()}

[Taskforce1_Unit1]
Name=${input.assignedFormationName}
Type=${playerModel}
Position=${pLat},${pLon}
Heading=045
Speed=4
Depth=55
Emcon=PassiveOnly
PlayerControlled=True

[Taskforce2]
Side=Red
Name=Coastal Border Guard & ASW Screen
Country=${input.targetCountryId.toUpperCase()}

[Taskforce2_Unit1]
Name=Border Patrol Corvette
Type=${opforShipModel}
Position=${oLat},${oLon}
Heading=220
Speed=14
Emcon=ActiveSonarAndRadar
AiPosture=AggressiveSearch

[Taskforce2_Unit2]
Name=ASW Dipping Sonar Flight
Type=${opforHeloModel}
Position=${hLat},${hLon}
Altitude=120
Speed=85
Emcon=ActiveDippingSonar
AiPosture=ScreenPatrol

[Zone1]
Name=Covert Target Infiltration Zone
Type=Circle
Position=${tLat},${tLon}
RadiusNm=6

[Zone2]
Name=Extraction Corridor (International Waters)
Type=Box
Position=${eLat},${eLon}
WidthNm=12
LengthNm=16

[Objectives]
Primary=ReachZone(Zone1) AND RemainUndetected(900) AND ReachZone(Zone2)
Failure=UnitDestroyed(Taskforce1_Unit1) OR FiredTorpedosNearshore(Zone1)
EscalationCondition=TriggerFullScaleWarOnDestroyed(DEFCON_1)
`;
}

/**
 * Resolves a tactical mission outcome reported by the player after flying/playing the sortie in Sea Power.
 */
export function resolveTacticalCovertSortie(
  database: CampaignDatabase,
  campaignId: string,
  operationId: string,
  outcome: "clean_success" | "compromised_evaded" | "destroyed_nearshore",
): {
  ok: boolean;
  operation: CovertOperationRecord;
  warDeclared: boolean;
  message: string;
  tensionState: CampaignTensionState;
} {
  const row = database
    .prepare(
      `SELECT id, campaign_id, source_country_id, target_country_id, target_hex_id, op_type,
              funds_cost, success_chance, attribution_risk, assigned_formation_id, assigned_formation_name
       FROM covert_operations WHERE id = ? AND campaign_id = ?`,
    )
    .get(operationId, campaignId) as
    | {
        id: string;
        campaign_id: string;
        source_country_id: string;
        target_country_id: string;
        target_hex_id: string;
        op_type: CovertOpType;
        funds_cost: number;
        success_chance: number;
        attribution_risk: number;
        assigned_formation_id: string | null;
        assigned_formation_name: string | null;
      }
    | undefined;

  if (!row) {
    throw new Error(`Covert operation ${operationId} not found`);
  }

  const now = new Date().toISOString();
  let finalStatus: CovertOperationRecord["status"] = "failed";
  let warDeclared = false;
  let resultSummary = "";
  let tensionDelta = 10;

  if (outcome === "clean_success") {
    finalStatus = "success";
    resultSummary = `Operation succeeded with absolute stealth. Infiltration objectives achieved at sector ${row.target_hex_id}.`;
    tensionDelta = 10;

    // Sabotage depot if applicable
    database
      .prepare(
        `UPDATE campaign_hex_cells
         SET depot_fuel = MAX(0, CAST(depot_fuel * 0.5 AS INTEGER)),
             depot_missiles = MAX(0, CAST(depot_missiles * 0.5 AS INTEGER)),
             updated_at = ?
         WHERE campaign_id = ? AND hex_id = ?`,
      )
      .run(now, campaignId, row.target_hex_id);

    resultSummary += " Strategic fuel & munitions depot detonated!";
  } else if (outcome === "compromised_evaded") {
    finalStatus = "compromised";
    tensionDelta = 30;
    resultSummary = `COMPROMISED: Submarine was pinged by coastal ASW patrols! Evaded depth-charge screening forces and escaped with battle damage. Sovereign intrusion suspected.`;

    // Apply damage to assigned formation
    if (row.assigned_formation_id) {
      database
        .prepare(
          `UPDATE campaign_formations
           SET strength = MAX(15, strength - 35),
               status = 'damaged',
               updated_at = ?
           WHERE id = ? AND campaign_id = ?`,
        )
        .run(now, row.assigned_formation_id, campaignId);
    }

    // Degrade relations to hostile and void active treaties
    try {
      database
        .prepare(
          `INSERT INTO country_relations (campaign_id, country_id, related_country_id, stance)
           VALUES (?, ?, ?, 'hostile')
           ON CONFLICT(campaign_id, country_id, related_country_id)
           DO UPDATE SET stance = 'hostile'`,
        )
        .run(campaignId, row.target_country_id, row.source_country_id);

      database
        .prepare(
          `INSERT INTO country_relations (campaign_id, country_id, related_country_id, stance)
           VALUES (?, ?, ?, 'hostile')
           ON CONFLICT(campaign_id, country_id, related_country_id)
           DO UPDATE SET stance = 'hostile'`,
        )
        .run(campaignId, row.source_country_id, row.target_country_id);
    } catch {
      // ignore
    }

    database
      .prepare(
        `DELETE FROM diplomatic_treaties
         WHERE campaign_id = ?
           AND ((party_a_country_id = ? AND party_b_country_id = ?) OR (party_a_country_id = ? AND party_b_country_id = ?))`,
      )
      .run(
        campaignId,
        row.source_country_id,
        row.target_country_id,
        row.target_country_id,
        row.source_country_id,
      );
  } else if (outcome === "destroyed_nearshore") {
    finalStatus = "compromised";
    warDeclared = true;
    resultSummary = `CATASTROPHIC COMPROMISE: Submarine destroyed in sovereign waters! Wreckage and acoustic torpedo signatures conclusively attributed attack to ${row.source_country_id.toUpperCase()}. FULL-SCALE WAR DECLARED (DEFCON 1).`;

    // 1. Mark assigned formation DESTROYED
    if (row.assigned_formation_id) {
      database
        .prepare(
          `UPDATE campaign_formations
           SET strength = 0,
               status = 'depleted',
               updated_at = ?
           WHERE id = ? AND campaign_id = ?`,
        )
        .run(now, row.assigned_formation_id, campaignId);
    }

    // 2. Escalate tension to 100 / DEFCON 1
    tensionDelta = 100;

    // 3. Set bilateral relations to "war"
    try {
      database
        .prepare(
          `INSERT INTO country_relations (campaign_id, country_id, related_country_id, stance)
           VALUES (?, ?, ?, 'war')
           ON CONFLICT(campaign_id, country_id, related_country_id)
           DO UPDATE SET stance = 'war'`,
        )
        .run(campaignId, row.target_country_id, row.source_country_id);

      database
        .prepare(
          `INSERT INTO country_relations (campaign_id, country_id, related_country_id, stance)
           VALUES (?, ?, ?, 'war')
           ON CONFLICT(campaign_id, country_id, related_country_id)
           DO UPDATE SET stance = 'war'`,
        )
        .run(campaignId, row.source_country_id, row.target_country_id);
    } catch {
      // ignore
    }

    // 4. Void all treaties between the two nations
    database
      .prepare(
        `DELETE FROM diplomatic_treaties
         WHERE campaign_id = ?
           AND ((party_a_country_id = ? AND party_b_country_id = ?) OR (party_a_country_id = ? AND party_b_country_id = ?))`,
      )
      .run(
        campaignId,
        row.source_country_id,
        row.target_country_id,
        row.target_country_id,
        row.source_country_id,
      );

    // 5. Send Emergency Diplomatic War Cable to Player
    try {
      recordDiplomaticCable(database, campaignId, {
        senderCountryId: row.target_country_id,
        recipientCountryId: row.source_country_id,
        classification: "FLASH_URGENT",
        header: `WAR DECLARATION: Hostile Submarine Sunk in Sovereign Waters of ${row.target_hex_id.toUpperCase()}`,
        content: `At 03:15 hours, naval coastal defense forces engaged and destroyed an intruding hostile submarine in sovereign coastal waters off ${row.target_hex_id}. Forensic acoustic analysis and physical wreckage have conclusively confirmed the vessel belonged to ${row.source_country_id.toUpperCase()}. This unprovoked act of littoral aggression constitutes a formal Casus Belli. A state of war now exists between our nations. All diplomatic treaties are annulled and full retaliatory measures are authorized.`,
        stanceChange: "Hostile -> WAR (DEFCON 1 Active)",
      });
    } catch (cableErr) {
      console.error("Failed to send war declaration cable:", cableErr);
    }
  }

  // Adjust tension
  const tensionState = adjustCampaignTension(
    database,
    campaignId,
    tensionDelta,
    resultSummary,
  );

  // Update covert op record
  database
    .prepare(
      `UPDATE covert_operations
       SET status = ?,
           sortie_outcome = ?,
           detected = ?,
           result_summary = ?,
           war_declared = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      finalStatus,
      outcome,
      outcome !== "clean_success" ? 1 : 0,
      resultSummary,
      warDeclared ? 1 : 0,
      now,
      operationId,
    );

  const updatedOp = database
    .prepare(
      `SELECT id, campaign_id, source_country_id, target_country_id, target_hex_id, op_type, status,
              funds_cost, success_chance, attribution_risk, detected, result_summary, created_at, updated_at,
              assigned_formation_id, assigned_formation_name, resolution_mode, tactical_mission_ini,
              sortie_outcome, war_declared
       FROM covert_operations WHERE id = ?`,
    )
    .get(operationId) as
    | {
        id: string;
        campaign_id: string;
        source_country_id: string;
        target_country_id: string;
        target_hex_id: string;
        op_type: CovertOpType;
        status: "planned" | "success" | "failed" | "compromised";
        funds_cost: number;
        success_chance: number;
        attribution_risk: number;
        detected: number;
        result_summary: string;
        created_at: string;
        updated_at: string;
        assigned_formation_id?: string | null;
        assigned_formation_name?: string | null;
        resolution_mode?: "tactical_mission" | "auto_resolve" | null;
        tactical_mission_ini?: string | null;
        sortie_outcome?: CovertSortieOutcome | null;
        war_declared?: number | null;
      }
    | undefined;

  if (!updatedOp) {
    throw new Error(`Covert operation ${operationId} not found after update`);
  }

  return {
    ok: true,
    operation: {
      id: updatedOp.id,
      campaignId: updatedOp.campaign_id,
      sourceCountryId: updatedOp.source_country_id,
      targetCountryId: updatedOp.target_country_id,
      targetHexId: updatedOp.target_hex_id,
      opType: updatedOp.op_type,
      status: updatedOp.status,
      fundsCost: updatedOp.funds_cost,
      successChance: updatedOp.success_chance,
      attributionRisk: updatedOp.attribution_risk,
      detected: Boolean(updatedOp.detected),
      resultSummary: updatedOp.result_summary,
      createdAt: updatedOp.created_at,
      updatedAt: updatedOp.updated_at,
      assignedFormationId: updatedOp.assigned_formation_id ?? undefined,
      assignedFormationName: updatedOp.assigned_formation_name ?? undefined,
      resolutionMode:
        (updatedOp.resolution_mode as
          "auto_resolve" | "tactical_mission" | null) ?? undefined,
      tacticalMissionIni: updatedOp.tactical_mission_ini ?? undefined,
      sortieOutcome:
        (updatedOp.sortie_outcome as CovertOperationRecord["sortieOutcome"]) ??
        undefined,
      warDeclared: Boolean(updatedOp.war_declared),
    },
    warDeclared,
    message: resultSummary,
    tensionState,
  };
}

/**
 * Launches a covert operation.
 * If resolutionMode is 'tactical_mission', generates a Sea Power INI mission and returns it.
 * If resolutionMode is 'auto_resolve', executes the odds-based roll immediately.
 */
export function executeCovertOperation(
  database: CampaignDatabase,
  campaignId: string,
  input: {
    sourceCountryId: string;
    targetCountryId: string;
    targetHexId: string;
    opType: CovertOpType;
    assignedFormationId?: string | undefined;
    resolutionMode?: "auto_resolve" | "tactical_mission" | undefined;
  },
  randomRollSuccess = Math.random(),
  randomRollDetection = Math.random(),
): {
  ok: boolean;
  operation: CovertOperationRecord;
  success: boolean;
  detected: boolean;
  message: string;
  tacticalMissionIni?: string | undefined;
  warDeclared?: boolean | undefined;
} {
  const listing = COVERT_OPS_CATALOG.find((l) => l.opType === input.opType);
  if (!listing) {
    throw new Error(`Unknown covert op type: ${input.opType}`);
  }

  // Check funds
  const economy = database
    .prepare("SELECT funds FROM campaign_economy WHERE campaign_id = ?")
    .get(campaignId) as { funds: number } | undefined;

  if (!economy || economy.funds < listing.fundsCost) {
    throw new Error(
      `Insufficient funds to launch covert operation. Required: $${listing.fundsCost}, Available: $${economy?.funds ?? 0}`,
    );
  }

  let assignedFormationName: string | undefined = undefined;
  let assignedFormationUnitType: string | undefined = undefined;

  // Validate assigned formation if provided or required
  if (input.assignedFormationId) {
    const formationRow = database
      .prepare(
        `SELECT id, name, unit_type, action_points, strength, status, country_id, metadata_json
         FROM campaign_formations
         WHERE id = ? AND campaign_id = ?`,
      )
      .get(input.assignedFormationId, campaignId) as
      | {
          id: string;
          name: string;
          unit_type: string;
          action_points: number;
          strength: number;
          status: string;
          country_id: string;
          metadata_json: string | null;
        }
      | undefined;

    if (!formationRow) {
      throw new Error(
        `Assigned formation ${input.assignedFormationId} not found`,
      );
    }
    if (formationRow.country_id !== input.sourceCountryId) {
      throw new Error(
        `Cannot assign foreign formation ${formationRow.name} to covert operation`,
      );
    }

    let comp:
      | {
          totalSubmarines?: number;
          totalVessels?: number;
          totalAircraft?: number;
          totalVehicles?: number;
        }
      | undefined = undefined;
    if (formationRow.metadata_json) {
      try {
        comp = JSON.parse(formationRow.metadata_json)
          .composition as typeof comp;
      } catch {
        // ignore
      }
    }

    const check = isFormationEligibleForCovertOp(
      {
        id: formationRow.id,
        name: formationRow.name,
        unitType: formationRow.unit_type,
        actionPoints: formationRow.action_points,
        strength: formationRow.strength,
        status: formationRow.status,
        composition: comp,
      },
      input.opType,
    );

    if (!check.eligible) {
      throw new Error(
        `Formation ${formationRow.name} is ineligible: ${check.reason}`,
      );
    }

    assignedFormationName = formationRow.name;
    assignedFormationUnitType = formationRow.unit_type;

    // Deduct 1 Action Point
    database
      .prepare(
        `UPDATE campaign_formations
         SET action_points = MAX(0, action_points - 1),
             updated_at = ?
         WHERE id = ? AND campaign_id = ?`,
      )
      .run(new Date().toISOString(), formationRow.id, campaignId);
  }

  const opId = generateUUID();
  const now = new Date().toISOString();
  const resolutionMode = input.resolutionMode ?? "auto_resolve";

  // Deduct funds
  database
    .prepare(
      "UPDATE campaign_economy SET funds = funds - ?, updated_at = ? WHERE campaign_id = ?",
    )
    .run(listing.fundsCost, now, campaignId);

  // If Tactical Mission mode: generate Sea Power .ini mission
  if (resolutionMode === "tactical_mission") {
    const tacticalMissionIni = generateCovertTacticalMissionIni({
      sourceCountryId: input.sourceCountryId,
      targetCountryId: input.targetCountryId,
      targetHexId: input.targetHexId,
      opType: input.opType,
      assignedFormationName:
        assignedFormationName ?? "Clandestine Reconnaissance Group",
      assignedFormationUnitType,
    });

    database
      .prepare(
        `INSERT INTO covert_operations (
          id, campaign_id, source_country_id, target_country_id, target_hex_id, op_type, status,
          funds_cost, success_chance, attribution_risk, detected, result_summary, created_at, updated_at,
          assigned_formation_id, assigned_formation_name, resolution_mode, tactical_mission_ini, sortie_outcome, war_declared
        ) VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, 0, ?, ?, ?, ?, ?, 'tactical_mission', ?, 'pending', 0)`,
      )
      .run(
        opId,
        campaignId,
        input.sourceCountryId,
        input.targetCountryId,
        input.targetHexId,
        input.opType,
        listing.fundsCost,
        listing.baseSuccessRate,
        listing.baseAttributionRisk,
        "Tactical mission scenario generated for Sea Power. Awaiting sortie execution and aftermath debrief.",
        now,
        now,
        input.assignedFormationId ?? null,
        assignedFormationName ?? null,
        tacticalMissionIni,
      );

    return {
      ok: true,
      operation: {
        id: opId,
        campaignId,
        sourceCountryId: input.sourceCountryId,
        targetCountryId: input.targetCountryId,
        targetHexId: input.targetHexId,
        opType: input.opType,
        status: "planned",
        fundsCost: listing.fundsCost,
        successChance: listing.baseSuccessRate,
        attributionRisk: listing.baseAttributionRisk,
        detected: false,
        resultSummary:
          "Tactical mission scenario generated for Sea Power. Awaiting sortie execution and aftermath debrief.",
        createdAt: now,
        updatedAt: now,
        assignedFormationId: input.assignedFormationId,
        assignedFormationName,
        resolutionMode: "tactical_mission",
        tacticalMissionIni,
        sortieOutcome: "pending",
        warDeclared: false,
      },
      success: true,
      detected: false,
      message:
        "Tactical mission scenario successfully generated. Ready for deployment in Sea Power.",
      tacticalMissionIni,
      warDeclared: false,
    };
  }

  // AUTO-RESOLVE MODE
  const success = randomRollSuccess <= listing.baseSuccessRate;
  const detected = randomRollDetection <= listing.baseAttributionRisk;

  let outcome: "clean_success" | "compromised_evaded" | "destroyed_nearshore" =
    "clean_success";
  if (success && !detected) {
    outcome = "clean_success";
  } else if (success && detected) {
    outcome = "compromised_evaded";
  } else if (!success && !detected) {
    outcome = "compromised_evaded";
  } else {
    // Failure with detection: 50% chance of evasion with damage, 50% catastrophic nearshore destruction (War!)
    outcome =
      Math.random() < 0.5 ? "destroyed_nearshore" : "compromised_evaded";
  }

  // Create base record
  database
    .prepare(
      `INSERT INTO covert_operations (
        id, campaign_id, source_country_id, target_country_id, target_hex_id, op_type, status,
        funds_cost, success_chance, attribution_risk, detected, result_summary, created_at, updated_at,
        assigned_formation_id, assigned_formation_name, resolution_mode, sortie_outcome, war_declared
      ) VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, '', ?, ?, ?, ?, 'auto_resolve', ?, 0)`,
    )
    .run(
      opId,
      campaignId,
      input.sourceCountryId,
      input.targetCountryId,
      input.targetHexId,
      input.opType,
      listing.fundsCost,
      listing.baseSuccessRate,
      listing.baseAttributionRisk,
      detected ? 1 : 0,
      now,
      now,
      input.assignedFormationId ?? null,
      assignedFormationName ?? null,
      outcome,
    );

  // Resolve outcome
  const resolved = resolveTacticalCovertSortie(
    database,
    campaignId,
    opId,
    outcome,
  );

  return {
    ok: true,
    operation: resolved.operation,
    success: resolved.operation.status === "success",
    detected: resolved.operation.detected,
    message: resolved.message,
    warDeclared: resolved.warDeclared,
  };
}

export function getCovertOperations(
  database: CampaignDatabase,
  campaignId: string,
): CovertOperationRecord[] {
  const rows = database
    .prepare(
      `SELECT id, campaign_id, source_country_id, target_country_id, target_hex_id, op_type, status,
              funds_cost, success_chance, attribution_risk, detected, result_summary, created_at, updated_at,
              assigned_formation_id, assigned_formation_name, resolution_mode, tactical_mission_ini,
              sortie_outcome, war_declared
       FROM covert_operations
       WHERE campaign_id = ?
       ORDER BY created_at DESC`,
    )
    .all(campaignId) as Array<{
    id: string;
    campaign_id: string;
    source_country_id: string;
    target_country_id: string;
    target_hex_id: string;
    op_type: CovertOpType;
    status: "planned" | "success" | "failed" | "compromised";
    funds_cost: number;
    success_chance: number;
    attribution_risk: number;
    detected: number;
    result_summary: string;
    created_at: string;
    updated_at: string;
    assigned_formation_id?: string | null;
    assigned_formation_name?: string | null;
    resolution_mode?: string | null;
    tactical_mission_ini?: string | null;
    sortie_outcome?: string | null;
    war_declared?: number | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    sourceCountryId: r.source_country_id,
    targetCountryId: r.target_country_id,
    targetHexId: r.target_hex_id,
    opType: r.op_type,
    status: r.status,
    fundsCost: r.funds_cost,
    successChance: r.success_chance,
    attributionRisk: r.attribution_risk,
    detected: Boolean(r.detected),
    resultSummary: r.result_summary,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    assignedFormationId: r.assigned_formation_id ?? undefined,
    assignedFormationName: r.assigned_formation_name ?? undefined,
    resolutionMode:
      (r.resolution_mode as "auto_resolve" | "tactical_mission") ??
      "auto_resolve",
    tacticalMissionIni: r.tactical_mission_ini ?? undefined,
    sortieOutcome:
      (r.sortie_outcome as
        | "pending"
        | "clean_success"
        | "compromised_evaded"
        | "destroyed_nearshore") ?? undefined,
    warDeclared: Boolean(r.war_declared),
  }));
}
