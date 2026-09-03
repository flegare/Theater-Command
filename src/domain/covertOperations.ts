import type { CampaignDatabase } from "../infrastructure/database.js";

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

export type CovertOpCatalogListing = {
  opType: CovertOpType;
  title: string;
  summary: string;
  fundsCost: number;
  baseSuccessRate: number; // 0.0 to 1.0
  baseAttributionRisk: number; // 0.0 to 1.0
  tensionImpact: number;
};

export const COVERT_OPS_CATALOG: CovertOpCatalogListing[] = [
  {
    opType: "SABOTAGE_STOCKPILE_DEPOT",
    title: "💥 Sabotage Strategic Stockpile Depot",
    summary:
      "Infiltrate enemy naval or air base to detonate 50% of stored strategic fuel barrels and missile reserves.",
    fundsCost: 450,
    baseSuccessRate: 0.75,
    baseAttributionRisk: 0.25,
    tensionImpact: 15,
  },
  {
    opType: "DISABLE_RADAR_AND_AIR_DEFENSE",
    title: "📡 Blind Early-Warning Radar Array",
    summary:
      "Sabotage generator lines and antenna feeds, blinding regional radar coverage for 2 strategic turns.",
    fundsCost: 350,
    baseSuccessRate: 0.8,
    baseAttributionRisk: 0.2,
    tensionImpact: 10,
  },
  {
    opType: "CLANDESTINE_SEA_MINING",
    title: "⚓ Clandestine Sea-Lane Mining",
    summary:
      "Deploy unmarked rising-mine tethered fields in maritime chokepoints, inflicting heavy attrition on passing flotillas.",
    fundsCost: 500,
    baseSuccessRate: 0.7,
    baseAttributionRisk: 0.3,
    tensionImpact: 20,
  },
  {
    opType: "INDUSTRIAL_DISRUPTION",
    title: "⚙️ Industrial Subversion & Strikes",
    summary:
      "Subvert shipyard tooling and foment dockworker labor unrest, halving sector industrial production output.",
    fundsCost: 300,
    baseSuccessRate: 0.85,
    baseAttributionRisk: 0.15,
    tensionImpact: 10,
  },
  {
    opType: "PROXY_SUBMARINE_INCURSION",
    title: "🐬 Unmarked Submarine Incursion",
    summary:
      "Stage an unattributed underwater reconnaissance run into sovereign fjords or archipelagos to gather SIGINT and provoke defensive scrambling.",
    fundsCost: 600,
    baseSuccessRate: 0.65,
    baseAttributionRisk: 0.35,
    tensionImpact: 25,
  },
  {
    opType: "SPECIAL_FORCES_RAID",
    title: "🗡️ Commando Special Forces Infiltration",
    summary:
      "Insert amphibious SBS / Spetsnaz reconnaissance commandos to gather high-fidelity intelligence on stationed formations.",
    fundsCost: 400,
    baseSuccessRate: 0.75,
    baseAttributionRisk: 0.25,
    tensionImpact: 15,
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

export function executeCovertOperation(
  database: CampaignDatabase,
  campaignId: string,
  input: {
    sourceCountryId: string;
    targetCountryId: string;
    targetHexId: string;
    opType: CovertOpType;
  },
  randomRollSuccess = Math.random(),
  randomRollDetection = Math.random(),
): {
  ok: boolean;
  operation: CovertOperationRecord;
  success: boolean;
  detected: boolean;
  message: string;
} {
  const listing = COVERT_OPS_CATALOG.find((l) => l.opType === input.opType);
  if (!listing) {
    throw new Error(`Unknown covert op type: ${input.opType}`);
  }

  // Verify and deduct funds from economy
  const economy = database
    .prepare("SELECT funds FROM campaign_economy WHERE campaign_id = ?")
    .get(campaignId) as { funds: number } | undefined;

  if (!economy || economy.funds < listing.fundsCost) {
    throw new Error(
      `Insufficient funds to launch covert operation. Required: $${listing.fundsCost}, Available: $${economy?.funds ?? 0}`,
    );
  }

  const opId = generateUUID();
  const now = new Date().toISOString();
  const success = randomRollSuccess <= listing.baseSuccessRate;
  const detected = randomRollDetection <= listing.baseAttributionRisk;

  let resultSummary = "";
  let finalStatus: CovertOperationRecord["status"] = "failed";

  if (success) {
    finalStatus = detected ? "compromised" : "success";
    resultSummary = `Operation succeeded! Target ${input.targetHexId} suffered severe operational disruption.`;

    // Apply physical effects to sector
    if (input.opType === "SABOTAGE_STOCKPILE_DEPOT") {
      database
        .prepare(
          `UPDATE campaign_hex_cells
           SET depot_fuel = MAX(0, CAST(depot_fuel * 0.5 AS INTEGER)),
               depot_missiles = MAX(0, CAST(depot_missiles * 0.5 AS INTEGER)),
               depot_torpedoes = MAX(0, CAST(depot_torpedoes * 0.5 AS INTEGER)),
               depot_shells = MAX(0, CAST(depot_shells * 0.5 AS INTEGER)),
               updated_at = ?
           WHERE campaign_id = ? AND hex_id = ?`,
        )
        .run(now, campaignId, input.targetHexId);
      resultSummary +=
        " Strategic fuel barrels and missile reserves detonated!";
    }
  } else {
    finalStatus = detected ? "compromised" : "failed";
    resultSummary = `Operation failed to breach security perimeter at sector ${input.targetHexId}.`;
  }

  // If detected, trigger severe diplomatic fallout
  if (detected) {
    resultSummary += ` COMPROMISED: Operatives linked to ${input.sourceCountryId.toUpperCase()}! Significant diplomatic fallout.`;

    // Lower bilateral relations and void active ceasefires
    try {
      database
        .prepare(
          `INSERT OR REPLACE INTO country_relations (campaign_id, country_id, related_country_id, stance)
           VALUES (?, ?, ?, 'hostile')`,
        )
        .run(campaignId, input.targetCountryId, input.sourceCountryId);
    } catch {
      // Ignore if country records not populated in foreign key table
    }

    database
      .prepare(
        `DELETE FROM diplomatic_treaties
         WHERE campaign_id = ?
           AND ((party_a_country_id = ? AND party_b_country_id = ?) OR (party_a_country_id = ? AND party_b_country_id = ?))`,
      )
      .run(
        campaignId,
        input.sourceCountryId,
        input.targetCountryId,
        input.targetCountryId,
        input.sourceCountryId,
      );

    // Escalate tension by +20
    adjustCampaignTension(
      database,
      campaignId,
      20,
      `Covert sabotage by ${input.sourceCountryId} detected in ${input.targetHexId}!`,
    );
  } else {
    // Normal tension increase
    adjustCampaignTension(
      database,
      campaignId,
      listing.tensionImpact,
      `Unidentified clandestine sabotage incident reported in ${input.targetHexId}.`,
    );
  }

  database.transaction(() => {
    // Deduct funds
    database
      .prepare(
        "UPDATE campaign_economy SET funds = funds - ?, updated_at = ? WHERE campaign_id = ?",
      )
      .run(listing.fundsCost, now, campaignId);

    // Record covert op
    database
      .prepare(
        `INSERT INTO covert_operations (
          id, campaign_id, source_country_id, target_country_id, target_hex_id, op_type, status,
          funds_cost, success_chance, attribution_risk, detected, result_summary, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        opId,
        campaignId,
        input.sourceCountryId,
        input.targetCountryId,
        input.targetHexId,
        input.opType,
        finalStatus,
        listing.fundsCost,
        listing.baseSuccessRate,
        listing.baseAttributionRisk,
        detected ? 1 : 0,
        resultSummary,
        now,
        now,
      );
  })();

  const operationRecord: CovertOperationRecord = {
    id: opId,
    campaignId,
    sourceCountryId: input.sourceCountryId,
    targetCountryId: input.targetCountryId,
    targetHexId: input.targetHexId,
    opType: input.opType,
    status: finalStatus,
    fundsCost: listing.fundsCost,
    successChance: listing.baseSuccessRate,
    attributionRisk: listing.baseAttributionRisk,
    detected,
    resultSummary,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ok: true,
    operation: operationRecord,
    success,
    detected,
    message: resultSummary,
  };
}

export function getCovertOperations(
  database: CampaignDatabase,
  campaignId: string,
): CovertOperationRecord[] {
  const rows = database
    .prepare(
      `SELECT id, campaign_id, source_country_id, target_country_id, target_hex_id, op_type, status,
              funds_cost, success_chance, attribution_risk, detected, result_summary, created_at, updated_at
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
  }));
}
