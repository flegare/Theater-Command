import type { CampaignStateSnapshot } from "./campaignLedger.js";

export type SectorSide = "blufor" | "opfor";

export type SectorOwner = {
  type: "country" | "alliance";
  id: string;
  label: string;
  side: SectorSide;
};

export type SectorUnitCategory =
  | "troops"
  | "armor"
  | "artillery"
  | "aaa_local"
  | "aa_interdiction"
  | "fixed_wing"
  | "helicopter";

export type SectorStrategicCategory =
  "factory" | "r_and_d" | "aa_site" | "economic_booster" | "strategic_asset";

export type SectorAction =
  | "gather_intel"
  | "disrupt_fuel_lanes"
  | "conquer_area"
  | "destroy_strategic_assets"
  | "secure_sector"
  | "restore_economy"
  | "fortify_air_defense"
  | "escort_shipping";

export type TheaterSectorDefinition = {
  id: string;
  theaterId: string;
  name: string;
  summary: string;
  owner: SectorOwner;
  center: { latitude: number; longitude: number };
  polygon?: Array<[number, number]>;
  laneRouteIds: string[];
  strategicSiteIds: string[];
  baseEconomicValue: number;
  pointValue: number;
  hooks: {
    unitCategories: SectorUnitCategory[];
    strategicCategories: SectorStrategicCategory[];
  };
  actions: {
    blufor: SectorAction[];
    opfor: SectorAction[];
  };
};

export type SectorView = {
  id: string;
  name: string;
  summary: string;
  center: { latitude: number; longitude: number };
  polygon?: Array<[number, number]>;
  owner: SectorOwner;
  laneRouteIds: string[];
  strategicSiteIds: string[];
  baseEconomicValue: number;
  pointValue: number;
  actions: SectorAction[];
  hooks: {
    unitCategories: SectorUnitCategory[];
    strategicCategories: SectorStrategicCategory[];
  };
  assigned: {
    units: number;
    strategicAssets: number;
  };
  strategicSiteStatus: Array<{
    strategicSiteId: string;
    status: "active" | "damaged" | "destroyed" | "missing";
  }>;
};

type StrategicSiteStatus = SectorView["strategicSiteStatus"][number]["status"];

const allUnitHooks: SectorUnitCategory[] = [
  "troops",
  "armor",
  "artillery",
  "aaa_local",
  "aa_interdiction",
  "fixed_wing",
  "helicopter",
];

const allStrategicHooks: SectorStrategicCategory[] = [
  "factory",
  "r_and_d",
  "aa_site",
  "economic_booster",
  "strategic_asset",
];

const northernFlankSectors: TheaterSectorDefinition[] = [
  {
    id: "nf-bergen-scapa",
    theaterId: "northern-flank",
    name: "Bergen-Scapa Corridor",
    summary: "Fuel transfer and North Atlantic reinforcement hinge sector.",
    owner: { type: "alliance", id: "nato", label: "NATO", side: "blufor" },
    center: { latitude: 59.7, longitude: 1.8 },
    polygon: [
      [61.5, -4.5],
      [61.5, 6.2],
      [59.8, 6.2],
      [57.5, -1.0],
      [57.5, -4.5],
      [59.5, -5.0],
    ],
    laneRouteIds: ["bergen-scapa-fuel", "aberdeen-bergen-cruise"],
    strategicSiteIds: [
      "bergen-port",
      "mongstad-refinery",
      "troll-a-platform",
      "bergen-aa",
    ],
    baseEconomicValue: 44,
    pointValue: 26,
    hooks: {
      unitCategories: allUnitHooks,
      strategicCategories: allStrategicHooks,
    },
    actions: {
      blufor: [
        "secure_sector",
        "escort_shipping",
        "restore_economy",
        "fortify_air_defense",
      ],
      opfor: [
        "gather_intel",
        "disrupt_fuel_lanes",
        "destroy_strategic_assets",
        "conquer_area",
      ],
    },
  },
  {
    id: "nf-denmark-skagerrak",
    theaterId: "northern-flank",
    name: "Denmark Cluster: Skagerrak Gate",
    summary: "Controls sea access between Norway and Danish straits.",
    owner: { type: "alliance", id: "nato", label: "NATO", side: "blufor" },
    center: { latitude: 58.4, longitude: 9.3 },
    polygon: [
      [59.4, 7.8],
      [59.4, 11.4],
      [58.4, 11.8],
      [57.3, 10.8],
      [57.3, 7.8],
      [58.2, 7.2],
    ],
    laneRouteIds: ["skagerrak-oslo-commerce"],
    strategicSiteIds: [],
    baseEconomicValue: 20,
    pointValue: 14,
    hooks: {
      unitCategories: allUnitHooks,
      strategicCategories: allStrategicHooks,
    },
    actions: {
      blufor: ["secure_sector", "escort_shipping", "fortify_air_defense"],
      opfor: ["gather_intel", "conquer_area", "disrupt_fuel_lanes"],
    },
  },
  {
    id: "nf-denmark-kattegat",
    theaterId: "northern-flank",
    name: "Denmark Cluster: Kattegat Straits",
    summary: "Strait control sector for civilian and naval transit.",
    owner: { type: "alliance", id: "nato", label: "NATO", side: "blufor" },
    center: { latitude: 56.5, longitude: 10.5 },
    polygon: [
      [57.8, 10.2],
      [57.8, 12.8],
      [56.2, 12.8],
      [55.4, 12.2],
      [55.4, 10.2],
      [56.8, 9.8],
    ],
    laneRouteIds: ["north-sea-passenger-route"],
    strategicSiteIds: [],
    baseEconomicValue: 16,
    pointValue: 12,
    hooks: {
      unitCategories: allUnitHooks,
      strategicCategories: allStrategicHooks,
    },
    actions: {
      blufor: ["secure_sector", "escort_shipping", "restore_economy"],
      opfor: ["gather_intel", "disrupt_fuel_lanes", "conquer_area"],
    },
  },
  {
    id: "nf-denmark-jutland",
    theaterId: "northern-flank",
    name: "Denmark Cluster: Jutland-North Sea Approaches",
    summary: "Approach sector shaping freight and fleet transit.",
    owner: { type: "alliance", id: "nato", label: "NATO", side: "blufor" },
    center: { latitude: 56.2, longitude: 7.4 },
    polygon: [
      [57.5, 5.2],
      [57.5, 9.2],
      [54.8, 9.2],
      [54.5, 7.0],
      [54.5, 4.8],
      [56.0, 4.8],
    ],
    laneRouteIds: ["continental-north-sea-freight"],
    strategicSiteIds: [],
    baseEconomicValue: 24,
    pointValue: 16,
    hooks: {
      unitCategories: allUnitHooks,
      strategicCategories: allStrategicHooks,
    },
    actions: {
      blufor: ["secure_sector", "escort_shipping", "fortify_air_defense"],
      opfor: ["gather_intel", "disrupt_fuel_lanes", "destroy_strategic_assets"],
    },
  },
];

const globalSectors: Record<string, TheaterSectorDefinition[]> = {
  "north-pacific": [
    {
      id: "np-japan-lanes",
      theaterId: "north-pacific",
      name: "Japan-Korea Maritime Cluster",
      summary: "Commercial and military transit around Japanese home waters.",
      owner: {
        type: "alliance",
        id: "allied",
        label: "Allied",
        side: "blufor",
      },
      center: { latitude: 36.0, longitude: 136.5 },
      polygon: [
        [38.5, 131.0],
        [38.5, 142.0],
        [34.0, 142.0],
        [32.5, 137.0],
        [32.5, 131.0],
        [35.5, 129.5],
      ],
      laneRouteIds: ["japan-sea-lanes"],
      strategicSiteIds: ["yokosuka-aa", "yokohama-industry", "chiba-fuel"],
      baseEconomicValue: 38,
      pointValue: 24,
      hooks: {
        unitCategories: allUnitHooks,
        strategicCategories: allStrategicHooks,
      },
      actions: {
        blufor: ["secure_sector", "escort_shipping", "fortify_air_defense"],
        opfor: [
          "gather_intel",
          "disrupt_fuel_lanes",
          "destroy_strategic_assets",
        ],
      },
    },
  ],
  "persian-gulf": [
    {
      id: "pg-hormuz-oil",
      theaterId: "persian-gulf",
      name: "Hormuz Energy Cluster",
      summary: "Oil throughput and chokepoint control in the Gulf.",
      owner: {
        type: "alliance",
        id: "aligned",
        label: "Aligned",
        side: "opfor",
      },
      center: { latitude: 27.2, longitude: 54.9 },
      polygon: [
        [29.5, 50.0],
        [29.5, 57.5],
        [25.5, 57.5],
        [24.0, 54.0],
        [24.0, 50.0],
        [27.0, 48.5],
      ],
      laneRouteIds: ["gulf-oil-route"],
      strategicSiteIds: ["abadan-refinery", "bandar-aa"],
      baseEconomicValue: 42,
      pointValue: 26,
      hooks: {
        unitCategories: allUnitHooks,
        strategicCategories: allStrategicHooks,
      },
      actions: {
        blufor: ["secure_sector", "restore_economy", "fortify_air_defense"],
        opfor: ["gather_intel", "conquer_area", "destroy_strategic_assets"],
      },
    },
  ],
  "indian-ocean": [
    {
      id: "io-arabian-energy",
      theaterId: "indian-ocean",
      name: "Arabian Energy Cluster",
      summary: "Energy route security and strike competition.",
      owner: { type: "country", id: "india", label: "India", side: "blufor" },
      center: { latitude: 18.8, longitude: 71.0 },
      polygon: [
        [22.0, 68.0],
        [22.0, 75.0],
        [16.0, 75.0],
        [14.5, 71.0],
        [14.5, 68.0],
        [18.0, 66.5],
      ],
      laneRouteIds: ["arabian-sea-energy-route"],
      strategicSiteIds: ["mumbai-aa", "mumbai-industry", "bombay-high"],
      baseEconomicValue: 33,
      pointValue: 20,
      hooks: {
        unitCategories: allUnitHooks,
        strategicCategories: allStrategicHooks,
      },
      actions: {
        blufor: ["secure_sector", "escort_shipping", "restore_economy"],
        opfor: ["gather_intel", "disrupt_fuel_lanes", "conquer_area"],
      },
    },
  ],
};

export function sectorsForTheater(
  theaterId: string,
): TheaterSectorDefinition[] {
  if (theaterId === "northern-flank") return northernFlankSectors;
  return globalSectors[theaterId] ?? [];
}

export function sideForCoalition(coalitionId: string): SectorSide {
  return coalitionId === "warsaw-pact" || coalitionId === "belligerent"
    ? "opfor"
    : "blufor";
}

export function resolveSectorView(
  definitions: TheaterSectorDefinition[],
  state: CampaignStateSnapshot,
  playerSide: SectorSide,
): SectorView[] {
  return definitions.map((sector) => {
    const assignedInSector = state.entities.filter((entity) => {
      const sectorId =
        typeof entity.metadata.sectorId === "string"
          ? entity.metadata.sectorId
          : undefined;
      return sectorId === sector.id;
    });

    const strategicSiteStatus = sector.strategicSiteIds.map((siteId) => {
      const match = state.entities.find(
        (entity) => entity.metadata.strategicSiteId === siteId,
      );
      if (!match) {
        return { strategicSiteId: siteId, status: "missing" as const };
      }
      const status: StrategicSiteStatus =
        match.status === "active" ||
        match.status === "damaged" ||
        match.status === "destroyed"
          ? match.status
          : "active";
      return { strategicSiteId: siteId, status };
    });

    return {
      id: sector.id,
      name: sector.name,
      summary: sector.summary,
      center: sector.center,
      ...(sector.polygon ? { polygon: sector.polygon } : {}),
      owner: sector.owner,
      laneRouteIds: sector.laneRouteIds,
      strategicSiteIds: sector.strategicSiteIds,
      baseEconomicValue: sector.baseEconomicValue,
      pointValue: sector.pointValue,
      actions: sector.actions[playerSide],
      hooks: sector.hooks,
      assigned: {
        units: assignedInSector.filter(
          (entity) => entity.entityType === "unit_asset",
        ).length,
        strategicAssets: assignedInSector.filter(
          (entity) => entity.entityType === "strategic_asset",
        ).length,
      },
      strategicSiteStatus,
    };
  });
}
