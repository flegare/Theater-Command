import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CampaignDatabase } from "../infrastructure/database.js";
import {
  getAllBalticCoreHexCells,
  getHexCellDefinition,
  getHexNeighbors,
  type StrategicHexCell,
  type GovernorPolicy,
} from "../domain/hexGrid.js";
import { getCountryPersona } from "../domain/countryPersonas.js";
import {
  FORMATION_ARCHETYPES,
  canFormationTraverseTerrain,
  isWaterTerrain,
  calculateVeterancyRank,
  calculateSeaFatigueAndMorale,
  getFlotillaComposition,
  recalculateCompositionTotals,
  calculateCompositionCost,
  type CampaignFormation,
  type CampaignFormationStatus,
  type FormationUnitType,
  type FlotillaComposition,
  type ActiveMovementRoute,
} from "../domain/militaryFormations.js";
import {
  findFormationHexPath,
  type HexPathNode,
} from "../domain/hexPathfinding.js";
import { INVESTMENT_TIERS } from "../domain/hexInvestments.js";
import {
  getCampaignTension,
  adjustCampaignTension,
  calculateDefcon,
} from "../domain/covertOperations.js";
import { processAiStrategicTurns } from "../domain/aiStrategicCommander.js";
import {
  hasMilitaryTransitRights,
  hasBasingRights,
  recordDiplomaticCable,
  processAutonomousAiDiplomacy,
} from "../domain/diplomacy.js";

export type HexTurnEconomySummary = {
  grossFunds: number;
  grossProduction: number;
  grossFuel: number;
  upkeepFunds: number;
  fuelConsumption: number;
  netFundsDelta: number;
  netProductionDelta: number;
  netFuelDelta: number;
  controlledHexCount: number;
};

export type HexGridStateSnapshot = {
  hexCells: StrategicHexCell[];
  formations: CampaignFormation[];
  economy: {
    funds: number;
    productionPoints: number;
    fuelStockpile: number;
    projectedDailyFundsDelta: number;
    projectedDailyProductionDelta: number;
    projectedDailyFuelDelta: number;
  };
  turnSummary: HexTurnEconomySummary;
};

export function getStartingEconomyForCountry(countryId: string): {
  funds: number;
  productionPoints: number;
  fuelStockpile: number;
} {
  switch (countryId) {
    case "united-states":
      return { funds: 4500, productionPoints: 120, fuelStockpile: 450 };
    case "united-kingdom":
      return { funds: 3200, productionPoints: 90, fuelStockpile: 280 };
    case "west-germany":
      return { funds: 3500, productionPoints: 110, fuelStockpile: 220 };
    case "norway":
      return { funds: 1800, productionPoints: 90, fuelStockpile: 380 };
    case "denmark":
      return { funds: 1600, productionPoints: 60, fuelStockpile: 180 };
    case "soviet-union":
      return { funds: 4200, productionPoints: 140, fuelStockpile: 500 };
    case "east-germany":
      return { funds: 2200, productionPoints: 70, fuelStockpile: 200 };
    case "poland":
      return { funds: 2000, productionPoints: 65, fuelStockpile: 180 };
    case "sweden":
      return { funds: 2400, productionPoints: 60, fuelStockpile: 200 };
    case "finland":
      return { funds: 1600, productionPoints: 40, fuelStockpile: 150 };
    default:
      return { funds: 2000, productionPoints: 50, fuelStockpile: 200 };
  }
}

export function seedCampaignFormations(
  database: CampaignDatabase,
  campaignId: string,
): void {
  const now = new Date().toISOString();
  const insertFormation = database.prepare(`
    INSERT OR IGNORE INTO campaign_formations (
      id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const formationsToSeed: Array<{
    id: string;
    name: string;
    unitType: FormationUnitType;
    side: "blufor" | "opfor" | "neutral";
    countryId: string;
    hexId: string;
  }> = [
    // NATO / BLUFOR
    {
      id: `${campaignId}:form:nor-brigade-north`,
      name: "Brigade Nord Mechanized Division",
      unitType: "mechanized_infantry_division",
      side: "blufor",
      countryId: "norway",
      hexId: "hex-nor-tromso",
    },
    {
      id: `${campaignId}:form:nor-telemark-bg`,
      name: "Telemark Heavy Armored Battlegroup",
      unitType: "nato_armored_division",
      side: "blufor",
      countryId: "norway",
      hexId: "hex-nor-oslo",
    },
    {
      id: `${campaignId}:form:nor-oslo-sag`,
      name: "KNM Oslo Escort Squadron (SAG)",
      unitType: "surface_action_group",
      side: "blufor",
      countryId: "norway",
      hexId: "hex-nor-bergen",
    },
    {
      id: `${campaignId}:form:nor-sealift-1`,
      name: "1st Norwegian Strategic Sealift Flotilla",
      unitType: "sealift_transport_flotilla",
      side: "blufor",
      countryId: "norway",
      hexId: "hex-nor-bergen",
    },
    {
      id: `${campaignId}:form:nor-bodo-wing`,
      name: "331st / 332nd F-16 Fighter Wing",
      unitType: "tactical_fighter_wing",
      side: "blufor",
      countryId: "norway",
      hexId: "hex-nor-bodo",
    },
    {
      id: `${campaignId}:form:us-4th-mab`,
      name: "US 4th Marine Amphibious Brigade (M1 Abrams)",
      unitType: "nato_armored_division",
      side: "blufor",
      countryId: "united-states",
      hexId: "hex-gbr-scapa",
    },
    {
      id: `${campaignId}:form:us-csg-nimitz`,
      name: "Carrier Strike Group 8 (USS Nimitz)",
      unitType: "carrier_strike_group",
      side: "blufor",
      countryId: "united-states",
      hexId: "hex-sea-norwegian",
    },
    {
      id: `${campaignId}:form:den-jutland-div`,
      name: "Danish Jutland Armored Division",
      unitType: "nato_armored_division",
      side: "blufor",
      countryId: "denmark",
      hexId: "hex-den-jutland",
    },
    {
      id: `${campaignId}:form:ger-6th-panzer`,
      name: "German 6th Panzergrenadier Division",
      unitType: "nato_armored_division",
      side: "blufor",
      countryId: "west-germany",
      hexId: "hex-ger-kiel",
    },
    {
      id: `${campaignId}:form:ger-baltic-sag`,
      name: "German Flottille der Minenstreitkräfte & FAC",
      unitType: "surface_action_group",
      side: "blufor",
      countryId: "west-germany",
      hexId: "hex-ger-kiel",
    },

    // WARSAW PACT / OPFOR
    {
      id: `${campaignId}:form:sov-4th-guards-tank`,
      name: "Soviet 4th Guards Tank Division (T-80)",
      unitType: "pact_tank_division",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-kaliningrad",
    },
    {
      id: `${campaignId}:form:sov-baltic-sag`,
      name: "Red Banner Baltic Fleet Surface Action Group",
      unitType: "surface_action_group",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-kaliningrad",
    },
    {
      id: `${campaignId}:form:sov-67th-sub-sq`,
      name: "67th Submarine Division (Victor III)",
      unitType: "submarine_squadron",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-tallinn",
    },
    {
      id: `${campaignId}:form:sov-backfire-wing`,
      name: "57th Maritime Strike Aviation (Tu-22M Backfire)",
      unitType: "maritime_strike_squadron",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-kronstadt",
    },
    {
      id: `${campaignId}:form:pol-7th-coastal`,
      name: "Polish 7th Lusatian Coastal Defense Brigade",
      unitType: "marine_amphibious_brigade",
      side: "opfor",
      countryId: "poland",
      hexId: "hex-pol-gdansk",
    },
    {
      id: `${campaignId}:form:gdr-volksmarine`,
      name: "East German Volksmarine 1st Flotilla",
      unitType: "surface_action_group",
      side: "opfor",
      countryId: "east-germany",
      hexId: "hex-ger-rostock",
    },

    // RED BANNER NORTHERN FLEET & KOLA PENINSULA BASTION (Murmansk / Severomorsk / Polyarny)
    {
      id: `${campaignId}:form:sov-kirov-kug`,
      name: "Red Banner Northern Fleet KUG (Kirov)",
      unitType: "surface_action_group",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-kola",
    },
    {
      id: `${campaignId}:form:sov-kiev-csg`,
      name: "Northern Fleet Heavy Aircraft Cruiser Group (Kiev)",
      unitType: "carrier_strike_group",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-kola",
    },
    {
      id: `${campaignId}:form:sov-11th-sub-flotilla`,
      name: "11th Submarine Flotilla (Typhoon & Victor III)",
      unitType: "submarine_squadron",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-polyarny",
    },
    {
      id: `${campaignId}:form:sov-olenya-backfire`,
      name: "924th Maritime Strike Aviation (Tu-22M3 Backfire)",
      unitType: "maritime_strike_squadron",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-kola",
    },
    {
      id: `${campaignId}:form:sov-174th-interceptor-wing`,
      name: "174th Guards Fighter Aviation Regiment (MiG-31)",
      unitType: "tactical_fighter_wing",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-kola",
    },
    {
      id: `${campaignId}:form:sov-54th-motor-rifle`,
      name: "54th Motorized Rifle Division (Kola Defense)",
      unitType: "pact_tank_division",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-kola",
    },
    {
      id: `${campaignId}:form:sov-61st-naval-infantry`,
      name: "61st 'Kirkenes' Red Banner Naval Infantry Brigade",
      unitType: "marine_amphibious_brigade",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-kola",
    },
    {
      id: `${campaignId}:form:sov-kola-convoy`,
      name: "Kola Arctic Merchant Convoy Flotilla",
      unitType: "merchant_supply_convoy",
      side: "opfor",
      countryId: "soviet-union",
      hexId: "hex-sov-kola",
    },

    // NEUTRAL / UNALIGNED - ROYAL SWEDISH ARMED FORCES
    {
      id: `${campaignId}:form:swe-karlskrona-sag`,
      name: "Royal Swedish Coastal Fleet (Karlskrona)",
      unitType: "surface_action_group",
      side: "neutral",
      countryId: "sweden",
      hexId: "hex-swe-karlskrona",
    },
    {
      id: `${campaignId}:form:swe-1st-sub-flotilla`,
      name: "1st Swedish Submarine Flotilla (Karlskrona)",
      unitType: "submarine_squadron",
      side: "neutral",
      countryId: "sweden",
      hexId: "hex-swe-karlskrona",
    },
    {
      id: `${campaignId}:form:swe-stockholm-archipelago-sag`,
      name: "Muskö Archipelago Strike Flotilla",
      unitType: "surface_action_group",
      side: "neutral",
      countryId: "sweden",
      hexId: "hex-swe-stockholm",
    },
    {
      id: `${campaignId}:form:swe-1st-armored-div`,
      name: "Swedish 1st Armored Division (Strv 103 S-Tank)",
      unitType: "nato_armored_division",
      side: "neutral",
      countryId: "sweden",
      hexId: "hex-swe-stockholm",
    },
    {
      id: `${campaignId}:form:swe-f16-uppsala-wing`,
      name: "F 16 Uppsala Fighter Wing (JA-37 Viggen)",
      unitType: "tactical_fighter_wing",
      side: "neutral",
      countryId: "sweden",
      hexId: "hex-swe-stockholm",
    },
    {
      id: `${campaignId}:form:swe-gotland-brigade`,
      name: "Gotland Strategic Island Brigade (P 18)",
      unitType: "mechanized_infantry_division",
      side: "neutral",
      countryId: "sweden",
      hexId: "hex-bal-gotland",
    },
    {
      id: `${campaignId}:form:swe-f13g-viggen`,
      name: "F 13G Gotland QRA Flight (JA-37 Viggen)",
      unitType: "tactical_fighter_wing",
      side: "neutral",
      countryId: "sweden",
      hexId: "hex-bal-gotland",
    },
    {
      id: `${campaignId}:form:swe-f21-lulea-wing`,
      name: "F 21 Luleå Arctic Air Wing (JA-37 Viggen)",
      unitType: "tactical_fighter_wing",
      side: "neutral",
      countryId: "sweden",
      hexId: "hex-swe-lulea",
    },
    {
      id: `${campaignId}:form:swe-norrland-brigade`,
      name: "Norrland Arctic Jaeger Brigade (Boden)",
      unitType: "mechanized_infantry_division",
      side: "neutral",
      countryId: "sweden",
      hexId: "hex-swe-lulea",
    },

    // NEUTRAL / UNALIGNED - FINNISH DEFENSE FORCES (Puolustusvoimat)
    {
      id: `${campaignId}:form:fin-coastal-fleet`,
      name: "Finnish Coastal Fleet (Pansio / Upinniemi)",
      unitType: "surface_action_group",
      side: "neutral",
      countryId: "finland",
      hexId: "hex-fin-helsinki",
    },
    {
      id: `${campaignId}:form:fin-panssariprikaati`,
      name: "Panssariprikaati Armored Brigade (Parola)",
      unitType: "mechanized_infantry_division",
      side: "neutral",
      countryId: "finland",
      hexId: "hex-fin-helsinki",
    },
    {
      id: `${campaignId}:form:fin-havllv31-mig`,
      name: "HavLLv 31 Karelian Air Wing (MiG-21bis)",
      unitType: "tactical_fighter_wing",
      side: "neutral",
      countryId: "finland",
      hexId: "hex-fin-helsinki",
    },
    {
      id: `${campaignId}:form:fin-lapland-jaeger`,
      name: "Lapland Jaeger Brigade (Jääkäriprikaati Sodankylä)",
      unitType: "mechanized_infantry_division",
      side: "neutral",
      countryId: "finland",
      hexId: "hex-fin-lapland",
    },
    {
      id: `${campaignId}:form:fin-havllv11-draken`,
      name: "HavLLv 11 Lapland Air Wing (Saab 35 Draken)",
      unitType: "tactical_fighter_wing",
      side: "neutral",
      countryId: "finland",
      hexId: "hex-fin-lapland",
    },
  ];

  database.transaction(() => {
    for (const f of formationsToSeed) {
      const arch = FORMATION_ARCHETYPES[f.unitType];
      insertFormation.run(
        f.id,
        campaignId,
        f.name,
        f.unitType,
        f.side,
        f.countryId,
        f.hexId,
        arch?.defaultStrength ?? 100,
        arch?.maxActionPoints ?? 1,
        arch?.maxActionPoints ?? 1,
        "ready",
        JSON.stringify({}),
        now,
        now,
      );
    }
  })();
}

export function isFriendlyPortOrBase(
  cell: StrategicHexCell,
  side: string,
  countryId?: string,
): boolean {
  const hasFacility =
    cell.facilities.includes("naval_base") ||
    cell.facilities.includes("air_base") ||
    cell.facilities.includes("shipyard") ||
    cell.facilities.includes("refinery") ||
    (cell.childSites &&
      cell.childSites.some(
        (cs) =>
          cs.kind === "naval_base" ||
          cs.kind === "air_base" ||
          cs.kind === "world_port" ||
          cs.kind === "fuel_terminal",
      ));

  const isFriendlySide =
    cell.ownership.side === side ||
    (countryId !== undefined && cell.ownership.countryId === countryId);
  return Boolean(hasFacility && isFriendlySide);
}

export function hydrateCampaignFormation(
  row: {
    id: string;
    campaignId?: string;
    campaign_id?: string;
    name: string;
    unit_type: FormationUnitType;
    side: "blufor" | "opfor" | "neutral" | string;
    country_id: string;
    hex_id: string;
    strength: number;
    action_points: number;
    max_action_points: number;
    embarked_on_id?: string | null;
    status: string;
  },
  campaignId: string,
  metadata: Record<string, unknown>,
): CampaignFormation {
  const normalizedSide = (row.side === "unaligned" ? "neutral" : row.side) as
    "blufor" | "opfor" | "neutral";
  const composition =
    (metadata.composition as FlotillaComposition | undefined) ??
    getFlotillaComposition(row.unit_type, row.country_id, normalizedSide);
  const activeRoute = metadata.activeRoute as ActiveMovementRoute | undefined;

  const fuelCurrent =
    typeof metadata.fuelCurrent === "number" ? metadata.fuelCurrent : 100;
  const fuelMax = typeof metadata.fuelMax === "number" ? metadata.fuelMax : 100;
  const ammoLevel =
    typeof metadata.ammoLevel === "number" ? metadata.ammoLevel : 100;
  const morale = typeof metadata.morale === "number" ? metadata.morale : 100;
  const experience =
    typeof metadata.experience === "number"
      ? metadata.experience
      : row.country_id === "united-states" || row.country_id === "soviet-union"
        ? 65
        : 40;
  const veterancyRank = calculateVeterancyRank(experience);
  const consecutiveTurnsAtSea =
    typeof metadata.consecutiveTurnsAtSea === "number"
      ? metadata.consecutiveTurnsAtSea
      : 0;
  const embarkTurnsRemaining =
    typeof metadata.embarkTurnsRemaining === "number"
      ? metadata.embarkTurnsRemaining
      : undefined;
  const disembarkTurnsRemaining =
    typeof metadata.disembarkTurnsRemaining === "number"
      ? metadata.disembarkTurnsRemaining
      : undefined;
  const trainingTurnsRemaining =
    typeof metadata.trainingTurnsRemaining === "number"
      ? metadata.trainingTurnsRemaining
      : undefined;

  return {
    id: row.id,
    campaignId,
    name: row.name,
    unitType: row.unit_type,
    side: normalizedSide,
    countryId: row.country_id,
    hexId: row.hex_id,
    strength: row.strength,
    actionPoints: row.action_points,
    maxActionPoints: row.max_action_points,
    embarkedOnId: row.embarked_on_id ?? null,
    status: row.status as CampaignFormationStatus,
    metadata,
    archetype: FORMATION_ARCHETYPES[row.unit_type],
    composition,
    activeRoute,
    fuelCurrent,
    fuelMax,
    ammoLevel,
    morale,
    experience,
    veterancyRank,
    consecutiveTurnsAtSea,
    embarkTurnsRemaining,
    disembarkTurnsRemaining,
    trainingTurnsRemaining,
  };
}

export function getCampaignHexState(
  database: CampaignDatabase,
  campaignId: string,
  playerCountryIdParam?: string,
): HexGridStateSnapshot {
  // Determine player national perspective (e.g. "norway")
  const playerRow = database
    .prepare(
      `SELECT country_id FROM campaign_players WHERE campaign_id = ? LIMIT 1`,
    )
    .get(campaignId) as { country_id: string } | undefined;
  const playerCountryId =
    playerCountryIdParam ?? playerRow?.country_id ?? "norway";

  // 1. Get campaign economy
  const economyRow = database
    .prepare(
      `SELECT funds, production_points, fuel_stockpile FROM campaign_economy WHERE campaign_id = ?`,
    )
    .get(campaignId) as
    | { funds: number; production_points: number; fuel_stockpile: number }
    | undefined;

  const funds = economyRow?.funds ?? 1500;
  const productionPoints = economyRow?.production_points ?? 50;
  const fuelStockpile = economyRow?.fuel_stockpile ?? 200;

  // 2. Get modified hex cells from database
  const hexOverrides = database
    .prepare(
      `SELECT hex_id, side, country_id, contested, damaged_base, improvements_json,
              capture_turns_counter, occupying_side, occupying_country_id,
              depot_fuel, depot_missiles, depot_torpedoes, depot_shells,
              depot_titanium, depot_iron, depot_uranium,
              governor_policy, governor_automated, investment_tier
       FROM campaign_hex_cells WHERE campaign_id = ?`,
    )
    .all(campaignId) as Array<{
    hex_id: string;
    side: "blufor" | "opfor" | "neutral";
    country_id: string;
    contested: number;
    damaged_base: number;
    improvements_json: string;
    capture_turns_counter?: number;
    occupying_side?: "blufor" | "opfor" | "neutral";
    occupying_country_id?: string;
    depot_fuel?: number;
    depot_missiles?: number;
    depot_torpedoes?: number;
    depot_shells?: number;
    depot_titanium?: number;
    depot_iron?: number;
    depot_uranium?: number;
    governor_policy?: string;
    governor_automated?: number;
    investment_tier?: number;
  }>;

  const overrideMap = new Map(hexOverrides.map((row) => [row.hex_id, row]));

  // Build full Baltic + World cells
  const coreCells = getAllBalticCoreHexCells().map((cell) => {
    const override = overrideMap.get(cell.id);

    const investmentTier = override?.investment_tier ?? 0;
    const tierBonus = (INVESTMENT_TIERS[investmentTier] ??
      INVESTMENT_TIERS[0])!;
    const isContested = override?.contested === 1;

    // Adjusted yields based on investment tier (or 0 if contested)
    const yields = isContested
      ? { fundsRevenue: 0, productionPoints: 0, energyFuel: 0 }
      : {
          fundsRevenue: Math.round(
            cell.yields.fundsRevenue * tierBonus.fundsMultiplier,
          ),
          productionPoints:
            cell.yields.productionPoints + tierBonus.bonusProduction,
          energyFuel: cell.yields.energyFuel + tierBonus.bonusFuel,
        };

    return {
      ...cell,
      ownership: {
        side: override?.side ?? cell.ownership.side,
        countryId: override?.country_id ?? cell.ownership.countryId,
      },
      yields,
      status: isContested ? ("contested" as const) : ("controlled" as const),
      captureTurnsCounter: override?.capture_turns_counter ?? 0,
      occupyingSide: override?.occupying_side,
      occupyingCountryId: override?.occupying_country_id,
      depots: {
        fuelBarrels: override?.depot_fuel ?? 100,
        munitionsMissiles: override?.depot_missiles ?? 20,
        munitionsTorpedoes: override?.depot_torpedoes ?? 10,
        munitionsShells: override?.depot_shells ?? 200,
        strategicOreTitanium: override?.depot_titanium ?? 0,
        strategicOreIron: override?.depot_iron ?? 0,
        strategicOreUranium: override?.depot_uranium ?? 0,
      },
      governor: {
        policy: (override?.governor_policy ?? "balanced") as GovernorPolicy,
        automated: Boolean(override?.governor_automated),
      },
      investmentTier,
    };
  });

  // 3. Get formations
  const formationRows = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, embarked_on_id, status, metadata_json
       FROM campaign_formations WHERE campaign_id = ? ORDER BY side, unit_type, name`,
    )
    .all(campaignId) as Array<{
    id: string;
    name: string;
    unit_type: FormationUnitType;
    side: "blufor" | "opfor" | "neutral";
    country_id: string;
    hex_id: string;
    strength: number;
    action_points: number;
    max_action_points: number;
    embarked_on_id: string | null;
    status: string;
    metadata_json: string;
  }>;

  const formations: CampaignFormation[] = formationRows.map((r) => {
    const metadata = jsonParse<Record<string, unknown>>(r.metadata_json);
    return hydrateCampaignFormation(r, campaignId, metadata);
  });

  // 4. Calculate turn economy summary strictly for player's sovereign nation (e.g. Norway)
  let grossFunds = 0;
  let grossProduction = 0;
  let grossFuel = 0;
  let controlledHexCount = 0;

  for (const cell of coreCells) {
    // Only tally tiles sovereignly owned or liberated by the player's country and not contested
    if (
      cell.ownership.countryId === playerCountryId &&
      cell.status !== "contested"
    ) {
      grossFunds += cell.yields.fundsRevenue;
      grossProduction += cell.yields.productionPoints;
      grossFuel += cell.yields.energyFuel;
      controlledHexCount++;
    }
  }

  let upkeepFunds = 0;
  let fuelConsumption = 0;

  for (const form of formations) {
    // Upkeep and fuel consumption are funded only for player's sovereign national formations
    if (form.countryId === playerCountryId && form.status !== "depleted") {
      upkeepFunds += form.archetype?.upkeepFundsPerTurn ?? 10;
      fuelConsumption += form.archetype?.fuelConsumptionPerTurn ?? 10;
    }
  }

  const turnSummary: HexTurnEconomySummary = {
    grossFunds,
    grossProduction,
    grossFuel,
    upkeepFunds,
    fuelConsumption,
    netFundsDelta: grossFunds - upkeepFunds,
    netProductionDelta: grossProduction,
    netFuelDelta: grossFuel - fuelConsumption,
    controlledHexCount,
  };

  return {
    hexCells: coreCells,
    formations,
    economy: {
      funds,
      productionPoints,
      fuelStockpile,
      projectedDailyFundsDelta: turnSummary.netFundsDelta,
      projectedDailyProductionDelta: turnSummary.netProductionDelta,
      projectedDailyFuelDelta: turnSummary.netFuelDelta,
    },
    turnSummary,
  };
}

export function moveFormation(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    formationId: string;
    targetHexId: string;
    playerCountryId?: string;
  },
): { ok: boolean; reason?: string; contested?: boolean } {
  const formation = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, hex_id, action_points, embarked_on_id, status
       FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.formationId) as
    | {
        id: string;
        name: string;
        unit_type: FormationUnitType;
        side: "blufor" | "opfor" | "neutral";
        country_id: string;
        hex_id: string;
        action_points: number;
        embarked_on_id: string | null;
        status: string;
      }
    | undefined;

  if (!formation) return { ok: false, reason: "Formation not found." };
  if (input.playerCountryId && formation.country_id !== input.playerCountryId) {
    return {
      ok: false,
      reason:
        "Allied NATO formation is under sovereign operational command of its home nation and cannot be directly commanded.",
    };
  }
  if (formation.action_points <= 0) {
    return {
      ok: false,
      reason: "Formation has no Action Points remaining this turn.",
    };
  }

  const targetCell = getHexCellDefinition(input.targetHexId);

  // Validate terrain entry
  const canTraverse = canFormationTraverseTerrain(
    formation.unit_type,
    targetCell.terrain,
    formation.embarked_on_id !== null,
  );
  if (!canTraverse.canMove) {
    return {
      ok: false,
      reason: canTraverse.reason ?? "Terrain traversal blocked.",
    };
  }

  // Validate territorial sovereignty & Military Transit Rights
  const hexOverride = database
    .prepare(
      `SELECT side, country_id FROM campaign_hex_cells WHERE campaign_id = ? AND hex_id = ?`,
    )
    .get(input.campaignId, input.targetHexId) as
    { side: string; country_id: string } | undefined;

  const targetSide = hexOverride?.side ?? targetCell.ownership.side;
  const targetCountryId =
    hexOverride?.country_id ?? targetCell.ownership.countryId;

  if (targetCountryId && targetCountryId !== formation.country_id) {
    // Neutral or third-party nation: check military transit rights
    if (targetSide === "neutral" || formation.side === "neutral") {
      const hasTransit = hasMilitaryTransitRights(
        database,
        input.campaignId,
        formation.country_id,
        targetCountryId,
      );
      if (!hasTransit) {
        return {
          ok: false,
          reason: `Cannot traverse sovereign territory of ${targetCountryId.toUpperCase()} without Military Transit Rights or Coalition Alliance.`,
        };
      }
    } else if (targetSide !== formation.side) {
      // Enemy territory: check if an active armistice (ceasefire or non-aggression) exists
      const activeArmistice = database
        .prepare(
          `SELECT id FROM diplomatic_treaties
           WHERE campaign_id = ?
             AND ((party_a_country_id = ? AND party_b_country_id = ?) OR (party_a_country_id = ? AND party_b_country_id = ?))
             AND turns_remaining > 0
             AND treaty_type IN ('ceasefire', 'non_aggression')
           LIMIT 1`,
        )
        .get(
          input.campaignId,
          formation.country_id,
          targetCountryId,
          targetCountryId,
          formation.country_id,
        ) as { id: string } | undefined;

      if (activeArmistice) {
        // Void ceasefire and escalate tension for border violation
        database
          .prepare(
            "UPDATE diplomatic_treaties SET turns_remaining = 0, updated_at = ? WHERE id = ?",
          )
          .run(new Date().toISOString(), activeArmistice.id);

        database
          .prepare(
            `UPDATE campaign_tensions
             SET tension_index = MIN(100, tension_index + 30),
                 last_incident_summary = ?,
                 updated_at = ?
             WHERE campaign_id = ?`,
          )
          .run(
            `Armistice breached: ${formation.name} crossed the frontier into ${targetCell.name}!`,
            new Date().toISOString(),
            input.campaignId,
          );
      }
    }
  }

  // Check if target has hostile formations
  const hostileFormations = database
    .prepare(
      `SELECT id, name FROM campaign_formations
       WHERE campaign_id = ? AND hex_id = ? AND side != ? AND status != 'depleted'`,
    )
    .all(input.campaignId, input.targetHexId, formation.side) as Array<{
    id: string;
  }>;

  const isContested = hostileFormations.length > 0;
  const now = new Date().toISOString();

  database.transaction(() => {
    // Move this formation
    database
      .prepare(
        `UPDATE campaign_formations
         SET hex_id = ?, action_points = action_points - 1, status = ?, updated_at = ?
         WHERE campaign_id = ? AND id = ?`,
      )
      .run(
        input.targetHexId,
        isContested ? "engaged" : "moved",
        now,
        input.campaignId,
        input.formationId,
      );

    // If this is a transport vessel carrying embarked units, move embarked units too!
    database
      .prepare(
        `UPDATE campaign_formations
         SET hex_id = ?, updated_at = ?
         WHERE campaign_id = ? AND embarked_on_id = ?`,
      )
      .run(input.targetHexId, now, input.campaignId, input.formationId);

    if (isContested) {
      database
        .prepare(
          `INSERT INTO campaign_hex_cells (campaign_id, hex_id, side, country_id, contested, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(campaign_id, hex_id) DO UPDATE SET contested = 1, updated_at = ?`,
        )
        .run(
          input.campaignId,
          input.targetHexId,
          targetCell.ownership.side,
          targetCell.ownership.countryId,
          now,
          now,
          now,
        );
    }
  })();

  // Border Proximity Perception & Diplomatic Protests
  try {
    const neighborHexes = getHexNeighbors(targetCell);
    const movingPersona = getCountryPersona(formation.country_id);

    const neighborIds = neighborHexes.map((n) => n.id);
    const dbHexes =
      neighborIds.length > 0
        ? (database
            .prepare(
              `SELECT hex_id, country_id FROM campaign_hex_cells WHERE campaign_id = ? AND hex_id IN (${neighborIds.map(() => "?").join(",")})`,
            )
            .all(input.campaignId, ...neighborIds) as Array<{
            hex_id: string;
            country_id: string;
          }>)
        : [];
    const dbOwnerMap = new Map(dbHexes.map((h) => [h.hex_id, h.country_id]));

    const foreignBorderHex = neighborHexes.find((n) => {
      const owner = dbOwnerMap.get(n.id) ?? n.ownership?.countryId;
      if (
        !owner ||
        owner === formation.country_id ||
        owner === "international-waters"
      ) {
        return false;
      }
      const foreignPersona = getCountryPersona(owner);
      return foreignPersona.bloc !== movingPersona.bloc;
    });

    const foreignCountryId = foreignBorderHex
      ? (dbOwnerMap.get(foreignBorderHex.id) ??
        foreignBorderHex.ownership?.countryId)
      : undefined;

    if (foreignBorderHex && foreignCountryId) {
      const foreignPersona = getCountryPersona(foreignCountryId);

      const existingProtest = database
        .prepare(
          `SELECT id FROM diplomatic_cables
           WHERE campaign_id = ?
             AND sender_country_id = ?
             AND recipient_country_id = ?
             AND header LIKE '%BORDER%'
           LIMIT 1`,
        )
        .get(input.campaignId, foreignCountryId, formation.country_id);

      if (!existingProtest) {
        if (foreignCountryId === "soviet-union") {
          recordDiplomaticCable(database, input.campaignId, {
            senderCountryId: foreignCountryId,
            recipientCountryId: formation.country_id,
            classification: "URGENT // DIPLOMATIC DEMARCHE",
            header: "MINISTRY OF FOREIGN AFFAIRS OF THE USSR — BORDER PROTEST",
            content: `STAVKA radar surveillance registers foreign combat formation '${formation.name}' maneuvering in international waters immediately adjacent to our Kola Defense Bastion [Sector: ${targetCell.name}]. Cease these provocative naval incursions along the Soviet sovereign perimeter immediately.`,
          });
        } else if (
          foreignCountryId === "sweden" ||
          foreignCountryId === "finland"
        ) {
          recordDiplomaticCable(database, input.campaignId, {
            senderCountryId: foreignCountryId,
            recipientCountryId: formation.country_id,
            classification: "PRIORITY // NOTE VERBALE",
            header: `${foreignPersona.governingBody.toUpperCase()} — BORDER INQUIRY`,
            content: `Coastal surveillance radar detects combat formation '${formation.name}' operating 15 nautical miles off our sovereign maritime frontier [Sector: ${targetCell.name}]. We remind foreign commands that strict non-belligerent neutrality applies to these waters.`,
          });
        }
      }
    }
  } catch {
    // Border perception telemetry fallback
  }

  return { ok: true, contested: isContested };
}

export function issueFormationMovementOrder(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    formationId: string;
    targetHexId: string;
    playerCountryId?: string;
  },
): {
  ok: boolean;
  reason?: string;
  route?: ActiveMovementRoute;
  formation?: CampaignFormation;
  contested?: boolean;
} {
  const row = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, embarked_on_id, status, metadata_json
       FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.formationId) as
    | {
        id: string;
        name: string;
        unit_type: FormationUnitType;
        side: "blufor" | "opfor" | "neutral";
        country_id: string;
        hex_id: string;
        strength: number;
        action_points: number;
        max_action_points: number;
        embarked_on_id: string | null;
        status: "ready" | "moved" | "engaged" | "embarked" | "depleted";
        metadata_json: string;
      }
    | undefined;

  if (!row) return { ok: false, reason: "Formation not found." };
  if (input.playerCountryId && row.country_id !== input.playerCountryId) {
    return {
      ok: false,
      reason:
        "Allied NATO formation is under sovereign operational command of its home nation and cannot be directly commanded.",
    };
  }
  if (row.status === "depleted") {
    return { ok: false, reason: "Formation is depleted." };
  }

  const startHexId = row.hex_id;
  const targetHexId = input.targetHexId;
  if (startHexId === targetHexId) {
    return { ok: false, reason: "Formation is already at the target sector." };
  }

  const startHexDef = getHexCellDefinition(startHexId);
  const targetHexDef = getHexCellDefinition(targetHexId);

  const pathResult = findFormationHexPath({
    startAxial: startHexDef.axial,
    targetAxial: targetHexDef.axial,
    unitType: row.unit_type,
    isEmbarked: row.embarked_on_id !== null,
    currentAP: row.action_points,
    maxAP: row.max_action_points,
  });

  if (!pathResult.found || pathResult.path.length <= 1) {
    return {
      ok: false,
      reason: pathResult.reason ?? "No navigable route found to target hex.",
    };
  }

  const targetCell = targetHexDef;
  const waypoints = pathResult.path.map((p: HexPathNode) => p.hexId);
  const totalWaypoints = waypoints.length;
  const totalTurns = pathResult.turnsNeeded;

  let currentHexId = startHexId;
  let currentWaypointIndex = 0;
  let currentAP = row.action_points;
  let isContested = false;
  let routeStatus: ActiveMovementRoute["status"] = "in_transit";
  let routeReason: string | undefined = undefined;

  // Advance along waypoints using available action points for the current turn
  while (currentAP > 0 && currentWaypointIndex < totalWaypoints - 1) {
    const nextIndex = currentWaypointIndex + 1;
    const nextHexId = waypoints[nextIndex];
    if (!nextHexId) break;

    const hostileFormations = database
      .prepare(
        `SELECT id, name FROM campaign_formations
         WHERE campaign_id = ? AND hex_id = ? AND side != ? AND status != 'depleted'`,
      )
      .all(input.campaignId, nextHexId, row.side) as Array<{ id: string }>;

    currentHexId = nextHexId;
    currentWaypointIndex = nextIndex;
    currentAP -= 1;

    if (hostileFormations.length > 0) {
      isContested = true;
      routeStatus = "interrupted";
      routeReason = "Engaged hostile forces en route.";
      break;
    }

    if (currentWaypointIndex === totalWaypoints - 1) {
      routeStatus = "arrived";
      break;
    }
  }

  const turnsElapsed = currentWaypointIndex > 0 ? 1 : 0;
  const activeRoute: ActiveMovementRoute = {
    targetHexId,
    targetName: targetCell.name,
    waypoints,
    currentWaypointIndex,
    totalWaypoints,
    totalTurns,
    turnsElapsed,
    status: routeStatus,
    reason: routeReason,
  };

  const currentMetadata = jsonParse<Record<string, unknown>>(row.metadata_json);
  currentMetadata.activeRoute = activeRoute;
  const newMetadataJson = JSON.stringify(currentMetadata);
  const now = new Date().toISOString();

  let finalFormationStatus = row.status;
  if (isContested) {
    finalFormationStatus = "engaged";
  } else if (currentAP <= 0 && row.status !== "embarked") {
    finalFormationStatus = "moved";
  }

  database.transaction(() => {
    database
      .prepare(
        `UPDATE campaign_formations
         SET hex_id = ?, action_points = ?, status = ?, metadata_json = ?, updated_at = ?
         WHERE campaign_id = ? AND id = ?`,
      )
      .run(
        currentHexId,
        currentAP,
        finalFormationStatus,
        newMetadataJson,
        now,
        input.campaignId,
        input.formationId,
      );

    // If transport, move embarked units along too
    database
      .prepare(
        `UPDATE campaign_formations
         SET hex_id = ?, updated_at = ?
         WHERE campaign_id = ? AND embarked_on_id = ?`,
      )
      .run(currentHexId, now, input.campaignId, input.formationId);

    if (isContested) {
      const stepCell = getHexCellDefinition(currentHexId);
      database
        .prepare(
          `INSERT INTO campaign_hex_cells (campaign_id, hex_id, side, country_id, contested, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(campaign_id, hex_id) DO UPDATE SET contested = 1, updated_at = ?`,
        )
        .run(
          input.campaignId,
          currentHexId,
          stepCell.ownership.side,
          stepCell.ownership.countryId,
          now,
          now,
          now,
        );
    }
  })();

  const updatedFormation = hydrateCampaignFormation(
    {
      ...row,
      hex_id: currentHexId,
      action_points: currentAP,
      status: finalFormationStatus,
    },
    input.campaignId,
    currentMetadata,
  );

  return {
    ok: true,
    route: activeRoute,
    formation: updatedFormation,
    contested: isContested,
  };
}

export function cancelFormationMovementOrder(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    formationId: string;
    playerCountryId?: string;
  },
): { ok: boolean; reason?: string; formation?: CampaignFormation } {
  const row = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, embarked_on_id, status, metadata_json
       FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.formationId) as
    | {
        id: string;
        name: string;
        unit_type: FormationUnitType;
        side: "blufor" | "opfor" | "neutral";
        country_id: string;
        hex_id: string;
        strength: number;
        action_points: number;
        max_action_points: number;
        embarked_on_id: string | null;
        status: string;
        metadata_json: string;
      }
    | undefined;

  if (!row) return { ok: false, reason: "Formation not found." };
  if (input.playerCountryId && row.country_id !== input.playerCountryId) {
    return {
      ok: false,
      reason:
        "Allied NATO formation is under sovereign operational command of its home nation.",
    };
  }

  const currentMetadata = jsonParse<Record<string, unknown>>(row.metadata_json);
  delete currentMetadata.activeRoute;
  const newMetadataJson = JSON.stringify(currentMetadata);
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE campaign_formations
       SET metadata_json = ?, updated_at = ?
       WHERE campaign_id = ? AND id = ?`,
    )
    .run(newMetadataJson, now, input.campaignId, input.formationId);

  const updatedFormation = hydrateCampaignFormation(
    row,
    input.campaignId,
    currentMetadata,
  );

  return { ok: true, formation: updatedFormation };
}

export function processTurnMovementOrders(
  database: CampaignDatabase,
  campaignId: string,
): Array<{
  formationId: string;
  name: string;
  fromHexId: string;
  toHexId: string;
  currentStep: number;
  totalSteps: number;
  turnsElapsed: number;
  totalTurns: number;
  status: ActiveMovementRoute["status"];
}> {
  const rows = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, embarked_on_id, status, metadata_json
       FROM campaign_formations
       WHERE campaign_id = ? AND status != 'depleted'`,
    )
    .all(campaignId) as Array<{
    id: string;
    name: string;
    unit_type: FormationUnitType;
    side: "blufor" | "opfor" | "neutral";
    country_id: string;
    hex_id: string;
    strength: number;
    action_points: number;
    max_action_points: number;
    embarked_on_id: string | null;
    status: CampaignFormationStatus;
    metadata_json: string;
  }>;

  const now = new Date().toISOString();
  const movementLogs: Array<{
    formationId: string;
    name: string;
    fromHexId: string;
    toHexId: string;
    currentStep: number;
    totalSteps: number;
    turnsElapsed: number;
    totalTurns: number;
    status: ActiveMovementRoute["status"];
  }> = [];

  for (const row of rows) {
    const metadata = jsonParse<Record<string, unknown>>(row.metadata_json);
    const activeRoute = metadata.activeRoute as ActiveMovementRoute | undefined;

    if (!activeRoute || activeRoute.status !== "in_transit") {
      continue;
    }

    const fromHexId = row.hex_id;
    let currentHexId = row.hex_id;
    let currentWaypointIndex = activeRoute.currentWaypointIndex;
    const waypoints = activeRoute.waypoints;
    const totalWaypoints = waypoints.length;
    let availableAP = row.max_action_points;
    let isContested = false;
    let newStatus: ActiveMovementRoute["status"] = "in_transit";
    let newReason = activeRoute.reason;

    while (availableAP > 0 && currentWaypointIndex < totalWaypoints - 1) {
      const nextIndex = currentWaypointIndex + 1;
      const nextHexId = waypoints[nextIndex];
      if (!nextHexId) break;

      const nextCell = getHexCellDefinition(nextHexId);
      const canTraverse = canFormationTraverseTerrain(
        row.unit_type,
        nextCell.terrain,
        row.embarked_on_id !== null,
        nextCell.facilities,
      );

      if (!canTraverse.canMove) {
        newStatus = "blocked";
        newReason = canTraverse.reason ?? "Terrain traversal blocked.";
        break;
      }

      // Check for hostiles
      const hostileFormations = database
        .prepare(
          `SELECT id, name FROM campaign_formations
           WHERE campaign_id = ? AND hex_id = ? AND side != ? AND status != 'depleted'`,
        )
        .all(campaignId, nextHexId, row.side) as Array<{ id: string }>;

      currentHexId = nextHexId;
      currentWaypointIndex = nextIndex;
      availableAP -= 1;

      if (hostileFormations.length > 0) {
        isContested = true;
        newStatus = "interrupted";
        newReason = "Engaged enemy contact en route.";
        break;
      }

      if (currentWaypointIndex === totalWaypoints - 1) {
        newStatus = "arrived";
        break;
      }
    }

    const turnsElapsed = activeRoute.turnsElapsed + 1;
    activeRoute.currentWaypointIndex = currentWaypointIndex;
    activeRoute.turnsElapsed = turnsElapsed;
    activeRoute.status = newStatus;
    activeRoute.reason = newReason;
    metadata.activeRoute = activeRoute;

    let formationStatus = row.status;
    if (isContested) {
      formationStatus = "engaged";
    } else if (
      availableAP <= 0 &&
      row.status !== "embarked" &&
      row.status !== "embarking" &&
      row.status !== "disembarking"
    ) {
      formationStatus = "moved";
    } else if (
      row.status !== "embarked" &&
      row.status !== "embarking" &&
      row.status !== "disembarking"
    ) {
      formationStatus = "ready";
    }

    database.transaction(() => {
      database
        .prepare(
          `UPDATE campaign_formations
           SET hex_id = ?, action_points = ?, status = ?, metadata_json = ?, updated_at = ?
           WHERE campaign_id = ? AND id = ?`,
        )
        .run(
          currentHexId,
          availableAP,
          formationStatus,
          JSON.stringify(metadata),
          now,
          campaignId,
          row.id,
        );

      if (row.unit_type === "sealift_transport_flotilla") {
        database
          .prepare(
            `UPDATE campaign_formations
             SET hex_id = ?, updated_at = ?
             WHERE campaign_id = ? AND embarked_on_id = ?`,
          )
          .run(currentHexId, now, campaignId, row.id);
      }

      if (isContested) {
        const stepCell = getHexCellDefinition(currentHexId);
        database
          .prepare(
            `INSERT INTO campaign_hex_cells (campaign_id, hex_id, side, country_id, contested, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)
             ON CONFLICT(campaign_id, hex_id) DO UPDATE SET contested = 1, updated_at = ?`,
          )
          .run(
            campaignId,
            currentHexId,
            stepCell.ownership.side,
            stepCell.ownership.countryId,
            now,
            now,
            now,
          );
      }
    })();

    movementLogs.push({
      formationId: row.id,
      name: row.name,
      fromHexId,
      toHexId: currentHexId,
      currentStep: currentWaypointIndex,
      totalSteps: totalWaypoints - 1,
      turnsElapsed,
      totalTurns: activeRoute.totalTurns,
      status: newStatus,
    });
  }

  return movementLogs;
}

export function processTurnDailyFormationsUpdate(
  database: CampaignDatabase,
  campaignId: string,
): void {
  const rows = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, hex_id, action_points, max_action_points, embarked_on_id, status, metadata_json
       FROM campaign_formations WHERE campaign_id = ?`,
    )
    .all(campaignId) as Array<{
    id: string;
    name: string;
    unit_type: FormationUnitType;
    side: "blufor" | "opfor" | "neutral";
    country_id: string;
    hex_id: string;
    action_points: number;
    max_action_points: number;
    embarked_on_id: string | null;
    status: CampaignFormationStatus;
    metadata_json: string;
  }>;

  const now = new Date().toISOString();

  for (const row of rows) {
    if (row.status === "depleted") continue;

    const metadata = jsonParse<Record<string, unknown>>(row.metadata_json);
    const archetype = FORMATION_ARCHETYPES[row.unit_type];
    let newStatus: CampaignFormationStatus = row.status;
    let newHexId = row.hex_id;
    let newEmbarkedOnId = row.embarked_on_id;
    let newActionPoints = row.max_action_points;

    // 1. Process Embarkation Turn Progression (Takes 1 full turn)
    if (row.status === "embarking") {
      const remaining =
        typeof metadata.embarkTurnsRemaining === "number"
          ? metadata.embarkTurnsRemaining - 1
          : 0;
      if (remaining <= 0) {
        newStatus = "embarked";
        delete metadata.embarkTurnsRemaining;
      } else {
        metadata.embarkTurnsRemaining = remaining;
        newStatus = "embarking";
        newActionPoints = 0;
      }
    }

    // 2. Process Disembarkation Turn Progression (Takes 1 full turn)
    else if (row.status === "disembarking") {
      const remaining =
        typeof metadata.disembarkTurnsRemaining === "number"
          ? metadata.disembarkTurnsRemaining - 1
          : 0;
      if (remaining <= 0) {
        if (typeof metadata.targetDisembarkHexId === "string") {
          newHexId = metadata.targetDisembarkHexId;
        }
        newEmbarkedOnId = null;
        newStatus = "ready";
        delete metadata.disembarkTurnsRemaining;
        delete metadata.targetDisembarkHexId;
      } else {
        metadata.disembarkTurnsRemaining = remaining;
        newStatus = "disembarking";
        newActionPoints = 0;
      }
    }

    // 3. Process Combat Training Drills Progression
    else if (row.status === "training") {
      const remaining =
        typeof metadata.trainingTurnsRemaining === "number"
          ? metadata.trainingTurnsRemaining - 1
          : 0;
      const currentXP =
        typeof metadata.experience === "number" ? metadata.experience : 40;
      // Training yields +7 experience per turn up to Elite (95)
      metadata.experience = Math.min(95, currentXP + 7);
      if (remaining <= 0) {
        newStatus = "ready";
        delete metadata.trainingTurnsRemaining;
      } else {
        metadata.trainingTurnsRemaining = remaining;
        newStatus = "training";
        newActionPoints = 0;
      }
    }

    // 4. Default Ready / Moved Transition
    else if (row.status !== "embarked" && row.status !== "engaged") {
      newStatus = "ready";
    }

    // 5. Fuel & Morale Dynamics
    const cell = getHexCellDefinition(newHexId);
    const isAtFriendlyPort = isFriendlyPortOrBase(
      cell,
      row.side,
      row.country_id,
    );

    const currentMorale =
      typeof metadata.morale === "number" ? metadata.morale : 100;
    const consecutiveTurnsAtSea =
      typeof metadata.consecutiveTurnsAtSea === "number"
        ? metadata.consecutiveTurnsAtSea
        : 0;
    const { morale: updatedMorale, consecutiveTurnsAtSea: updatedTurnsAtSea } =
      calculateSeaFatigueAndMorale(
        currentMorale,
        consecutiveTurnsAtSea,
        isAtFriendlyPort,
        archetype.domain,
      );

    metadata.morale = updatedMorale;
    metadata.consecutiveTurnsAtSea = updatedTurnsAtSea;

    // Fuel consumption at sea for naval units
    if (
      archetype.domain === "naval" &&
      !isAtFriendlyPort &&
      row.status !== "embarked"
    ) {
      const currentFuel =
        typeof metadata.fuelCurrent === "number" ? metadata.fuelCurrent : 100;
      metadata.fuelCurrent = Math.max(
        0,
        currentFuel - archetype.fuelConsumptionPerTurn,
      );
    }

    database
      .prepare(
        `UPDATE campaign_formations
         SET hex_id = ?, embarked_on_id = ?, action_points = ?, status = ?, metadata_json = ?, updated_at = ?
         WHERE campaign_id = ? AND id = ?`,
      )
      .run(
        newHexId,
        newEmbarkedOnId,
        newActionPoints,
        newStatus,
        JSON.stringify(metadata),
        now,
        campaignId,
        row.id,
      );
  }
}

export function embarkFormation(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    groundFormationId: string;
    sealiftFormationId: string;
    playerCountryId?: string;
  },
): { ok: boolean; reason?: string } {
  const ground = database
    .prepare(
      `SELECT id, unit_type, country_id, hex_id, side, metadata_json FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.groundFormationId) as
    | {
        id: string;
        unit_type: FormationUnitType;
        country_id: string;
        hex_id: string;
        side: string;
        metadata_json: string;
      }
    | undefined;

  const sealift = database
    .prepare(
      `SELECT id, unit_type, country_id, hex_id, side, metadata_json FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.sealiftFormationId) as
    | {
        id: string;
        unit_type: FormationUnitType;
        country_id: string;
        hex_id: string;
        side: string;
        metadata_json: string;
      }
    | undefined;

  if (!ground || !sealift) return { ok: false, reason: "Formation not found." };
  if (
    input.playerCountryId &&
    (ground.country_id !== input.playerCountryId ||
      sealift.country_id !== input.playerCountryId)
  ) {
    return {
      ok: false,
      reason: "Allied NATO formations cannot be embarked by national command.",
    };
  }
  if (ground.hex_id !== sealift.hex_id) {
    return {
      ok: false,
      reason: "Formations must occupy the same port hex to embark.",
    };
  }
  if (sealift.unit_type !== "sealift_transport_flotilla") {
    return {
      ok: false,
      reason: "Target transport must be a Strategic Sealift Flotilla.",
    };
  }

  // Check capacity
  const embarkedCount = database
    .prepare(
      `SELECT COUNT(*) as count FROM campaign_formations WHERE campaign_id = ? AND embarked_on_id = ?`,
    )
    .get(input.campaignId, input.sealiftFormationId) as { count: number };

  if (embarkedCount.count >= 2) {
    return {
      ok: false,
      reason: "Sealift transport is at full capacity (2 divisions).",
    };
  }

  const now = new Date().toISOString();
  const groundMeta = jsonParse<Record<string, unknown>>(ground.metadata_json);
  groundMeta.embarkTurnsRemaining = 1;

  database.transaction(() => {
    // Ground unit starts embarking (takes 1 turn)
    database
      .prepare(
        `UPDATE campaign_formations
         SET embarked_on_id = ?, status = 'embarking', action_points = 0, metadata_json = ?, updated_at = ?
         WHERE campaign_id = ? AND id = ?`,
      )
      .run(
        input.sealiftFormationId,
        JSON.stringify(groundMeta),
        now,
        input.campaignId,
        input.groundFormationId,
      );

    // Sealift dedicates AP to loading troops
    database
      .prepare(
        `UPDATE campaign_formations
         SET action_points = 0, updated_at = ?
         WHERE campaign_id = ? AND id = ?`,
      )
      .run(now, input.campaignId, input.sealiftFormationId);
  })();

  return { ok: true };
}

export function disembarkFormation(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    groundFormationId: string;
    targetHexId: string;
    playerCountryId?: string;
  },
): { ok: boolean; reason?: string } {
  const ground = database
    .prepare(
      `SELECT id, country_id, hex_id, embarked_on_id, metadata_json FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.groundFormationId) as
    | {
        id: string;
        country_id: string;
        hex_id: string;
        embarked_on_id: string | null;
        metadata_json: string;
      }
    | undefined;

  if (!ground || !ground.embarked_on_id) {
    return {
      ok: false,
      reason: "Formation is not currently embarked on sealift.",
    };
  }
  if (input.playerCountryId && ground.country_id !== input.playerCountryId) {
    return {
      ok: false,
      reason:
        "Allied NATO formations cannot be disembarked by national command.",
    };
  }

  const targetCell = getHexCellDefinition(input.targetHexId);
  if (isWaterTerrain(targetCell.terrain)) {
    return {
      ok: false,
      reason: "Cannot disembark heavy ground armor into open water.",
    };
  }

  const now = new Date().toISOString();
  const groundMeta = jsonParse<Record<string, unknown>>(ground.metadata_json);
  groundMeta.disembarkTurnsRemaining = 1;
  groundMeta.targetDisembarkHexId = input.targetHexId;

  database
    .prepare(
      `UPDATE campaign_formations
       SET status = 'disembarking', action_points = 0, metadata_json = ?, updated_at = ?
       WHERE campaign_id = ? AND id = ?`,
    )
    .run(
      JSON.stringify(groundMeta),
      now,
      input.campaignId,
      input.groundFormationId,
    );

  return { ok: true };
}

export function dismissCompletedMovementOrder(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    formationId: string;
    playerCountryId?: string;
  },
): { ok: boolean; reason?: string } {
  const row = database
    .prepare(
      `SELECT id, country_id, metadata_json FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.formationId) as
    { id: string; country_id: string; metadata_json: string } | undefined;

  if (!row) return { ok: false, reason: "Formation not found." };
  if (input.playerCountryId && row.country_id !== input.playerCountryId) {
    return { ok: false, reason: "Unauthorized national command." };
  }

  const metadata = jsonParse<Record<string, unknown>>(row.metadata_json);
  delete metadata.activeRoute;
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE campaign_formations SET metadata_json = ?, updated_at = ? WHERE campaign_id = ? AND id = ?`,
    )
    .run(JSON.stringify(metadata), now, input.campaignId, input.formationId);

  return { ok: true };
}

export function refuelAndRearmFormation(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    formationId: string;
    playerCountryId?: string;
  },
): { ok: boolean; reason?: string; fundsCost?: number; fuelCost?: number } {
  const formation = database
    .prepare(
      `SELECT id, name, unit_type, country_id, hex_id, action_points, metadata_json
       FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.formationId) as
    | {
        id: string;
        name: string;
        unit_type: FormationUnitType;
        country_id: string;
        hex_id: string;
        action_points: number;
        metadata_json: string;
      }
    | undefined;

  if (!formation) return { ok: false, reason: "Formation not found." };
  if (input.playerCountryId && formation.country_id !== input.playerCountryId) {
    return { ok: false, reason: "Unauthorized national command." };
  }

  // Check if at friendly port / base
  const cell = getHexCellDefinition(formation.hex_id);
  const isFriendlyPort = isFriendlyPortOrBase(
    cell,
    "blufor",
    formation.country_id,
  );

  if (!isFriendlyPort) {
    return {
      ok: false,
      reason:
        "Formation must be stationed at a friendly port, naval base, or airfield to refuel and rearm.",
    };
  }

  if (
    cell.ownership.countryId &&
    cell.ownership.countryId !== formation.country_id
  ) {
    const hasBasing = hasBasingRights(
      database,
      input.campaignId,
      formation.country_id,
      cell.ownership.countryId,
    );
    if (!hasBasing) {
      return {
        ok: false,
        reason: `Cannot conduct port operations in foreign territory (${cell.ownership.countryId.toUpperCase()}) without Basing Rights or Coalition Alliance.`,
      };
    }
  }

  const fundsCost = 25;
  const fuelCost = 15;

  const economy = database
    .prepare(
      `SELECT funds, fuel_stockpile FROM campaign_economy WHERE campaign_id = ?`,
    )
    .get(input.campaignId) as
    { funds: number; fuel_stockpile: number } | undefined;

  if (
    !economy ||
    economy.funds < fundsCost ||
    economy.fuel_stockpile < fuelCost
  ) {
    return {
      ok: false,
      reason:
        "Insufficient national treasury funds or fuel stockpile for replenishment.",
    };
  }

  const metadata = jsonParse<Record<string, unknown>>(formation.metadata_json);
  metadata.fuelCurrent = 100;
  metadata.fuelMax = 100;
  metadata.ammoLevel = 100;
  metadata.consecutiveTurnsAtSea = 0;

  const now = new Date().toISOString();
  database.transaction(() => {
    database
      .prepare(
        `UPDATE campaign_economy
         SET funds = funds - ?, fuel_stockpile = fuel_stockpile - ?, updated_at = ?
         WHERE campaign_id = ?`,
      )
      .run(fundsCost, fuelCost, now, input.campaignId);

    database
      .prepare(
        `UPDATE campaign_formations
         SET metadata_json = ?, updated_at = ?
         WHERE campaign_id = ? AND id = ?`,
      )
      .run(JSON.stringify(metadata), now, input.campaignId, input.formationId);
  })();

  return { ok: true, fundsCost, fuelCost };
}

export function restAndRefitFormation(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    formationId: string;
    playerCountryId?: string;
  },
): { ok: boolean; reason?: string } {
  const formation = database
    .prepare(
      `SELECT id, name, unit_type, country_id, hex_id, metadata_json
       FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.formationId) as
    | {
        id: string;
        name: string;
        unit_type: FormationUnitType;
        country_id: string;
        hex_id: string;
        metadata_json: string;
      }
    | undefined;

  if (!formation) return { ok: false, reason: "Formation not found." };
  if (input.playerCountryId && formation.country_id !== input.playerCountryId) {
    return { ok: false, reason: "Unauthorized national command." };
  }

  const cell = getHexCellDefinition(formation.hex_id);
  const isFriendlyLocation = cell.ownership.side === "blufor";

  if (!isFriendlyLocation) {
    return {
      ok: false,
      reason:
        "Formation must be in friendly sovereign or allied territory to grant R&R shore leave.",
    };
  }

  const metadata = jsonParse<Record<string, unknown>>(formation.metadata_json);
  metadata.morale = 100;
  metadata.consecutiveTurnsAtSea = 0;

  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE campaign_formations SET metadata_json = ?, updated_at = ? WHERE campaign_id = ? AND id = ?`,
    )
    .run(JSON.stringify(metadata), now, input.campaignId, input.formationId);

  return { ok: true };
}

export function orderCombatTraining(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    formationId: string;
    turns?: number;
    playerCountryId?: string;
  },
): { ok: boolean; reason?: string } {
  const formation = database
    .prepare(
      `SELECT id, name, country_id, hex_id, status, metadata_json
       FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, input.formationId) as
    | {
        id: string;
        name: string;
        country_id: string;
        hex_id: string;
        status: string;
        metadata_json: string;
      }
    | undefined;

  if (!formation) return { ok: false, reason: "Formation not found." };
  if (input.playerCountryId && formation.country_id !== input.playerCountryId) {
    return { ok: false, reason: "Unauthorized national command." };
  }
  if (
    formation.status === "embarked" ||
    formation.status === "embarking" ||
    formation.status === "disembarking"
  ) {
    return {
      ok: false,
      reason:
        "Embarked or embarking formations cannot conduct training exercises.",
    };
  }

  const turns = input.turns ?? 1;
  const metadata = jsonParse<Record<string, unknown>>(formation.metadata_json);
  metadata.trainingTurnsRemaining = turns;

  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE campaign_formations SET status = 'training', action_points = 0, metadata_json = ?, updated_at = ? WHERE campaign_id = ? AND id = ?`,
    )
    .run(JSON.stringify(metadata), now, input.campaignId, input.formationId);

  return { ok: true };
}

export function generateSeaPowerHexBattle(
  database: CampaignDatabase,
  input: { campaignId: string; hexId: string; missionTitle?: string },
): { ok: boolean; missionText: string; filePath?: string; unitsCount: number } {
  const hex = getHexCellDefinition(input.hexId);
  const formations = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id FROM campaign_formations
       WHERE campaign_id = ? AND hex_id = ? AND status != 'depleted'`,
    )
    .all(input.campaignId, input.hexId) as Array<{
    id: string;
    name: string;
    unit_type: FormationUnitType;
    side: "blufor" | "opfor" | "neutral";
    country_id: string;
  }>;

  const campaign = database
    .prepare(`SELECT name, campaign_time FROM campaigns WHERE id = ?`)
    .get(input.campaignId) as
    { name: string; campaign_time: string } | undefined;

  const missionDate = campaign?.campaign_time
    ? new Date(campaign.campaign_time)
    : new Date("1983-11-05T06:00:00Z");

  const title =
    input.missionTitle ??
    `Strategic Battle for ${hex.name} (${missionDate.toISOString().slice(0, 10)})`;

  const lat = hex.centroid[0];
  const lon = hex.centroid[1];
  let theaterName = "NorthAtlantic";
  if (lat >= 25 && lat <= 46 && lon >= -6 && lon <= 40) {
    theaterName = "Mediterranean";
  } else if ((lon <= -110 || lon >= 120) && lat >= 0 && lat <= 65) {
    theaterName = "NorthPacific";
  } else if (lon >= 35 && lon <= 110 && lat >= -40 && lat <= 30) {
    theaterName = "IndianOcean";
  }

  const lines: string[] = [
    "[Mission]",
    `Title=${title}`,
    `Description=Civilization-to-Sea Power Strategic Handoff: Decisive tactical engagement for control of ${hex.name}. Neutralize hostile forces to claim sovereign control of the hex.`,
    `Date=${missionDate.getUTCFullYear()}.${missionDate.getUTCMonth() + 1}.${missionDate.getUTCDate()}`,
    `Time=${String(missionDate.getUTCHours()).padStart(2, "0")}:${String(missionDate.getUTCMinutes()).padStart(2, "0")}:00`,
    `Latitude=${hex.centroid[0].toFixed(4)}`,
    `Longitude=${hex.centroid[1].toFixed(4)}`,
    `Theater=${theaterName}`,
    "",
    "[Environment]",
    "WeatherPreset=Clear",
    "WindDirection=240",
    "WindSpeedKnots=12",
    "SeaState=3",
    "VisibilityStatuteMiles=15",
    "",
    "[Player]",
    "Side=Blue",
    "Nation=Norway",
    "",
  ];

  let unitIndex = 1;
  if (formations.length === 0) {
    // Generate standard combatants for contested hex claim
    lines.push(
      `[Unit1]`,
      `Name=Blue Forward Task Force`,
      `Type=knm_oslo`,
      `Variant=Default`,
      `Side=Blue`,
      `Nation=Norway`,
      `Latitude=${(hex.centroid[0] - 0.15).toFixed(4)}`,
      `Longitude=${hex.centroid[1].toFixed(4)}`,
      `Heading=45`,
      `SpeedKnots=15`,
      `AltitudeFeet=0`,
      "",
      `[Unit2]`,
      `Name=Red Regional Defense Squadron`,
      `Type=sov_sovremenny`,
      `Variant=Default`,
      `Side=Red`,
      `Nation=SovietUnion`,
      `Latitude=${(hex.centroid[0] + 0.15).toFixed(4)}`,
      `Longitude=${hex.centroid[1].toFixed(4)}`,
      `Heading=225`,
      `SpeedKnots=15`,
      `AltitudeFeet=0`,
      "",
    );
    unitIndex = 3;
  }
  for (const form of formations) {
    const isPlayer = form.side === "blufor";
    const baseLat = hex.centroid[0] + (isPlayer ? -0.15 : 0.15);
    const baseLon = hex.centroid[1] + (unitIndex * 0.08 - 0.2);

    let nativeType = "knm_oslo";
    const nativeVariant = "Default";
    let nativeNation = "Norway";

    if (form.unit_type === "surface_action_group") {
      nativeType = isPlayer ? "knm_oslo" : "sov_sovremenny";
      nativeNation = isPlayer ? "Norway" : "SovietUnion";
    } else if (form.unit_type === "submarine_squadron") {
      nativeType = isPlayer ? "usn_los_angeles" : "sov_victor3";
      nativeNation = isPlayer ? "UnitedStates" : "SovietUnion";
    } else if (form.unit_type === "carrier_strike_group") {
      nativeType = "usn_nimitz";
      nativeNation = "UnitedStates";
    } else if (form.unit_type === "sealift_transport_flotilla") {
      nativeType = "civ_cargo_c3";
      nativeNation = isPlayer ? "Norway" : "SovietUnion";
    } else if (
      form.unit_type === "nato_armored_division" ||
      form.unit_type === "pact_tank_division"
    ) {
      nativeType = isPlayer ? "land_m1_abrams" : "land_t80";
      nativeNation = isPlayer ? "UnitedStates" : "SovietUnion";
    } else {
      nativeType = isPlayer ? "air_f16a" : "air_tu22m3";
      nativeNation = isPlayer ? "Norway" : "SovietUnion";
    }

    lines.push(
      `[Unit${unitIndex}]`,
      `Name=${form.name}`,
      `Type=${nativeType}`,
      `Variant=${nativeVariant}`,
      `Side=${isPlayer ? "Blue" : "Red"}`,
      `Nation=${nativeNation}`,
      `Latitude=${baseLat.toFixed(4)}`,
      `Longitude=${baseLon.toFixed(4)}`,
      `Heading=${isPlayer ? 45 : 225}`,
      `SpeedKnots=${form.unit_type.includes("air") ? 350 : 15}`,
      `AltitudeFeet=${form.unit_type.includes("air") ? 15000 : 0}`,
      "",
    );
    unitIndex++;
  }

  const missionText = lines.join("\r\n");

  // Attempt to write directly to Sea Power StreamingAssets if directory exists
  const targetDir =
    "s:\\SteamLibrary\\steamapps\\common\\Sea Power\\Sea Power_Data\\StreamingAssets\\user\\missions";
  const slugName = hex.id.replace(/[^a-z0-9]+/g, "-");
  const fileName = `hex-battle-${slugName}-${randomUUID().slice(0, 8)}.ini`;
  const filePath = join(targetDir, fileName);

  try {
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(filePath, missionText, "utf-8");
  } catch {
    // If external path not writable, return text directly
  }

  return {
    ok: true,
    missionText,
    filePath,
    unitsCount: formations.length,
  };
}

export type RecruitFormationInput = {
  campaignId: string;
  unitType: FormationUnitType;
  customName?: string | undefined;
  hexId: string;
  side?: "blufor" | "opfor" | "neutral" | undefined;
  countryId?: string | undefined;
};

export type RecruitFormationResult = {
  ok: boolean;
  formation?: CampaignFormation;
  reason?: string;
};

export function recruitFormation(
  database: CampaignDatabase,
  input: RecruitFormationInput,
): RecruitFormationResult {
  const archetype = FORMATION_ARCHETYPES[input.unitType];
  if (!archetype) {
    return {
      ok: false,
      reason: `Unknown formation unit archetype: ${input.unitType}`,
    };
  }

  // 1. Check target hex
  const hexCellRow = database
    .prepare(
      `SELECT * FROM campaign_hex_cells WHERE campaign_id = ? AND hex_id = ?`,
    )
    .get(input.campaignId, input.hexId) as
    | {
        hex_id: string;
        side: "blufor" | "opfor" | "neutral";
        country_id: string;
        contested: number;
        damaged_base: number;
      }
    | undefined;

  const hexDef = getHexCellDefinition(input.hexId);
  const side = input.side ?? hexCellRow?.side ?? hexDef.ownership.side;
  const countryId =
    input.countryId ?? hexCellRow?.country_id ?? hexDef.ownership.countryId;

  const currentHexSide = hexCellRow?.side ?? hexDef.ownership.side;
  if (currentHexSide !== side) {
    return {
      ok: false,
      reason: `Cannot recruit formation in non-allied sector (Held by: ${currentHexSide.toUpperCase()}).`,
    };
  }

  // 2. Validate terrain & facilities
  if (archetype.domain === "air") {
    if (!hexDef.facilities.includes("air_base")) {
      return {
        ok: false,
        reason: `Air wings require an operational Air Base facility (none present at ${hexDef.name}).`,
      };
    }
  } else if (archetype.domain === "naval") {
    const hasNavalPort =
      hexDef.facilities.includes("naval_base") ||
      hexDef.facilities.includes("shipyard");
    if (
      !hasNavalPort &&
      !isWaterTerrain(hexDef.terrain) &&
      hexDef.terrain !== "island"
    ) {
      return {
        ok: false,
        reason: `Naval task groups require a Naval Base, Shipyard, or maritime sector (none present at ${hexDef.name}).`,
      };
    }
  } else if (archetype.domain === "ground") {
    if (isWaterTerrain(hexDef.terrain)) {
      return {
        ok: false,
        reason: `Ground divisions cannot be recruited directly in open water sectors.`,
      };
    }
  }

  // 3. Economy checks
  const econ = database
    .prepare(
      `SELECT funds, production_points, fuel_stockpile FROM campaign_economy WHERE campaign_id = ?`,
    )
    .get(input.campaignId) as
    | { funds: number; production_points: number; fuel_stockpile: number }
    | undefined;

  const funds = econ?.funds ?? 0;
  const prod = econ?.production_points ?? 0;

  if (funds < archetype.fundsCost) {
    return {
      ok: false,
      reason: `Insufficient Treasury funds ($${funds} available, $${archetype.fundsCost} required).`,
    };
  }

  if (prod < archetype.productionCost) {
    return {
      ok: false,
      reason: `Insufficient Production capacity (${prod} P available, ${archetype.productionCost} P required).`,
    };
  }

  // 4. Deduct costs and insert formation in a transaction
  const formId = `${input.campaignId}:form:rec-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`;
  const formationName =
    input.customName?.trim() ||
    `${countryId.toUpperCase()} ${archetype.displayName}`;

  const recruitTx = database.transaction(() => {
    database
      .prepare(
        `UPDATE campaign_economy
         SET funds = funds - ?,
             production_points = production_points - ?,
             updated_at = ?
         WHERE campaign_id = ?`,
      )
      .run(
        archetype.fundsCost,
        archetype.productionCost,
        new Date().toISOString(),
        input.campaignId,
      );

    database
      .prepare(
        `INSERT INTO campaign_formations (
           id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        formId,
        input.campaignId,
        formationName,
        input.unitType,
        side,
        countryId,
        input.hexId,
        archetype.defaultStrength,
        archetype.maxActionPoints,
        archetype.maxActionPoints,
        "ready",
        JSON.stringify({ recruitedAt: new Date().toISOString() }),
        new Date().toISOString(),
        new Date().toISOString(),
      );
  });

  recruitTx();

  const newFormRow = database
    .prepare(
      `SELECT id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, embarked_on_id, metadata_json, created_at, updated_at FROM campaign_formations WHERE id = ?`,
    )
    .get(formId) as {
    id: string;
    campaign_id: string;
    name: string;
    unit_type: FormationUnitType;
    side: "blufor" | "opfor" | "unaligned";
    country_id: string;
    hex_id: string;
    strength: number;
    action_points: number;
    max_action_points: number;
    status: string;
    embarked_on_id: string | null;
    metadata_json: string;
    created_at: string;
    updated_at: string;
  };

  return {
    ok: true,
    formation: hydrateCampaignFormation(
      newFormRow,
      newFormRow.campaign_id,
      jsonParse(newFormRow.metadata_json),
    ),
  };
}

export function updateFormationComposition(
  database: CampaignDatabase,
  campaignId: string,
  formationId: string,
  updates: {
    name?: string | undefined;
    customComposition?: FlotillaComposition | undefined;
    playerCountryId?: string | undefined;
  },
):
  | {
      ok: true;
      formation: CampaignFormation;
      fundsRemaining?: number | undefined;
      deltaFunds?: number | undefined;
    }
  | {
      ok: false;
      error: string;
    } {
  const row = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, embarked_on_id, status, metadata_json
       FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
    )
    .get(campaignId, formationId) as
    | {
        id: string;
        name: string;
        unit_type: FormationUnitType;
        side: "blufor" | "opfor" | "neutral" | "unaligned";
        country_id: string;
        hex_id: string;
        strength: number;
        action_points: number;
        max_action_points: number;
        embarked_on_id: string | null;
        status: string;
        metadata_json: string;
      }
    | undefined;

  if (!row) {
    return { ok: false, error: "Formation not found in active campaign." };
  }
  if (updates.playerCountryId && row.country_id !== updates.playerCountryId) {
    return {
      ok: false,
      error:
        "Allied NATO formation rosters cannot be modified by national command.",
    };
  }

  const currentMetadata = jsonParse<Record<string, unknown>>(row.metadata_json);
  const newName = updates.name?.trim() || row.name;
  const side = (row.side === "unaligned" ? "neutral" : row.side) as
    "blufor" | "opfor" | "neutral";

  // Calculate prior composition cost vs new composition cost
  const oldComp =
    (currentMetadata.composition as FlotillaComposition | undefined) ??
    getFlotillaComposition(row.unit_type, row.country_id, side);
  const oldCost = calculateCompositionCost(oldComp.units).totalFunds;

  let composition = currentMetadata.composition as
    FlotillaComposition | undefined;
  let newCost = oldCost;

  if (updates.customComposition) {
    const totals = recalculateCompositionTotals(
      updates.customComposition.units,
    );
    composition = {
      ...updates.customComposition,
      totalVessels: totals.totalVessels,
      totalSubmarines: totals.totalSubmarines,
      totalAircraft: totals.totalAircraft,
      totalVehicles: totals.totalVehicles,
    };
    currentMetadata.composition = composition;
    newCost = calculateCompositionCost(
      updates.customComposition.units,
    ).totalFunds;
  }

  const deltaFunds = newCost - oldCost;

  // If modifying a BLUFOR fleet with net positive cost, check treasury funds
  const econRow = database
    .prepare(
      `SELECT funds, production_points, fuel_stockpile FROM campaign_economy WHERE campaign_id = ?`,
    )
    .get(campaignId) as
    | { funds: number; production_points: number; fuel_stockpile: number }
    | undefined;

  const currentFunds = econRow?.funds ?? 1000;
  if (side === "blufor" && deltaFunds > 0 && currentFunds < deltaFunds) {
    return {
      ok: false,
      error: `Insufficient funds: Flotilla modifications require $${deltaFunds}, but current national treasury only has $${currentFunds}.`,
    };
  }

  const updatedMetadataJson = JSON.stringify(currentMetadata);
  const nowIso = new Date().toISOString();

  database.transaction(() => {
    database
      .prepare(
        `UPDATE campaign_formations
         SET name = ?, metadata_json = ?, updated_at = ?
         WHERE campaign_id = ? AND id = ?`,
      )
      .run(newName, updatedMetadataJson, nowIso, campaignId, formationId);

    if (side === "blufor" && deltaFunds !== 0 && econRow) {
      database
        .prepare(
          `UPDATE campaign_economy
           SET funds = funds - ?, updated_at = ?
           WHERE campaign_id = ?`,
        )
        .run(deltaFunds, nowIso, campaignId);
    }
  })();

  const fundsRemaining = currentFunds - (side === "blufor" ? deltaFunds : 0);

  const updatedFormation = hydrateCampaignFormation(
    {
      ...row,
      name: newName,
    },
    campaignId,
    currentMetadata,
  );

  return { ok: true, formation: updatedFormation, fundsRemaining, deltaFunds };
}

export type StrategicHexTurnEvent = {
  kind:
    | "hex_captured"
    | "hex_contested"
    | "hex_liberated"
    | "market_delivered"
    | "treaty_expired"
    | "tension_escalated"
    | "ai_command_executed";
  summary: string;
};

export function processTurnStrategicHexesUpdate(
  database: CampaignDatabase,
  campaignId: string,
): StrategicHexTurnEvent[] {
  const events: StrategicHexTurnEvent[] = [];
  const now = new Date().toISOString();

  const playerRow = database
    .prepare(
      "SELECT country_id FROM campaign_players WHERE campaign_id = ? LIMIT 1",
    )
    .get(campaignId) as { country_id: string } | undefined;
  const playerCountryId = playerRow?.country_id || "norway";

  // 1. Process Hex Capture & Contested Mechanics
  const hexState = getCampaignHexState(database, campaignId);
  const formationsByHex = new Map<string, CampaignFormation[]>();
  for (const form of hexState.formations) {
    if (form.status === "depleted") continue;
    const list = formationsByHex.get(form.hexId) ?? [];
    list.push(form);
    formationsByHex.set(form.hexId, list);
  }

  for (const cell of hexState.hexCells) {
    const presentFormations = formationsByHex.get(cell.id) ?? [];
    const nonAirFormations = presentFormations.filter(
      (f) =>
        f.unitType !== "tactical_fighter_wing" &&
        f.unitType !== "maritime_strike_squadron" &&
        f.unitType !== "airlift_transport_wing",
    );

    const bluforUnits = nonAirFormations.filter((f) => f.side === "blufor");
    const opforUnits = nonAirFormations.filter((f) => f.side === "opfor");

    const currentOwnerSide = cell.ownership.side;
    const currentCountryId = cell.ownership.countryId;
    let newContested = cell.status === "contested" ? 1 : 0;
    let newCaptureCounter = cell.captureTurnsCounter ?? 0;
    let newOccupyingSide = cell.occupyingSide;
    let newOccupyingCountry = cell.occupyingCountryId;
    let newOwnerSide = currentOwnerSide;
    let newOwnerCountry = currentCountryId;

    // Both sides present -> Contested
    if (bluforUnits.length > 0 && opforUnits.length > 0) {
      newContested = 1;
      newCaptureCounter = 0;
      if (cell.status !== "contested") {
        events.push({
          kind: "hex_contested",
          summary: `Sector ${cell.name} (${cell.id}) has become contested between BLUFOR and OPFOR forces!`,
        });
      }
    }
    // Only enemy ground/naval units present in territory owned by opponent
    else if (
      (currentOwnerSide === "blufor" &&
        opforUnits.length > 0 &&
        bluforUnits.length === 0) ||
      (currentOwnerSide === "opfor" &&
        bluforUnits.length > 0 &&
        opforUnits.length === 0)
    ) {
      const occupierSide = opforUnits.length > 0 ? "opfor" : "blufor";
      const occupierCountry =
        opforUnits.length > 0
          ? (opforUnits[0]?.countryId ?? "soviet-union")
          : (bluforUnits[0]?.countryId ?? "norway");

      newOccupyingSide = occupierSide;
      newOccupyingCountry = occupierCountry;
      newCaptureCounter = (cell.captureTurnsCounter ?? 0) + 1;

      if (newCaptureCounter >= 5) {
        newOwnerSide = occupierSide;
        newOwnerCountry = occupierCountry;
        newContested = 0;
        newCaptureCounter = 0;
        events.push({
          kind: "hex_captured",
          summary: `Sector ${cell.name} (${cell.id}) was captured by ${occupierCountry} after 5 turns of occupation!`,
        });
      }
    }
    // Only friendly units present in previously contested territory -> Liberated
    else if (
      (currentOwnerSide === "blufor" &&
        bluforUnits.length > 0 &&
        opforUnits.length === 0 &&
        cell.status === "contested") ||
      (currentOwnerSide === "opfor" &&
        opforUnits.length > 0 &&
        bluforUnits.length === 0 &&
        cell.status === "contested")
    ) {
      newContested = 0;
      newCaptureCounter = 0;
      events.push({
        kind: "hex_liberated",
        summary: `Sector ${cell.name} (${cell.id}) has been liberated from contested status.`,
      });
    }

    // Save changes to campaign_hex_cells
    database
      .prepare(
        `INSERT INTO campaign_hex_cells (
          campaign_id, hex_id, side, country_id, contested, capture_turns_counter, occupying_side, occupying_country_id, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(campaign_id, hex_id) DO UPDATE SET
          side = excluded.side,
          country_id = excluded.country_id,
          contested = excluded.contested,
          capture_turns_counter = excluded.capture_turns_counter,
          occupying_side = excluded.occupying_side,
          occupying_country_id = excluded.occupying_country_id,
          updated_at = excluded.updated_at`,
      )
      .run(
        campaignId,
        cell.id,
        newOwnerSide,
        newOwnerCountry,
        newContested,
        newCaptureCounter,
        newOccupyingSide ?? null,
        newOccupyingCountry ?? null,
        now,
        now,
      );
  }

  // 2. Process Pending Military Market Orders
  const pendingOrders = database
    .prepare(
      `SELECT id, unit_name, unit_type, country_id, target_hex_id, cost_funds, delivery_turn, turns_remaining
       FROM military_market_orders
       WHERE campaign_id = ? AND status = 'pending'`,
    )
    .all(campaignId) as Array<{
    id: string;
    unit_name: string;
    unit_type: FormationUnitType;
    country_id: string;
    target_hex_id: string;
    cost_funds: number;
    delivery_turn: number;
    turns_remaining: number;
  }>;

  for (const order of pendingOrders) {
    const nextTurns = order.turns_remaining - 1;
    if (nextTurns <= 0) {
      database
        .prepare(
          `UPDATE military_market_orders SET status = 'delivered', turns_remaining = 0, updated_at = ? WHERE id = ?`,
        )
        .run(now, order.id);

      // Spawn the purchased unit formation
      const formationId = randomUUID();
      const side =
        order.country_id === "soviet-union" ||
        order.country_id === "east-germany" ||
        order.country_id === "poland"
          ? "opfor"
          : "blufor";

      const archetype =
        FORMATION_ARCHETYPES[order.unit_type] ??
        FORMATION_ARCHETYPES.surface_action_group;
      const initialMetadata = {
        morale: 80,
        experience: 50,
        fuelLevel: 90,
        ammoLevel: 90,
        veterancyRank: "regular",
        composition: {
          totalVessels: 1,
          totalSubmarines: order.unit_type === "submarine_squadron" ? 1 : 0,
          totalAircraft:
            order.unit_type === "tactical_fighter_wing" ||
            order.unit_type === "maritime_strike_squadron"
              ? 2
              : 0,
          totalVehicles: 0,
          units: [
            { className: order.unit_name, role: "Surplus Asset", count: 1 },
          ],
        },
      };

      database
        .prepare(
          `INSERT INTO campaign_formations (
            id, campaign_id, name, unit_type, side, country_id, hex_id, strength, action_points, max_action_points, status, metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          formationId,
          campaignId,
          order.unit_name,
          order.unit_type,
          side,
          order.country_id,
          order.target_hex_id,
          80,
          archetype.maxActionPoints,
          archetype.maxActionPoints,
          "ready",
          JSON.stringify(initialMetadata),
          now,
          now,
        );

      events.push({
        kind: "market_delivered",
        summary: `Delivered military surplus unit: ${order.unit_name} to sector ${order.target_hex_id}.`,
      });
    } else {
      database
        .prepare(
          `UPDATE military_market_orders SET turns_remaining = ?, updated_at = ? WHERE id = ?`,
        )
        .run(nextTurns, now, order.id);
    }
  }

  // 3. Process Diplomatic Treaties Expiration
  const treaties = database
    .prepare(
      `SELECT id, treaty_type, party_a_country_id, party_b_country_id, turns_remaining
       FROM diplomatic_treaties
       WHERE campaign_id = ? AND turns_remaining > 0`,
    )
    .all(campaignId) as Array<{
    id: string;
    treaty_type: string;
    party_a_country_id: string;
    party_b_country_id: string;
    turns_remaining: number;
  }>;

  for (const treaty of treaties) {
    const nextTurns = treaty.turns_remaining - 1;
    database
      .prepare(
        `UPDATE diplomatic_treaties SET turns_remaining = ?, updated_at = ? WHERE id = ?`,
      )
      .run(nextTurns, now, treaty.id);

    // Apply economic and industrial dividends if treaty involves player
    if (
      treaty.party_a_country_id === playerCountryId ||
      treaty.party_b_country_id === playerCountryId
    ) {
      if (treaty.treaty_type === "trade_agreement") {
        database
          .prepare(
            `UPDATE campaign_economy SET funds = funds + 40, updated_at = ? WHERE campaign_id = ?`,
          )
          .run(now, campaignId);
      } else if (treaty.treaty_type === "joint_production_pact") {
        database
          .prepare(
            `UPDATE campaign_economy SET production_points = production_points + 25, updated_at = ? WHERE campaign_id = ?`,
          )
          .run(now, campaignId);
      }
    }

    if (nextTurns <= 0) {
      events.push({
        kind: "treaty_expired",
        summary: `Diplomatic treaty (${treaty.treaty_type}) between ${treaty.party_a_country_id} and ${treaty.party_b_country_id} has expired.`,
      });
    }
  }

  // 3b. Autonomous AI Diplomacy & World Press Dispatches
  try {
    processAutonomousAiDiplomacy(database, campaignId);
  } catch {
    // Autonomous diplomacy fallback
  }

  // 4. Escalation & Anti-Stalemate Tension Step
  const tension = getCampaignTension(database, campaignId);
  const nextPeace = tension.peaceTurnsCounter + 1;
  if (nextPeace >= 3) {
    const tensionDelta = 10;
    const nextTension = Math.min(100, tension.tensionIndex + tensionDelta);
    adjustCampaignTension(
      database,
      campaignId,
      tensionDelta,
      `Protracted diplomatic standoff: global military tension escalated to DEFCON ${calculateDefcon(nextTension)}.`,
    );
    events.push({
      kind: "tension_escalated",
      summary: `Global Cold War tension climbed to DEFCON ${calculateDefcon(nextTension)} due to ongoing military standoff.`,
    });
  } else {
    database
      .prepare(
        `UPDATE campaign_tensions SET peace_turns_counter = ?, updated_at = ? WHERE campaign_id = ?`,
      )
      .run(nextPeace, now, campaignId);
  }

  // 5. Process AI Strategic Commander Decisions
  const aiOrders = processAiStrategicTurns(
    database,
    campaignId,
    playerCountryId,
  );
  for (const order of aiOrders) {
    events.push({
      kind: "ai_command_executed",
      summary: order.summary,
    });
  }

  return events;
}

function jsonParse<T>(val: string): T {
  try {
    return JSON.parse(val) as T;
  } catch {
    return {} as T;
  }
}
