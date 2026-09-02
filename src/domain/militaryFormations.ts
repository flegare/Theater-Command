import type { HexStrategicFacility, HexTerrainType } from "./hexGrid.js";
import type { FlotillaComposition } from "./flotillaComposition.js";
export {
  getFlotillaComposition,
  recalculateCompositionTotals,
  calculateCompositionCost,
  filterAssetsByTimeline,
  getAvailableModernizations,
  getUnitBaseStats,
  AVAILABLE_VANILLA_ASSETS,
  HIERARCHICAL_CATALOG_GROUPS,
  type AvailableAssetCatalogItem,
  type CatalogCategoryNode,
  type FlotillaComposition,
  type FlotillaSubCategory,
  type FlotillaUnit,
  type FlotillaUnitCategory,
} from "./flotillaComposition.js";

export type MilitaryDomain = "ground" | "naval" | "air";

export type FormationUnitType =
  | "nato_armored_division"
  | "pact_tank_division"
  | "mechanized_infantry_division"
  | "marine_amphibious_brigade"
  | "surface_action_group"
  | "carrier_strike_group"
  | "submarine_squadron"
  | "sealift_transport_flotilla"
  | "merchant_supply_convoy"
  | "tactical_fighter_wing"
  | "maritime_strike_squadron"
  | "airlift_transport_wing";

export type FormationArchetype = {
  type: FormationUnitType;
  displayName: string;
  domain: MilitaryDomain;
  defaultStrength: number;
  maxActionPoints: number;
  fuelConsumptionPerTurn: number;
  upkeepFundsPerTurn: number;
  productionCost: number;
  fundsCost: number;
  transportCapacity?: number; // How many ground units can embark on this
  isHeavyArmor?: boolean;
  requiresTransportOverWater?: boolean;
};

export const FORMATION_ARCHETYPES: Record<
  FormationUnitType,
  FormationArchetype
> = {
  nato_armored_division: {
    type: "nato_armored_division",
    displayName: "Armored Division (M1 Abrams / Leopard 2)",
    domain: "ground",
    defaultStrength: 100,
    maxActionPoints: 1,
    fuelConsumptionPerTurn: 15,
    upkeepFundsPerTurn: 20,
    productionCost: 80,
    fundsCost: 280,
    isHeavyArmor: true,
    requiresTransportOverWater: true,
  },
  pact_tank_division: {
    type: "pact_tank_division",
    displayName: "Guards Tank Division (T-80 / T-72)",
    domain: "ground",
    defaultStrength: 100,
    maxActionPoints: 1,
    fuelConsumptionPerTurn: 15,
    upkeepFundsPerTurn: 18,
    productionCost: 75,
    fundsCost: 260,
    isHeavyArmor: true,
    requiresTransportOverWater: true,
  },
  mechanized_infantry_division: {
    type: "mechanized_infantry_division",
    displayName: "Mechanized Infantry Division",
    domain: "ground",
    defaultStrength: 80,
    maxActionPoints: 1,
    fuelConsumptionPerTurn: 10,
    upkeepFundsPerTurn: 14,
    productionCost: 60,
    fundsCost: 200,
    isHeavyArmor: true,
    requiresTransportOverWater: true,
  },
  marine_amphibious_brigade: {
    type: "marine_amphibious_brigade",
    displayName: "Marine Amphibious Brigade",
    domain: "ground",
    defaultStrength: 75,
    maxActionPoints: 1,
    fuelConsumptionPerTurn: 10,
    upkeepFundsPerTurn: 16,
    productionCost: 65,
    fundsCost: 220,
    isHeavyArmor: false,
    requiresTransportOverWater: true,
  },
  surface_action_group: {
    type: "surface_action_group",
    displayName: "Surface Action Group (SAG)",
    domain: "naval",
    defaultStrength: 90,
    maxActionPoints: 2,
    fuelConsumptionPerTurn: 25,
    upkeepFundsPerTurn: 30,
    productionCost: 110,
    fundsCost: 350,
  },
  carrier_strike_group: {
    type: "carrier_strike_group",
    displayName: "Carrier Strike Group (CSG)",
    domain: "naval",
    defaultStrength: 150,
    maxActionPoints: 2,
    fuelConsumptionPerTurn: 40,
    upkeepFundsPerTurn: 55,
    productionCost: 220,
    fundsCost: 600,
  },
  submarine_squadron: {
    type: "submarine_squadron",
    displayName: "Submarine Squadron",
    domain: "naval",
    defaultStrength: 85,
    maxActionPoints: 2,
    fuelConsumptionPerTurn: 15,
    upkeepFundsPerTurn: 25,
    productionCost: 95,
    fundsCost: 310,
  },
  sealift_transport_flotilla: {
    type: "sealift_transport_flotilla",
    displayName: "Strategic Sealift Flotilla",
    domain: "naval",
    defaultStrength: 40,
    maxActionPoints: 2,
    fuelConsumptionPerTurn: 15,
    upkeepFundsPerTurn: 15,
    productionCost: 70,
    fundsCost: 180,
    transportCapacity: 2,
  },
  merchant_supply_convoy: {
    type: "merchant_supply_convoy",
    displayName: "Merchant Supply Convoy",
    domain: "naval",
    defaultStrength: 25,
    maxActionPoints: 1,
    fuelConsumptionPerTurn: 5,
    upkeepFundsPerTurn: 0,
    productionCost: 40,
    fundsCost: 120,
  },
  tactical_fighter_wing: {
    type: "tactical_fighter_wing",
    displayName: "Tactical Fighter Wing (F-16 / Tornado)",
    domain: "air",
    defaultStrength: 80,
    maxActionPoints: 3,
    fuelConsumptionPerTurn: 20,
    upkeepFundsPerTurn: 25,
    productionCost: 85,
    fundsCost: 260,
  },
  maritime_strike_squadron: {
    type: "maritime_strike_squadron",
    displayName: "Maritime Strike Squadron (Tu-22M / A-6)",
    domain: "air",
    defaultStrength: 90,
    maxActionPoints: 3,
    fuelConsumptionPerTurn: 30,
    upkeepFundsPerTurn: 30,
    productionCost: 100,
    fundsCost: 300,
  },
  airlift_transport_wing: {
    type: "airlift_transport_wing",
    displayName: "Strategic Airlift Wing (C-5 / Il-76)",
    domain: "air",
    defaultStrength: 30,
    maxActionPoints: 4,
    fuelConsumptionPerTurn: 25,
    upkeepFundsPerTurn: 20,
    productionCost: 75,
    fundsCost: 200,
    transportCapacity: 1,
  },
};

export type ActiveMovementRoute = {
  targetHexId: string;
  targetName: string;
  waypoints: string[]; // array of hexIds from start to target
  currentWaypointIndex: number; // 0-based index of current waypoint
  totalWaypoints: number; // waypoints.length
  totalTurns: number; // estimated turns to reach destination
  turnsElapsed: number; // turns progressed so far
  status: "in_transit" | "arrived" | "interrupted" | "blocked";
  reason?: string | undefined;
};

export type VeterancyRank = "recruit" | "regular" | "veteran" | "elite";

export type CampaignFormationStatus =
  | "ready"
  | "moved"
  | "engaged"
  | "embarked"
  | "embarking"
  | "disembarking"
  | "training"
  | "depleted";

export type CampaignFormation = {
  id: string;
  campaignId: string;
  name: string;
  unitType: FormationUnitType;
  side: "blufor" | "opfor" | "neutral";
  countryId: string;
  hexId: string;
  strength: number;
  actionPoints: number;
  maxActionPoints: number;
  embarkedOnId: string | null;
  status: CampaignFormationStatus;
  metadata: Record<string, unknown>;
  archetype: FormationArchetype;
  composition?: FlotillaComposition;
  activeRoute?: ActiveMovementRoute | undefined;
  // Readiness, Morale, Fuel & Experience Logistics
  fuelCurrent: number;
  fuelMax: number;
  ammoLevel: number;
  morale: number;
  experience: number;
  veterancyRank: VeterancyRank;
  consecutiveTurnsAtSea: number;
  embarkTurnsRemaining?: number | undefined;
  disembarkTurnsRemaining?: number | undefined;
  trainingTurnsRemaining?: number | undefined;
};

export function calculateVeterancyRank(experience: number): VeterancyRank {
  if (experience >= 85) return "elite";
  if (experience >= 60) return "veteran";
  if (experience >= 25) return "regular";
  return "recruit";
}

export function getVeterancyCombatMultiplier(rank: VeterancyRank): number {
  switch (rank) {
    case "elite":
      return 1.3;
    case "veteran":
      return 1.15;
    case "regular":
      return 1.0;
    case "recruit":
      return 0.9;
  }
}

export function calculateSeaFatigueAndMorale(
  currentMorale: number,
  consecutiveTurnsAtSea: number,
  isAtFriendlyPort: boolean,
  domain: MilitaryDomain,
): { morale: number; consecutiveTurnsAtSea: number } {
  if (isAtFriendlyPort) {
    // Rested in port: recover +20% morale up to 100, reset turns at sea
    return {
      morale: Math.min(100, currentMorale + 20),
      consecutiveTurnsAtSea: 0,
    };
  }

  // Deployed at sea or field
  const newTurnsAtSea = domain === "naval" ? consecutiveTurnsAtSea + 1 : 0;
  // Long operations fatigue: -3% per turn at sea (or -5% if beyond 4 turns)
  const fatiguePenalty = newTurnsAtSea > 4 ? 5 : 3;
  const newMorale = Math.max(15, currentMorale - fatiguePenalty);

  return {
    morale: newMorale,
    consecutiveTurnsAtSea: newTurnsAtSea,
  };
}

export function isWaterTerrain(terrain: HexTerrainType): boolean {
  return (
    terrain === "deep_sea" ||
    terrain === "coastal_waters" ||
    terrain === "strait_chokepoint"
  );
}

export function isLandTerrain(terrain: HexTerrainType): boolean {
  return (
    terrain === "plains" ||
    terrain === "forest" ||
    terrain === "mountain_fjord" ||
    terrain === "urban_metropolis" ||
    terrain === "island"
  );
}

export function canFormationTraverseTerrain(
  unitType: FormationUnitType,
  targetTerrain: HexTerrainType,
  isEmbarked: boolean,
  targetFacilities?: HexStrategicFacility[],
): { canMove: boolean; reason?: string } {
  const arch = FORMATION_ARCHETYPES[unitType];
  if (!arch) return { canMove: false, reason: "Unknown unit archetype." };

  if (arch.domain === "air") {
    // Air units can traverse any terrain
    return { canMove: true };
  }

  if (arch.domain === "ground") {
    if (isEmbarked) {
      // While embarked on a naval transport, moves wherever the transport can go
      if (
        isWaterTerrain(targetTerrain) ||
        targetTerrain === "island" ||
        targetFacilities?.includes("naval_base")
      ) {
        return { canMove: true };
      }
      return {
        canMove: false,
        reason:
          "Embarked formations can only traverse water while aboard a sealift vessel.",
      };
    }
    // Disembarked ground unit
    if (isWaterTerrain(targetTerrain)) {
      return {
        canMove: false,
        reason:
          "Heavy ground divisions require a Strategic Sealift Flotilla to traverse water.",
      };
    }
    return { canMove: true };
  }

  if (arch.domain === "naval") {
    const hasNavalPort =
      targetFacilities?.includes("naval_base") ||
      targetFacilities?.includes("shipyard");
    if (
      isWaterTerrain(targetTerrain) ||
      targetTerrain === "island" ||
      hasNavalPort
    ) {
      return { canMove: true };
    }
    return {
      canMove: false,
      reason:
        "Naval task forces cannot move across continental land hexes without a naval port.",
    };
  }

  return { canMove: true };
}
