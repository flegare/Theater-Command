import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CampaignDatabase } from "../infrastructure/database.js";
import {
  getAllBalticCoreHexCells,
  getHexCellDefinition,
  getHexNeighbors,
  getAxialDistance,
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
import { processAutonomousCountryTurns } from "../domain/aiStrategicCommander.js";
import {
  calculatePlayerVisibilityMatrix,
  filterFormationsByVisibility,
  type HexVisibilityMatrix,
  type FilteredCampaignFormation,
} from "../domain/fogOfWar.js";
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
  formations: (CampaignFormation | FilteredCampaignFormation)[];
  economy: {
    funds: number;
    productionPoints: number;
    fuelStockpile: number;
    projectedDailyFundsDelta: number;
    projectedDailyProductionDelta: number;
    projectedDailyFuelDelta: number;
  };
  turnSummary: HexTurnEconomySummary;
  visibilityMatrix?: HexVisibilityMatrix | undefined;
  godModeActive?: boolean | undefined;
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
      id: `${campaignId}:form:nor-kobben-sub`,
      name: "KNM Kobben Submarine Squadron (S318)",
      unitType: "submarine_squadron",
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
  options?: {
    godMode?: boolean;
    filterFogOfWar?: boolean;
  },
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

  // 5. Fog of War and Sensor Visibility
  let visibilityMatrix: HexVisibilityMatrix | undefined;
  let returnedFormations: (CampaignFormation | FilteredCampaignFormation)[] =
    formations;

  try {
    visibilityMatrix = calculatePlayerVisibilityMatrix(
      database,
      campaignId,
      playerCountryId,
    );

    if (options?.filterFogOfWar) {
      const alliedCountries = new Set<string>([playerCountryId]);
      if (
        playerCountryId === "norway" ||
        playerCountryId === "united-states" ||
        playerCountryId === "united-kingdom" ||
        playerCountryId === "denmark" ||
        playerCountryId === "west-germany"
      ) {
        alliedCountries.add("norway");
        alliedCountries.add("united-states");
        alliedCountries.add("united-kingdom");
        alliedCountries.add("denmark");
        alliedCountries.add("west-germany");
      }

      returnedFormations = filterFormationsByVisibility(
        formations,
        visibilityMatrix,
        playerCountryId,
        alliedCountries,
        Boolean(options?.godMode),
      );
    }
  } catch {
    // Fallback if FoW tables or schema unmigrated
  }

  return {
    hexCells: coreCells,
    formations: returnedFormations,
    economy: {
      funds,
      productionPoints,
      fuelStockpile,
      projectedDailyFundsDelta: turnSummary.netFundsDelta,
      projectedDailyProductionDelta: turnSummary.netProductionDelta,
      projectedDailyFuelDelta: turnSummary.netFuelDelta,
    },
    turnSummary,
    visibilityMatrix,
    godModeActive: Boolean(options?.godMode),
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

export type GeneratedHexUnitSummary = {
  name: string;
  type: string;
  domain: string;
  count: number;
};

export type GenerateSeaPowerHexBattleResult = {
  ok: boolean;
  missionText: string;
  filePath?: string | undefined;
  fileName: string;
  unitsCount: number;
  bluforUnits: GeneratedHexUnitSummary[];
  opforUnits: GeneratedHexUnitSummary[];
};

export function generateSeaPowerHexBattle(
  database: CampaignDatabase,
  input: { campaignId: string; hexId: string; missionTitle?: string },
): GenerateSeaPowerHexBattleResult {
  const hex = getHexCellDefinition(input.hexId);
  const formations = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, strength, metadata_json FROM campaign_formations
       WHERE campaign_id = ? AND hex_id = ? AND status != 'depleted'`,
    )
    .all(input.campaignId, input.hexId) as Array<{
    id: string;
    name: string;
    unit_type: FormationUnitType;
    side: "blufor" | "opfor" | "neutral";
    country_id: string;
    strength: number;
    metadata_json: string | null;
  }>;

  const campaign = database
    .prepare(`SELECT name, campaign_time FROM campaigns WHERE id = ?`)
    .get(input.campaignId) as
    { name: string; campaign_time: string } | undefined;

  const missionDate = campaign?.campaign_time
    ? new Date(campaign.campaign_time)
    : new Date("1983-11-05T12:00:00Z");

  const title =
    input.missionTitle ??
    `Strategic Battle for ${hex.name} (${missionDate.toISOString().slice(0, 10)})`;

  const lat = hex.centroid[0];
  const lon = hex.centroid[1];

  const bluforUnits: GeneratedHexUnitSummary[] = [];
  const opforUnits: GeneratedHexUnitSummary[] = [];

  type MissionUnitEntry = {
    name: string;
    type: string;
    variant: string;
    nation: string;
    domain: "aircraft" | "vessel" | "land";
    relPosNm: string;
    heading: number;
    speed: number;
    altitude: number;
  };

  const tf1Units: MissionUnitEntry[] = [];
  const tf2Units: MissionUnitEntry[] = [];

  let tf1AirCount = 0;
  let tf1VesselCount = 0;
  let tf1LandCount = 0;
  let tf2AirCount = 0;
  let tf2VesselCount = 0;
  let tf2LandCount = 0;

  for (const form of formations) {
    const isBlue = form.side === "blufor";
    let compUnits: Array<{ name: string; classIniRef: string; count: number }> =
      [];
    if (form.metadata_json) {
      try {
        const parsed = JSON.parse(form.metadata_json);
        if (
          Array.isArray(parsed?.composition?.units) &&
          parsed.composition.units.length > 0
        ) {
          compUnits = parsed.composition.units;
        }
      } catch {
        // ignore
      }
    }

    if (compUnits.length === 0) {
      let defaultClass = isBlue ? "usaf_f-16a" : "wp_mig-25pd";
      if (form.unit_type === "surface_action_group") {
        defaultClass = isBlue ? "knm_oslo" : "wp_cor_grisha3";
      } else if (form.unit_type === "submarine_squadron") {
        defaultClass = isBlue ? "no_ss_kobben" : "wp_ssn_victor3";
      } else if (
        form.unit_type === "nato_armored_division" ||
        form.unit_type === "pact_tank_division" ||
        form.unit_type === "mechanized_infantry_division" ||
        form.unit_type === "marine_amphibious_brigade"
      ) {
        defaultClass = isBlue ? "land_m1_abrams" : "land_t80";
      }
      compUnits = [{ name: form.name, classIniRef: defaultClass, count: 4 }];
    }

    for (const unit of compUnits) {
      const cls = unit.classIniRef.toLowerCase();
      let domain: "aircraft" | "vessel" | "land" = "aircraft";
      if (
        cls.includes("mbt") ||
        cls.includes("t-72") ||
        cls.includes("t-55") ||
        cls.includes("t80") ||
        cls.includes("abrams") ||
        cls.includes("mlrs") ||
        cls.includes("launcher") ||
        cls.includes("zsu") ||
        cls.includes("land_")
      ) {
        domain = "land";
      } else if (
        cls.includes("cor_") ||
        cls.includes("ffg") ||
        cls.includes("ddg") ||
        cls.includes("cg_") ||
        cls.includes("oslo") ||
        cls.includes("grisha") ||
        cls.includes("sub") ||
        cls.includes("ssn") ||
        cls.includes("ss_") ||
        cls.includes("vessel")
      ) {
        domain = "vessel";
      } else {
        domain = "aircraft";
      }

      const summaryList = isBlue ? bluforUnits : opforUnits;
      summaryList.push({
        name: unit.name,
        type: unit.classIniRef,
        domain,
        count: unit.count,
      });

      if (isBlue) {
        const offsetIndex = tf1Units.length;
        const relPosNm = `${(-8 + (offsetIndex % 3) * 2).toFixed(2)},0,${(-8 + Math.floor(offsetIndex / 3) * 2).toFixed(2)}`;
        tf1Units.push({
          name: unit.name,
          type: unit.classIniRef,
          variant: "Default",
          nation: form.country_id === "norway" ? "Norway" : "UnitedStates",
          domain,
          relPosNm,
          heading: 45,
          speed: domain === "aircraft" ? 420 : domain === "vessel" ? 18 : 15,
          altitude: domain === "aircraft" ? 18000 : 0,
        });
        if (domain === "aircraft") tf1AirCount++;
        else if (domain === "vessel") tf1VesselCount++;
        else tf1LandCount++;
      } else {
        const offsetIndex = tf2Units.length;
        const relPosNm = `${(8 - (offsetIndex % 3) * 2).toFixed(2)},0,${(8 - Math.floor(offsetIndex / 3) * 2).toFixed(2)}`;
        tf2Units.push({
          name: unit.name,
          type: unit.classIniRef,
          variant: "Default",
          nation:
            form.country_id === "soviet-union" ? "SovietUnion" : "SovietUnion",
          domain,
          relPosNm,
          heading: 225,
          speed: domain === "aircraft" ? 450 : domain === "vessel" ? 18 : 15,
          altitude: domain === "aircraft" ? 20000 : 0,
        });
        if (domain === "aircraft") tf2AirCount++;
        else if (domain === "vessel") tf2VesselCount++;
        else tf2LandCount++;
      }
    }
  }

  // If one side has no units, add representative skirmish combatants
  if (tf1Units.length === 0) {
    tf1Units.push({
      name: "331 Skvadron F-16 Lead Flight",
      type: "usaf_f-16a",
      variant: "Default",
      nation: "Norway",
      domain: "aircraft",
      relPosNm: "-6.0,0,-6.0",
      heading: 45,
      speed: 420,
      altitude: 18000,
    });
    tf1AirCount = 1;
    bluforUnits.push({
      name: "F-16A Fighting Falcon",
      type: "usaf_f-16a",
      domain: "aircraft",
      count: 2,
    });
  }
  if (tf2Units.length === 0) {
    tf2Units.push({
      name: "174th Guards GvIAP MiG-25 Flight",
      type: "wp_mig-25pd",
      variant: "Default",
      nation: "SovietUnion",
      domain: "aircraft",
      relPosNm: "8.0,0,8.0",
      heading: 225,
      speed: 550,
      altitude: 24000,
    });
    tf2AirCount = 1;
    opforUnits.push({
      name: "MiG-25PD Foxbat Interceptor",
      type: "wp_mig-25pd",
      domain: "aircraft",
      count: 2,
    });
  }

  const lines: string[] = [
    "; Sea Power: Naval Combat in the Missile Age",
    `; Tactical Hex Battle Scenario: ${title}`,
    "; Generated by Sea Power Theater Command",
    "",
    "[Language_en]",
    `Name=${title}`,
    `Description=Strategic Battle for ${hex.name}. Neutralize all opposing hostile forces in this sector to secure operational control.`,
    "Objective_NeutralizeHostiles=Neutralize all hostile combatants in the sector",
    "",
    "[Environment]",
    `Date=${missionDate.getUTCFullYear()},${missionDate.getUTCMonth() + 1},${missionDate.getUTCDate()}`,
    `Time=${missionDate.getUTCHours()},${missionDate.getUTCMinutes()}`,
    "ConvertTimeToLocal=False",
    "SeaState=3",
    "Clouds=Scattered",
    "WindDirection=W",
    `MapCenterLatitude=${lat.toFixed(4)}`,
    `MapCenterLongitude=${lon.toFixed(4)}`,
    "LoadBackgroundData=False",
    "",
    "[Mission]",
    `Title=${title}`,
    "Difficulty=1",
    "AllowMoraleToAffectAI=True",
    "PlayerTaskforce=Taskforce1",
    "EnemyTaskforce=Taskforce2",
    `NumberOfTaskforce1Vessels=${tf1VesselCount}`,
    `NumberOfTaskforce1Aircraft=${tf1AirCount}`,
    `NumberOfTaskforce1LandUnits=${tf1LandCount}`,
    `NumberOfTaskforce2Vessels=${tf2VesselCount}`,
    `NumberOfTaskforce2Aircraft=${tf2AirCount}`,
    `NumberOfTaskforce2LandUnits=${tf2LandCount}`,
    "NumberOfTriggers=1",
    "",
    "[Taskforce1]",
    "Side=Allied",
    "TaskforceName=BLUFOR Combined Defense Force",
    "",
  ];

  let tf1A = 1;
  let tf1V = 1;
  let tf1L = 1;
  for (const u of tf1Units) {
    if (u.domain === "aircraft") {
      lines.push(
        `[Taskforce1Aircraft${tf1A}]`,
        `Name=${u.name}`,
        `Type=${u.type}`,
        `VariantReference=${u.variant}`,
        "SetSelected=True",
        `RelativePositionInNM=${u.relPosNm}`,
        `Heading=${u.heading}`,
        `Speed=${u.speed}`,
        `Altitude=${u.altitude}`,
        `Nation=${u.nation}`,
        "",
      );
      tf1A++;
    } else if (u.domain === "vessel") {
      lines.push(
        `[Taskforce1Vessel${tf1V}]`,
        `Name=${u.name}`,
        `Type=${u.type}`,
        `VariantReference=${u.variant}`,
        "SetSelected=True",
        `RelativePositionInNM=${u.relPosNm}`,
        `Heading=${u.heading}`,
        `Speed=${u.speed}`,
        `Nation=${u.nation}`,
        "",
      );
      tf1V++;
    } else {
      lines.push(
        `[Taskforce1LandUnit${tf1L}]`,
        `Name=${u.name}`,
        `Type=${u.type}`,
        `VariantReference=${u.variant}`,
        "SetSelected=True",
        `RelativePositionInNM=${u.relPosNm}`,
        `Heading=${u.heading}`,
        `Nation=${u.nation}`,
        "",
      );
      tf1L++;
    }
  }

  lines.push(
    "[Taskforce2]",
    "Side=Soviet",
    "TaskforceName=OPFOR Strike Group",
    "",
  );

  let tf2A = 1;
  let tf2V = 1;
  let tf2L = 1;
  for (const u of tf2Units) {
    if (u.domain === "aircraft") {
      lines.push(
        `[Taskforce2Aircraft${tf2A}]`,
        `Name=${u.name}`,
        `Type=${u.type}`,
        `VariantReference=${u.variant}`,
        `RelativePositionInNM=${u.relPosNm}`,
        `Heading=${u.heading}`,
        `Speed=${u.speed}`,
        `Altitude=${u.altitude}`,
        `Nation=${u.nation}`,
        "",
      );
      tf2A++;
    } else if (u.domain === "vessel") {
      lines.push(
        `[Taskforce2Vessel${tf2V}]`,
        `Name=${u.name}`,
        `Type=${u.type}`,
        `VariantReference=${u.variant}`,
        `RelativePositionInNM=${u.relPosNm}`,
        `Heading=${u.heading}`,
        `Speed=${u.speed}`,
        `Nation=${u.nation}`,
        "",
      );
      tf2V++;
    } else {
      lines.push(
        `[Taskforce2LandUnit${tf2L}]`,
        `Name=${u.name}`,
        `Type=${u.type}`,
        `VariantReference=${u.variant}`,
        `RelativePositionInNM=${u.relPosNm}`,
        `Heading=${u.heading}`,
        `Nation=${u.nation}`,
        "",
      );
      tf2L++;
    }
  }

  lines.push(
    "[Trigger1]",
    "Name=NeutralizeHostiles",
    "Description=Sector Clear",
    "Condition=TaskforceDestroyed(Taskforce2)",
    "Action=CompleteMission()",
    "",
  );

  const missionText = lines.join("\r\n");

  const targetDir =
    "s:\\SteamLibrary\\steamapps\\common\\Sea Power\\Sea Power_Data\\StreamingAssets\\user\\missions";
  const slugName = hex.id.replace(/[^a-z0-9]+/g, "-");
  const fileName = `hex-battle-${slugName}-${randomUUID().slice(0, 8)}.ini`;
  const filePath = join(targetDir, fileName);

  try {
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(filePath, missionText, "utf-8");
  } catch {
    // If external path not writable, continue
  }

  return {
    ok: true,
    missionText,
    filePath,
    fileName,
    unitsCount: formations.length,
    bluforUnits,
    opforUnits,
  };
}

export type ScrambleAirInterceptionInput = {
  campaignId: string;
  interceptorFormationId?: string;
  formationId?: string;
  targetHexId: string;
};

export type ScrambleAirInterceptionResult = {
  ok: boolean;
  message: string;
  interceptorName?: string | undefined;
  sourceHexId?: string | undefined;
  targetHexId?: string | undefined;
  distance?: number | undefined;
  actionPointsRemaining?: number | undefined;
  reason?: string | undefined;
  formation?:
    | {
        id: string;
        name: string;
        hexId: string;
        status: CampaignFormationStatus;
        actionPoints: number;
      }
    | undefined;
};

export function scrambleAirInterception(
  database: CampaignDatabase,
  input: ScrambleAirInterceptionInput,
): ScrambleAirInterceptionResult {
  const formId = input.interceptorFormationId ?? input.formationId;
  if (!formId) {
    return {
      ok: false,
      message: "Formation ID required.",
      reason: "Formation ID required.",
    };
  }

  const formation = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, hex_id, action_points, max_action_points,
              strength, status, metadata_json
       FROM campaign_formations
       WHERE campaign_id = ? AND id = ?`,
    )
    .get(input.campaignId, formId) as
    | {
        id: string;
        name: string;
        unit_type: FormationUnitType;
        side: "blufor" | "opfor" | "neutral";
        country_id: string;
        hex_id: string;
        action_points: number;
        max_action_points: number;
        strength: number;
        status: CampaignFormationStatus;
        metadata_json: string | null;
      }
    | undefined;

  if (!formation) {
    return {
      ok: false,
      message: "Formation not found.",
      reason: "Formation not found.",
    };
  }

  if (formation.status === "depleted") {
    return {
      ok: false,
      message: `${formation.name} is depleted and cannot scramble.`,
      reason: "Formation depleted.",
    };
  }

  if (
    formation.status === "embarked" ||
    formation.status === "embarking" ||
    formation.status === "disembarking"
  ) {
    return {
      ok: false,
      message: `Cannot scramble air interception while ${formation.status}.`,
      reason: `Formation is ${formation.status}.`,
    };
  }

  if (formation.action_points < 1) {
    return {
      ok: false,
      message: `${formation.name} has no remaining Action Points (0 AP) for a combat scramble this turn.`,
      reason: "Insufficient Action Points (0 AP).",
    };
  }

  const archetype = FORMATION_ARCHETYPES[formation.unit_type];
  let isAirAsset =
    archetype?.domain === "air" ||
    formation.unit_type.includes("air") ||
    formation.unit_type.includes("fighter");

  if (!isAirAsset && formation.metadata_json) {
    try {
      const comp = JSON.parse(formation.metadata_json)?.composition;
      if (
        comp?.totalAircraft > 0 ||
        (Array.isArray(comp?.units) &&
          comp.units.some((u: { classIniRef?: string }) =>
            Boolean(
              u.classIniRef &&
              /f-16|f-15|f-5|mig|tu-22|draken|viggen/i.test(u.classIniRef),
            ),
          ))
      ) {
        isAirAsset = true;
      }
    } catch {
      // ignore
    }
  }

  if (!isAirAsset) {
    return {
      ok: false,
      message: `${formation.name} is not an aviation or interceptor asset capable of an aerial scramble.`,
      reason: "Non-aviation formation.",
    };
  }

  const sourceHex = getHexCellDefinition(formation.hex_id);
  const targetHex = getHexCellDefinition(input.targetHexId);
  const distance = getAxialDistance(sourceHex.axial, targetHex.axial);

  if (distance > 3) {
    return {
      ok: false,
      message: `Target sector ${targetHex.name} is beyond maximum combat scramble radius (3 hexes / ~900km). Distance: ${distance} hexes.`,
      reason: `Distance (${distance} hexes) exceeds maximum scramble range (3 hexes).`,
    };
  }

  const now = new Date().toISOString();
  const newAP = formation.action_points - 1;

  database
    .prepare(
      `UPDATE campaign_formations
       SET hex_id = ?,
           action_points = ?,
           status = 'engaged',
           updated_at = ?
       WHERE campaign_id = ? AND id = ?`,
    )
    .run(input.targetHexId, newAP, now, input.campaignId, formation.id);

  // Check if target sector has hostile units
  const hostileFormations = database
    .prepare(
      `SELECT id, name FROM campaign_formations
       WHERE campaign_id = ? AND hex_id = ? AND side != ? AND status != 'depleted'`,
    )
    .all(input.campaignId, input.targetHexId, formation.side) as Array<{
    id: string;
    name: string;
  }>;

  if (hostileFormations.length > 0) {
    database
      .prepare(
        `UPDATE campaign_hex_cells SET contested = 1 WHERE campaign_id = ? AND hex_id = ?`,
      )
      .run(input.campaignId, input.targetHexId);

    database
      .prepare(
        `UPDATE campaign_formations
         SET status = 'engaged', updated_at = ?
         WHERE campaign_id = ? AND hex_id = ? AND side != ? AND status != 'depleted'`,
      )
      .run(now, input.campaignId, input.targetHexId, formation.side);
  }

  return {
    ok: true,
    interceptorName: formation.name,
    sourceHexId: formation.hex_id,
    targetHexId: input.targetHexId,
    distance,
    actionPointsRemaining: newAP,
    formation: {
      id: formation.id,
      name: formation.name,
      hexId: input.targetHexId,
      status: "engaged",
      actionPoints: newAP,
    },
    message: `⚡ SCRAMBLE LAUNCHED: ${formation.name} intercepted sector ${targetHex.name}! ${hostileFormations.length > 0 ? "Engaged hostile forces en route." : "Sector patrolled."}`,
  };
}

export type HexAutoCombatResult = {
  ok: boolean;
  victory: "blufor" | "opfor" | "stalemate";
  title: string;
  summary: string;
  bluforCasualtiesPct: number;
  opforCasualtiesPct: number;
  bluforAmmoExpended: number;
  opforAmmoExpended: number;
  retreatedFormations: Array<{ id: string; name: string; toHexId: string }>;
  hexLiberated: boolean;
  contested: boolean;
  reason?: string | undefined;
};

export function resolveHexAutoCombat(
  database: CampaignDatabase,
  input: { campaignId: string; hexId: string },
): HexAutoCombatResult {
  const hex = getHexCellDefinition(input.hexId);
  const bluforFormations = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, strength, action_points, metadata_json
       FROM campaign_formations
       WHERE campaign_id = ? AND hex_id = ? AND side = 'blufor' AND status != 'depleted'`,
    )
    .all(input.campaignId, input.hexId) as Array<{
    id: string;
    name: string;
    unit_type: FormationUnitType;
    side: "blufor";
    country_id: string;
    strength: number;
    action_points: number;
    metadata_json: string | null;
  }>;

  const opforFormations = database
    .prepare(
      `SELECT id, name, unit_type, side, country_id, strength, action_points, metadata_json
       FROM campaign_formations
       WHERE campaign_id = ? AND hex_id = ? AND side = 'opfor' AND status != 'depleted'`,
    )
    .all(input.campaignId, input.hexId) as Array<{
    id: string;
    name: string;
    unit_type: FormationUnitType;
    side: "opfor";
    country_id: string;
    strength: number;
    action_points: number;
    metadata_json: string | null;
  }>;

  if (bluforFormations.length === 0 || opforFormations.length === 0) {
    return {
      ok: false,
      victory: "stalemate",
      title: `No Battle at ${hex.name}`,
      summary: "Sector does not contain opposing forces ready for combat.",
      bluforCasualtiesPct: 0,
      opforCasualtiesPct: 0,
      bluforAmmoExpended: 0,
      opforAmmoExpended: 0,
      retreatedFormations: [],
      hexLiberated: false,
      contested: false,
      reason: "No opposing formations found in hex.",
    };
  }

  type CombatUnitRecord = {
    strength: number;
    ammo_level: number;
    morale: number;
    unit_type: FormationUnitType;
    veterancy_rank: string;
    metadata: Record<string, unknown>;
  };

  const parseCombatRecord = (f: {
    strength: number;
    unit_type: FormationUnitType;
    country_id: string;
    metadata_json: string | null;
  }): CombatUnitRecord => {
    const meta = jsonParse<Record<string, unknown>>(f.metadata_json ?? "{}");
    const ammo_level =
      typeof meta.ammoLevel === "number" ? meta.ammoLevel : 100;
    const morale = typeof meta.morale === "number" ? meta.morale : 100;
    const experience =
      typeof meta.experience === "number"
        ? meta.experience
        : f.country_id === "united-states" || f.country_id === "soviet-union"
          ? 65
          : 40;
    const veterancy_rank =
      typeof meta.rank === "string"
        ? meta.rank
        : calculateVeterancyRank(experience);
    return {
      strength: f.strength,
      ammo_level,
      morale,
      unit_type: f.unit_type,
      veterancy_rank,
      metadata: meta,
    };
  };

  const calcPower = (forms: CombatUnitRecord[]): number => {
    let power = 0;
    for (const f of forms) {
      const vRank = f.veterancy_rank.toLowerCase();
      const rankMult =
        vRank === "elite"
          ? 1.5
          : vRank === "veteran"
            ? 1.25
            : vRank === "green"
              ? 0.8
              : 1.0;
      const ammoMult = Math.max(0.2, f.ammo_level / 100);
      const moraleMult = 0.5 + 0.5 * (f.morale / 100);
      const strengthMult = f.strength / 100;
      const archetype = FORMATION_ARCHETYPES[f.unit_type];
      const domainWeight =
        archetype?.domain === "air"
          ? 1.3
          : archetype?.domain === "ground"
            ? 1.2
            : 1.1;
      power +=
        strengthMult * rankMult * ammoMult * moraleMult * domainWeight * 100;
    }
    return Math.max(1, power);
  };

  const bluforRecords = bluforFormations.map(parseCombatRecord);
  const opforRecords = opforFormations.map(parseCombatRecord);

  const bluforPower = calcPower(bluforRecords);
  const opforPower = calcPower(opforRecords);
  const odds = bluforPower / opforPower;

  let victory: "blufor" | "opfor" | "stalemate" = "stalemate";
  let bluforCasualtiesPct = 25;
  let opforCasualtiesPct = 25;

  if (odds >= 1.35) {
    victory = "blufor";
    opforCasualtiesPct = Math.min(85, Math.round(45 * odds));
    bluforCasualtiesPct = Math.max(8, Math.round(25 / odds));
  } else if (odds <= 0.74) {
    victory = "opfor";
    bluforCasualtiesPct = Math.min(85, Math.round(45 / odds));
    opforCasualtiesPct = Math.max(8, Math.round(25 * odds));
  } else {
    victory = "stalemate";
    bluforCasualtiesPct = 28;
    opforCasualtiesPct = 28;
  }

  const now = new Date().toISOString();
  const retreatedFormations: Array<{
    id: string;
    name: string;
    toHexId: string;
  }> = [];

  // Apply damage & update BLUFOR
  for (let i = 0; i < bluforFormations.length; i++) {
    const f = bluforFormations[i];
    const rec = bluforRecords[i];
    if (!f || !rec) continue;
    const newStr = Math.max(0, f.strength - bluforCasualtiesPct);
    const newAmmo = Math.max(0, rec.ammo_level - 25);
    const currFuel =
      typeof rec.metadata.fuelCurrent === "number"
        ? rec.metadata.fuelCurrent
        : 100;
    const newFuel = Math.max(0, currFuel - 10);
    const newMorale =
      victory === "blufor"
        ? Math.min(100, rec.morale + 12)
        : Math.max(20, rec.morale - 25);
    const currXP =
      typeof rec.metadata.experience === "number"
        ? rec.metadata.experience
        : 40;
    const newXP = currXP + (victory === "blufor" ? 18 : 6);
    const newRank = calculateVeterancyRank(newXP);
    const newStatus =
      newStr <= 0
        ? "depleted"
        : victory === "blufor"
          ? "ready"
          : victory === "opfor"
            ? "ready"
            : "engaged";

    const updatedMeta = {
      ...rec.metadata,
      ammoLevel: newAmmo,
      fuelCurrent: newFuel,
      morale: newMorale,
      experience: newXP,
      rank: newRank,
    };

    database
      .prepare(
        `UPDATE campaign_formations
         SET strength = ?, status = ?, metadata_json = ?, updated_at = ?
         WHERE campaign_id = ? AND id = ?`,
      )
      .run(
        newStr,
        newStatus,
        JSON.stringify(updatedMeta),
        now,
        input.campaignId,
        f.id,
      );
  }

  // Apply damage & update OPFOR
  for (let i = 0; i < opforFormations.length; i++) {
    const f = opforFormations[i];
    const rec = opforRecords[i];
    if (!f || !rec) continue;
    const newStr = Math.max(0, f.strength - opforCasualtiesPct);
    const newAmmo = Math.max(0, rec.ammo_level - 25);
    const currFuel =
      typeof rec.metadata.fuelCurrent === "number"
        ? rec.metadata.fuelCurrent
        : 100;
    const newFuel = Math.max(0, currFuel - 10);
    const newMorale =
      victory === "opfor"
        ? Math.min(100, rec.morale + 12)
        : Math.max(20, rec.morale - 25);
    const currXP =
      typeof rec.metadata.experience === "number"
        ? rec.metadata.experience
        : 40;
    const newXP = currXP + (victory === "opfor" ? 18 : 6);
    const newRank = calculateVeterancyRank(newXP);
    const newStatus =
      newStr <= 0
        ? "depleted"
        : victory === "opfor"
          ? "ready"
          : victory === "blufor"
            ? "ready"
            : "engaged";

    const updatedMeta = {
      ...rec.metadata,
      ammoLevel: newAmmo,
      fuelCurrent: newFuel,
      morale: newMorale,
      experience: newXP,
      rank: newRank,
    };

    database
      .prepare(
        `UPDATE campaign_formations
         SET strength = ?, status = ?, metadata_json = ?, updated_at = ?
         WHERE campaign_id = ? AND id = ?`,
      )
      .run(
        newStr,
        newStatus,
        JSON.stringify(updatedMeta),
        now,
        input.campaignId,
        f.id,
      );
  }

  // Retreat handling
  let hexLiberated = false;
  let contested = true;

  const neighbors = getHexNeighbors(hex);

  if (victory === "blufor") {
    // Surviving OPFOR retreat to adjacent friendly or neutral hex
    const retreatCandidate =
      neighbors.find((n) => n.ownership.side !== "blufor") ?? neighbors[0];
    for (const f of opforFormations) {
      if (f.strength - opforCasualtiesPct > 0 && retreatCandidate) {
        database
          .prepare(
            `UPDATE campaign_formations SET hex_id = ?, status = 'ready', updated_at = ? WHERE id = ?`,
          )
          .run(retreatCandidate.id, now, f.id);
        retreatedFormations.push({
          id: f.id,
          name: f.name,
          toHexId: retreatCandidate.id,
        });
      }
    }

    const playerCountry = bluforFormations[0]?.country_id ?? "norway";
    database
      .prepare(
        `UPDATE campaign_hex_cells
         SET side = 'blufor', country_id = ?, contested = 0
         WHERE campaign_id = ? AND hex_id = ?`,
      )
      .run(playerCountry, input.campaignId, input.hexId);

    hexLiberated = true;
    contested = false;
  } else if (victory === "opfor") {
    // Surviving BLUFOR retreat to adjacent friendly hex
    const retreatCandidate =
      neighbors.find((n) => n.ownership.side === "blufor") ?? neighbors[0];
    for (const f of bluforFormations) {
      if (f.strength - bluforCasualtiesPct > 0 && retreatCandidate) {
        database
          .prepare(
            `UPDATE campaign_formations SET hex_id = ?, status = 'ready', updated_at = ? WHERE id = ?`,
          )
          .run(retreatCandidate.id, now, f.id);
        retreatedFormations.push({
          id: f.id,
          name: f.name,
          toHexId: retreatCandidate.id,
        });
      }
    }

    const opforCountry = opforFormations[0]?.country_id ?? "soviet-union";
    database
      .prepare(
        `UPDATE campaign_hex_cells
         SET side = 'opfor', country_id = ?, contested = 0
         WHERE campaign_id = ? AND hex_id = ?`,
      )
      .run(opforCountry, input.campaignId, input.hexId);

    contested = false;
  } else {
    // Stalemate: remains contested
    database
      .prepare(
        `UPDATE campaign_hex_cells SET contested = 1 WHERE campaign_id = ? AND hex_id = ?`,
      )
      .run(input.campaignId, input.hexId);
    contested = true;
  }

  const summary =
    victory === "blufor"
      ? `🏆 DECISIVE BLUFOR VICTORY: Allied forces routed OPFOR in ${hex.name} (Losses: BLUFOR -${bluforCasualtiesPct}% / OPFOR -${opforCasualtiesPct}%). Surviving enemy units retreated. Sector secured!`
      : victory === "opfor"
        ? `💀 OPFOR REPULSE: Hostile strike forces overwhelmed defenses in ${hex.name} (Losses: BLUFOR -${bluforCasualtiesPct}% / OPFOR -${opforCasualtiesPct}%). Allied units retreated to friendly lines.`
        : `⚖️ INCONCLUSIVE SKIRMISH: Heavy combat in ${hex.name} resulted in mutual attrition (-${bluforCasualtiesPct}% casualties, -25% ammo). Hostile forces remain engaged.`;

  return {
    ok: true,
    victory,
    title: `Battle of ${hex.name}`,
    summary,
    bluforCasualtiesPct,
    opforCasualtiesPct,
    bluforAmmoExpended: 25,
    opforAmmoExpended: 25,
    retreatedFormations,
    hexLiberated,
    contested,
  };
}

export function resolveHexManualDebrief(
  database: CampaignDatabase,
  input: {
    campaignId: string;
    hexId: string;
    outcome: "blufor_victory" | "stalemate" | "opfor_victory";
  },
): HexAutoCombatResult {
  const hex = getHexCellDefinition(input.hexId);
  const now = new Date().toISOString();

  const bluforFormations = database
    .prepare(
      `SELECT id, name, strength, metadata_json, country_id FROM campaign_formations
       WHERE campaign_id = ? AND hex_id = ? AND side = 'blufor' AND status != 'depleted'`,
    )
    .all(input.campaignId, input.hexId) as Array<{
    id: string;
    name: string;
    strength: number;
    metadata_json: string | null;
    country_id: string;
  }>;

  const opforFormations = database
    .prepare(
      `SELECT id, name, strength, metadata_json, country_id FROM campaign_formations
       WHERE campaign_id = ? AND hex_id = ? AND side = 'opfor' AND status != 'depleted'`,
    )
    .all(input.campaignId, input.hexId) as Array<{
    id: string;
    name: string;
    strength: number;
    metadata_json: string | null;
    country_id: string;
  }>;

  const neighbors = getHexNeighbors(hex);
  const retreatedFormations: Array<{
    id: string;
    name: string;
    toHexId: string;
  }> = [];

  let bluforCasualtiesPct = 15;
  let opforCasualtiesPct = 65;
  let hexLiberated = false;
  let contested = false;

  if (input.outcome === "blufor_victory") {
    bluforCasualtiesPct = 12;
    opforCasualtiesPct = 65;
    hexLiberated = true;
    contested = false;

    // Retreat OPFOR
    const retreatCandidate =
      neighbors.find((n) => n.ownership.side !== "blufor") ?? neighbors[0];
    for (const f of opforFormations) {
      const newStr = Math.max(0, f.strength - opforCasualtiesPct);
      if (newStr > 0 && retreatCandidate) {
        database
          .prepare(
            `UPDATE campaign_formations SET hex_id = ?, strength = ?, status = 'ready', updated_at = ? WHERE id = ?`,
          )
          .run(retreatCandidate.id, newStr, now, f.id);
        retreatedFormations.push({
          id: f.id,
          name: f.name,
          toHexId: retreatCandidate.id,
        });
      } else {
        database
          .prepare(
            `UPDATE campaign_formations SET strength = 0, status = 'depleted', updated_at = ? WHERE id = ?`,
          )
          .run(now, f.id);
      }
    }

    // Award BLUFOR
    const playerCountry = bluforFormations[0]?.country_id ?? "norway";
    for (const f of bluforFormations) {
      const meta = jsonParse<Record<string, unknown>>(f.metadata_json ?? "{}");
      const currAmmo =
        typeof meta.ammoLevel === "number" ? meta.ammoLevel : 100;
      const currMorale = typeof meta.morale === "number" ? meta.morale : 100;
      const currXP = typeof meta.experience === "number" ? meta.experience : 40;

      const newStr = Math.max(10, f.strength - bluforCasualtiesPct);
      const newAmmo = Math.max(0, currAmmo - 25);
      const newMorale = Math.min(100, currMorale + 15);
      const newXP = currXP + 20;
      const newRank = calculateVeterancyRank(newXP);

      const updatedMeta = {
        ...meta,
        ammoLevel: newAmmo,
        morale: newMorale,
        experience: newXP,
        rank: newRank,
      };

      database
        .prepare(
          `UPDATE campaign_formations SET strength = ?, status = 'ready', metadata_json = ?, updated_at = ? WHERE id = ?`,
        )
        .run(newStr, JSON.stringify(updatedMeta), now, f.id);
    }

    database
      .prepare(
        `UPDATE campaign_hex_cells SET side = 'blufor', country_id = ?, contested = 0 WHERE campaign_id = ? AND hex_id = ?`,
      )
      .run(playerCountry, input.campaignId, input.hexId);
  } else if (input.outcome === "opfor_victory") {
    bluforCasualtiesPct = 50;
    opforCasualtiesPct = 15;
    hexLiberated = false;
    contested = false;

    // Retreat BLUFOR
    const retreatCandidate =
      neighbors.find((n) => n.ownership.side === "blufor") ?? neighbors[0];
    for (const f of bluforFormations) {
      const newStr = Math.max(0, f.strength - bluforCasualtiesPct);
      if (newStr > 0 && retreatCandidate) {
        database
          .prepare(
            `UPDATE campaign_formations SET hex_id = ?, strength = ?, status = 'ready', updated_at = ? WHERE id = ?`,
          )
          .run(retreatCandidate.id, newStr, now, f.id);
        retreatedFormations.push({
          id: f.id,
          name: f.name,
          toHexId: retreatCandidate.id,
        });
      } else {
        database
          .prepare(
            `UPDATE campaign_formations SET strength = 0, status = 'depleted', updated_at = ? WHERE id = ?`,
          )
          .run(now, f.id);
      }
    }

    const opforCountry = opforFormations[0]?.country_id ?? "soviet-union";
    database
      .prepare(
        `UPDATE campaign_hex_cells SET side = 'opfor', country_id = ?, contested = 0 WHERE campaign_id = ? AND hex_id = ?`,
      )
      .run(opforCountry, input.campaignId, input.hexId);
  } else {
    bluforCasualtiesPct = 30;
    opforCasualtiesPct = 30;
    contested = true;

    for (const f of bluforFormations) {
      const newStr = Math.max(0, f.strength - bluforCasualtiesPct);
      database
        .prepare(
          `UPDATE campaign_formations SET strength = ?, status = 'engaged', updated_at = ? WHERE id = ?`,
        )
        .run(newStr, now, f.id);
    }
    for (const f of opforFormations) {
      const newStr = Math.max(0, f.strength - opforCasualtiesPct);
      database
        .prepare(
          `UPDATE campaign_formations SET strength = ?, status = 'engaged', updated_at = ? WHERE id = ?`,
        )
        .run(newStr, now, f.id);
    }
    database
      .prepare(
        `UPDATE campaign_hex_cells SET contested = 1 WHERE campaign_id = ? AND hex_id = ?`,
      )
      .run(input.campaignId, input.hexId);
  }

  const summary =
    input.outcome === "blufor_victory"
      ? `🏆 TACTICAL SORTIE DEBRIEF: Decisive victory confirmed in ${hex.name}! OPFOR routed and retreated. Sovereign control established.`
      : input.outcome === "opfor_victory"
        ? `💀 TACTICAL SORTIE DEBRIEF: Repulse in ${hex.name}. Friendly forces fell back to adjacent lines.`
        : `⚖️ TACTICAL SORTIE DEBRIEF: Stalemate in ${hex.name}. Both sides took heavy attrition; sector remains contested.`;

  return {
    ok: true,
    victory:
      input.outcome === "blufor_victory"
        ? "blufor"
        : input.outcome === "opfor_victory"
          ? "opfor"
          : "stalemate",
    title: `Debrief: Battle of ${hex.name}`,
    summary,
    bluforCasualtiesPct,
    opforCasualtiesPct,
    bluforAmmoExpended: 25,
    opforAmmoExpended: 25,
    retreatedFormations,
    hexLiberated,
    contested,
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
    | "ai_command_executed"
    | "ai_country_turn_completed";
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

  // 5. Process AI Strategic Commander Decisions across all sovereign non-player nations
  const aiTurnResult = processAutonomousCountryTurns(
    database,
    campaignId,
    playerCountryId,
  );
  for (const order of aiTurnResult.orders) {
    events.push({
      kind: "ai_command_executed",
      summary: order.summary,
    });
  }
  for (const log of aiTurnResult.logs) {
    events.push({
      kind: "ai_country_turn_completed",
      summary: `${log.countryName}: ${log.ordersSummary}`,
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
