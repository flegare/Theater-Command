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
import { getCountryPersona } from "./countryPersonas.js";

export type AiOrderResult = {
  formationId: string;
  formationName: string;
  countryId: string;
  action: "move" | "rtb" | "defend" | "assault" | "patrol";
  targetHexId: string;
  summary: string;
};

export type AutonomousCountryTurnAction = {
  countryId: string;
  countryName: string;
  stance: string;
  turnNumber: number;
  ordersSummary: string;
  actions: {
    movements: Array<{
      formationId: string;
      formationName: string;
      action: "move" | "rtb" | "defend" | "assault" | "patrol";
      targetHexId: string;
      description: string;
    }>;
    diplomacy: Array<{
      action: "cable_sent" | "proposal_issued" | "stance_adjusted" | "demarche";
      targetCountryId: string;
      summary: string;
    }>;
    covertOps: Array<{
      opType: string;
      targetHexId: string;
      outcome: "planned" | "executed" | "aborted";
      description: string;
    }>;
    research: {
      activeProject: string;
      doctrineFocus: string;
      progressPct: number;
    };
  };
};

export type CampaignAiTurnLog = {
  id: string;
  campaignId: string;
  turnNumber: number;
  countryId: string;
  countryName: string;
  stance: string;
  ordersSummary: string;
  actions: AutonomousCountryTurnAction["actions"];
  createdAt: string;
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

const NATIONAL_RESEARCH_DOCTRINES: Record<
  string,
  { activeProject: string; doctrineFocus: string; progressRate: number }
> = {
  "soviet-union": {
    activeProject:
      "Project 949A (Oscar-II) & P-700 Granit Anti-Ship Missile Saturation",
    doctrineFocus: "Massed Long-Range Standoff Anti-Carrier Strike",
    progressRate: 12,
  },
  "united-states": {
    activeProject:
      "Aegis Weapon System Baseline-2 (AN/SPY-1B Radar Integration)",
    doctrineFocus:
      "Forward Maritime Strategy & Carrier Battle Group Air Defense Screen",
    progressRate: 14,
  },
  "united-kingdom": {
    activeProject:
      "Sea Harrier FRS.2 / AIM-120 Advanced Interceptor Integration",
    doctrineFocus: "GIUK Gap ASW Barrier & V/STOL Fleet Air Defense",
    progressRate: 10,
  },
  sweden: {
    activeProject: "JA-37 Viggen PS-46/A Look-Down/Shoot-Down Radar & RBS-15F",
    doctrineFocus:
      "Dispersed Bas 90 Road-Base Combat Aviation & Coastal Anti-Invasion",
    progressRate: 11,
  },
  finland: {
    activeProject:
      "Sisu Pasi XA-180 APC Procurement & Coastal Artillery Hardening",
    doctrineFocus:
      "Territorial Deep Guerrilla Defense & Arctic Bastion Vigilance",
    progressRate: 9,
  },
  "west-germany": {
    activeProject:
      "Tornado IDS MW-1 Submunition & Type 206A Submarine Low-Noise Refit",
    doctrineFocus: "Baltic Chokepoint Air Interdiction & Shallow-Water ASW",
    progressRate: 12,
  },
  denmark: {
    activeProject:
      "Standard Flex 300 Modular Hull Concept & Harpoon Coastal Batteries",
    doctrineFocus: "Danish Straits Access Denial & Shallow-Water Minelaying",
    progressRate: 8,
  },
};

/**
 * Autonomous multi-nation turn processor:
 * For every sovereign nation not controlled by the human player, evaluates:
 * 1. Unit movement / RTB / combat sorties
 * 2. Foreign policy demarches, alliance cables, and treaty proposals
 * 3. Clandestine / Covert operations (SIGINT, recon overflights, sea mining)
 * 4. National R&D technology programs and doctrine progression
 *
 * Persists comprehensive logs in `campaign_ai_turn_logs`.
 */
export function processAutonomousCountryTurns(
  database: CampaignDatabase,
  campaignId: string,
  playerCountryId: string,
): {
  logs: AutonomousCountryTurnAction[];
  orders: AiOrderResult[];
} {
  const now = new Date().toISOString();
  const tension = getCampaignTension(database, campaignId);

  // 1. Determine current turn number
  let currentTurn = 1;
  try {
    const turnCountRow = database
      .prepare(
        `SELECT COUNT(*) as count FROM events WHERE campaign_id = ? AND kind = 'campaign_day_advanced'`,
      )
      .get(campaignId) as { count: number } | undefined;
    currentTurn = (turnCountRow?.count ?? 0) + 1;
  } catch {
    currentTurn = 1;
  }

  // 2. Discover all non-player countries
  const countryIds = new Set<string>();
  try {
    const formationCountries = database
      .prepare(
        `SELECT DISTINCT country_id FROM campaign_formations WHERE campaign_id = ? AND country_id != ?`,
      )
      .all(campaignId, playerCountryId) as Array<{ country_id: string }>;
    for (const c of formationCountries) {
      if (c.country_id) countryIds.add(c.country_id);
    }

    const catalogCountries = database
      .prepare(`SELECT id FROM countries WHERE campaign_id = ? AND id != ?`)
      .all(campaignId, playerCountryId) as Array<{ id: string }>;
    for (const c of catalogCountries) {
      if (c.id) countryIds.add(c.id);
    }
  } catch {
    // Fallback default nations
  }

  if (countryIds.size === 0) {
    countryIds.add("soviet-union");
    countryIds.add("sweden");
    countryIds.add("finland");
    countryIds.add("united-states");
    countryIds.add("united-kingdom");
    countryIds.add("west-germany");
    countryIds.add("denmark");
  }

  // 3. Process tactical unit orders
  const allOrders = processAiStrategicTurns(
    database,
    campaignId,
    playerCountryId,
  );

  // Group orders by country
  const ordersByCountry = new Map<string, AiOrderResult[]>();
  for (const ord of allOrders) {
    const list = ordersByCountry.get(ord.countryId) ?? [];
    list.push(ord);
    ordersByCountry.set(ord.countryId, list);
  }

  const logs: AutonomousCountryTurnAction[] = [];

  for (const countryId of countryIds) {
    const persona = getCountryPersona(countryId);
    const countryOrders = ordersByCountry.get(countryId) ?? [];

    // Derive stance
    let stance = "neutral";
    if (persona.bloc === "warsaw-pact") stance = "hostile";
    else if (persona.bloc === "nato") stance = "allied";

    // Build movements list
    const movements: AutonomousCountryTurnAction["actions"]["movements"] = [];
    for (const ord of countryOrders) {
      movements.push({
        formationId: ord.formationId,
        formationName: ord.formationName,
        action: ord.action,
        targetHexId: ord.targetHexId,
        description: ord.summary,
      });
    }

    // Generate Diplomatic Actions based on temperament and tension
    const diplomacy: AutonomousCountryTurnAction["actions"]["diplomacy"] = [];
    if (countryId === "soviet-union") {
      if (tension.defconLevel <= 2) {
        diplomacy.push({
          action: "demarche",
          targetCountryId: playerCountryId,
          summary:
            "STAVKA issues emergency diplomatic demarche demanding immediate cessation of NATO naval maneuvers north of the Arctic Circle.",
        });
      } else if (tension.defconLevel === 3) {
        diplomacy.push({
          action: "cable_sent",
          targetCountryId: playerCountryId,
          summary:
            "Soviet Foreign Ministry delivers formal protest regarding heightened reconnaissance activity along Kola airspace perimeter.",
        });
      } else {
        diplomacy.push({
          action: "cable_sent",
          targetCountryId: playerCountryId,
          summary:
            "Moscow reaffirms adherence to bilateral naval incident prevention protocols (INCSEA).",
        });
      }
    } else if (countryId === "sweden") {
      diplomacy.push({
        action: "cable_sent",
        targetCountryId: playerCountryId,
        summary:
          "Royal Swedish Foreign Ministry reaffirms armed neutrality; warns all belligerents that sovereign Baltic airspace is strictly enforced.",
      });
    } else if (countryId === "finland") {
      diplomacy.push({
        action: "cable_sent",
        targetCountryId: playerCountryId,
        summary:
          "Helsinki defense staff confirms territorial vigilance along the eastern border and neutrality in regional maritime confrontations.",
      });
    } else if (countryId === "united-states") {
      diplomacy.push({
        action: "cable_sent",
        targetCountryId: playerCountryId,
        summary:
          "US European Command signals carrier battle group readiness; satellite recon telemetry and SOSUS tracks shared with NATO allies.",
      });
    } else if (countryId === "united-kingdom") {
      diplomacy.push({
        action: "cable_sent",
        targetCountryId: playerCountryId,
        summary:
          "Whitehall signals Royal Navy submarine flotilla forward positioning across the Iceland-Faeroes gap.",
      });
    } else if (countryId === "west-germany") {
      diplomacy.push({
        action: "cable_sent",
        targetCountryId: playerCountryId,
        summary:
          "Federal Ministry of Defence orders heightened surveillance of Baltic approaches and Fehmarn Belt transit corridors.",
      });
    } else if (countryId === "denmark") {
      diplomacy.push({
        action: "cable_sent",
        targetCountryId: playerCountryId,
        summary:
          "Danish Defense Command reports continuous coastal radar watch over Great Belt and Kattegat straits.",
      });
    }

    // Generate Covert Operations based on tension
    const covertOps: AutonomousCountryTurnAction["actions"]["covertOps"] = [];
    if (tension.defconLevel <= 3) {
      if (countryId === "soviet-union") {
        covertOps.push({
          opType: "SIGINT_INTERCEPTION_WIRETAP",
          targetHexId: "hex-nor-bodo",
          outcome: "executed",
          description:
            "KGB Directorate S establishes passive electromagnetic intercept sweep over Norwegian joint military communications.",
        });
        if (tension.defconLevel <= 2) {
          covertOps.push({
            opType: "COVERT_RECON_INFILTRATION",
            targetHexId: "hex-sea-norwegian",
            outcome: "executed",
            description:
              "GRU Spetsnaz mini-sub reconnaissance pass monitoring NATO ASW acoustic sensor cables.",
          });
        }
      } else if (
        countryId === "united-states" ||
        countryId === "united-kingdom"
      ) {
        covertOps.push({
          opType: "COVERT_RECON_INFILTRATION",
          targetHexId: "hex-sov-kola",
          outcome: "executed",
          description:
            "High-altitude KH-11 reconnaissance satellite pass confirms strategic bomber and submarine readiness status.",
        });
      }
    } else {
      covertOps.push({
        opType: "ROUTINE_COUNTER_INTELLIGENCE",
        targetHexId: "home_sector",
        outcome: "planned",
        description:
          "Standard counter-intelligence perimeter checks and COMSEC protocol rotation.",
      });
    }

    // Research Doctrine Progress
    const rConfig = NATIONAL_RESEARCH_DOCTRINES[countryId] ?? {
      activeProject: "Electronic Warfare & Radar Modernization",
      doctrineFocus: "Regional Deterrence & Electronic Support",
      progressRate: 10,
    };
    const progressPct = Math.min(
      100,
      ((currentTurn * rConfig.progressRate) % 100) + 10,
    );
    const research = {
      activeProject: rConfig.activeProject,
      doctrineFocus: rConfig.doctrineFocus,
      progressPct,
    };

    // Orders summary
    const ordersSummary = `${movements.length} formation order(s) issued; ${diplomacy.length} foreign cable(s) dispatched; R&D active on ${research.activeProject} (${research.progressPct}%).`;

    const logEntry: AutonomousCountryTurnAction = {
      countryId,
      countryName: persona.governingBody || countryId,
      stance,
      turnNumber: currentTurn,
      ordersSummary,
      actions: {
        movements,
        diplomacy,
        covertOps,
        research,
      },
    };

    logs.push(logEntry);

    // Save to campaign_ai_turn_logs table
    try {
      database
        .prepare(
          `INSERT OR REPLACE INTO campaign_ai_turn_logs (
            id, campaign_id, turn_number, country_id, country_name, stance, orders_summary, actions_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `${campaignId}:ai_turn:${currentTurn}:${countryId}`,
          campaignId,
          currentTurn,
          countryId,
          persona.governingBody || countryId,
          stance,
          ordersSummary,
          JSON.stringify(logEntry.actions),
          now,
        );
    } catch {
      // Table might not exist in isolated unit test scenarios
    }
  }

  return {
    logs,
    orders: allOrders,
  };
}

/**
 * Retrieves persisted autonomous AI turn logs for a campaign.
 */
export function getCampaignAiTurnLogs(
  database: CampaignDatabase,
  campaignId: string,
  turnNumber?: number,
): CampaignAiTurnLog[] {
  let query = `SELECT id, campaign_id, turn_number, country_id, country_name, stance, orders_summary, actions_json, created_at
               FROM campaign_ai_turn_logs
               WHERE campaign_id = ?`;
  const params: unknown[] = [campaignId];
  if (typeof turnNumber === "number") {
    query += ` AND turn_number = ?`;
    params.push(turnNumber);
  }
  query += ` ORDER BY turn_number DESC, country_id ASC`;

  try {
    const rows = database.prepare(query).all(...params) as Array<{
      id: string;
      campaign_id: string;
      turn_number: number;
      country_id: string;
      country_name: string;
      stance: string;
      orders_summary: string;
      actions_json: string;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      campaignId: r.campaign_id,
      turnNumber: r.turn_number,
      countryId: r.country_id,
      countryName: r.country_name,
      stance: r.stance,
      ordersSummary: r.orders_summary,
      actions: JSON.parse(r.actions_json),
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}
