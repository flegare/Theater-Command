import type { LaneTrafficPicture } from "./laneTraffic.js";
import {
  geoToTemplateLocal,
  sampleTemplateZone,
  templateLocalToGeo,
  type MissionTemplateMetadata,
  type TemplateLandUnit,
  type TemplateMapSymbol,
  type TemplateRoute,
  type TemplateWaypoint,
  type TemplateZone,
} from "./missionTemplate.js";
import type { MissionGenerationConfig } from "./mission-mods/types.js";
import type { TheaterLane } from "./trade.js";

export type GeneratedLaneUnit = {
  id: string;
  role: "civilian" | "neutral" | "possible_military";
  category: string;
  countryId: string;
  position: [number, number];
  directionVector: [number, number];
  bearingDegrees: number;
  identificationRequired: boolean;
  placeholder: true;
  spawnZoneId?: string;
  nativePosition?: TemplateWaypoint;
  nativeWaypoints?: TemplateWaypoint[];
  telegraph?: number;
  nativeType?: string;
  nativeVariant?: string;
  nativeNation?: string;
  contactTypeLabel?: string;
  radarActive?: boolean;
  vesselName?: string;
  airTrafficDirection?: "inbound" | "outbound";
  nearPort?: boolean;
  spawnChance?: number;
};

const northAtlanticFishingAssets: ReadonlyArray<{
  type: string;
  variant: string;
  label: string;
  nation?: string;
  countryId?: string;
}> = [
  {
    type: "civ_fv_sterntrawler_a",
    variant: "Default",
    label: "Stern Trawler",
  },
  {
    type: "civ_fv_fishingboat_b",
    variant: "Variant3",
    countryId: "denmark",
    label: "Small Side Trawler",
  },
  {
    type: "civ_fv_fishingboat_b",
    variant: "Variant2",
    label: "Small Side Trawler",
  },
  {
    type: "civ_fv_sterntrawler_a",
    variant: "Default",
    label: "Stern Trawler",
  },
  {
    type: "civ_fv_sidetrawler",
    variant: "Variant1",
    label: "Medium Seiner",
  },
  {
    type: "civ_fv_fishingboat_a",
    variant: "Variant2",
    nation: "norway",
    label: "Shrimp Trawler",
  },
];

const fishingVesselNames: Record<string, string[]> = {
  norway: [
    "Havbris",
    "Nordlys",
    "Fjordglimt",
    "Sjøfuglen",
    "Vestkapp",
    "Solstrand",
    "Havørn",
    "Blåfjell",
    "Nordstjernen",
    "Skreien",
    "Lofotværing",
    "Bølgely",
    "Havblikk",
    "Skarven",
    "Frøya",
    "Røstværing",
    "Vesterhav",
    "Sjøsprøyt",
    "Måken",
    "Havdur",
    "Nordbris",
    "Fjordfisk",
    "Vestfjord",
    "Havglytt",
    "Sjøliv",
    "Kvitbjørn",
    "Havstrand",
    "Stormfugl",
    "Karmøy",
    "Bergensfjord",
  ],
  denmark: [
    "Havfruen",
    "Nordhavet",
    "Mette",
    "Lise",
    "Karen",
    "Anne-Mette",
    "Vestkysten",
    "Skagen",
    "Hvide Sande",
    "Fortuna",
    "Søbjørn",
    "Havmågen",
    "Nordsøen",
    "Fiskely",
    "Vesterhavet",
    "Thyborøn",
  ],
  "united-kingdom": [
    "Northern Dawn",
    "Ocean Star",
    "Sea Venture",
    "Silver Wave",
    "Heather Isle",
    "North Sea Girl",
    "Faithful Friend",
    "Western Hope",
    "Morning Star",
    "Ocean Harvest",
    "Sea Crest",
    "Starlight",
  ],
};

const northAtlanticCargoAssets: ReadonlyArray<{
  type: string;
  variant: string;
  label: string;
}> = [
  { type: "civ_ms_freighter_a", variant: "Variant1", label: "Freighter" },
  { type: "civ_ms_bulk", variant: "Variant1", label: "Bulk carrier" },
  { type: "civ_ms_roro_a", variant: "Variant1", label: "Ro-Ro cargo" },
  { type: "civ_ms_mercur", variant: "Variant1", label: "General cargo" },
  { type: "civ_ms_super_p", variant: "Variant1", label: "Product tanker" },
];

const northAtlanticBiologicAssets = [
  { type: "bio_fin_whale", label: "Fin whale" },
  { type: "bio_humpback_whale", label: "Humpback whale" },
  { type: "bio_blue_whale", label: "Blue whale" },
] as const;

const opforSubmarinePool: ReadonlyArray<{
  type: string;
  variant: string;
  countryId: string;
}> = [
  { type: "wp_ssn_victor1", variant: "Variant1", countryId: "soviet-union" },
  { type: "wp_ssn_victor3", variant: "Variant1", countryId: "soviet-union" },
  {
    type: "wp_ss_improved_kilo",
    variant: "Variant1",
    countryId: "soviet-union",
  },
  { type: "wp_ss_foxtrot", variant: "Variant1", countryId: "soviet-union" },
  { type: "wp_ss_romeo", variant: "Variant1", countryId: "soviet-union" },
  { type: "fgs_ss_type_206", variant: "Variant9", countryId: "germany" },
];

const opforSubmarineSpawnChances = [0.35, 0.3, 0.25, 0.2, 0.2] as const;

const opforSurfacePool: ReadonlyArray<{
  type: string;
  variant: string;
  countryId: string;
  category: "auxiliary" | "naval_combatant";
  spawnChance: number;
}> = [
  {
    type: "wp_agi_okean_mod",
    variant: "Variant1",
    countryId: "soviet-union",
    category: "auxiliary",
    spawnChance: 0.55,
  },
  {
    type: "wp_agi_okean",
    variant: "Variant1",
    countryId: "soviet-union",
    category: "auxiliary",
    spawnChance: 0.2,
  },
  {
    type: "wp_pt_stenka",
    variant: "Variant1",
    countryId: "soviet-union",
    category: "naval_combatant",
    spawnChance: 0.2,
  },
  {
    type: "fgs_ptg_tiger",
    variant: "Variant2",
    countryId: "germany",
    category: "naval_combatant",
    spawnChance: 0.2,
  },
];

const cargoVesselNames: Record<string, string[]> = {
  norway: ["Bergensfjord", "Nordic Star", "Fjord Carrier", "Havbris"],
  "united-kingdom": [
    "Tyne Trader",
    "Northern Enterprise",
    "Caledonian Coast",
    "Firth Pioneer",
  ],
  denmark: ["Jutlandia", "Nordhavn", "Kattegat Trader", "Skagen Bay"],
  netherlands: ["Maas Trader", "Northwind", "Rotterdam Star", "Waalhaven"],
  germany: ["Hansa Nord", "Elbe Trader", "Bremen Carrier", "Nordstern"],
};

const northSeaCargoCountries = [
  "norway",
  "united-kingdom",
  "denmark",
  "netherlands",
  "germany",
] as const;

export type GeneratedLaneMission = {
  id: string;
  title: string;
  laneId: string;
  laneName: string;
  seed: string;
  playerCountryId: string;
  origin: [number, number];
  candidateCountries: string[];
  directionVector: [number, number];
  bearingDegrees: number;
  waypoints: Array<[number, number]>;
  units: GeneratedLaneUnit[];
  guidance: string;
  campaignTime?: string;
  nativeMapCenter?: [number, number];
  nativeOriginPosition?: TemplateWaypoint;
  nativeWaypoints?: TemplateWaypoint[];
  nativeWaypointTokens?: string[];
  nativeLandUnits?: TemplateLandUnit[];
  nativeMapSymbols?: TemplateMapSymbol[];
  nativeZones?: TemplateZone[];
};

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function fishingVesselName(
  countryId: string,
  ordinal: number,
  seed: string,
): string {
  const names = fishingVesselNames[countryId] ?? ["Fishing Vessel"];
  const offset = hash(`${seed}:fishing-names:${countryId}`) % names.length;
  const name = names[(offset + ordinal) % names.length] ?? "Fishing Vessel";
  const cycle = Math.floor(ordinal / names.length);
  return cycle > 0 ? `${name} ${cycle + 1}` : name;
}

function cargoVesselName(
  countryId: string,
  ordinal: number,
  seed: string,
): string {
  const names = cargoVesselNames[countryId] ?? ["Merchant Vessel"];
  const offset = hash(`${seed}:cargo-names:${countryId}`) % names.length;
  const name = names[(offset + ordinal) % names.length] ?? "Merchant Vessel";
  const cycle = Math.floor(ordinal / names.length);
  return cycle > 0 ? `${name} ${cycle + 1}` : name;
}

function random(seed: string, index: number): number {
  return hash(`${seed}:${index}`) / 4_294_967_295;
}

function zonesForRole(
  template: MissionTemplateMetadata,
  role: "fishing" | "air" | "merchant" | "opfor" | "submarine",
): TemplateZone[] {
  const matches = template.zones.filter((zone) => {
    const descriptiveMetadata =
      `${zone.id} ${zone.label} ${zone.labelKey}`.toLowerCase();
    const metadata =
      `${descriptiveMetadata} ${zone.allowedUnitTypes ?? ""}`.toLowerCase();
    if (role === "fishing")
      return (
        /fish|trawl|seiner/.test(metadata) &&
        !/commercial.*fish|fish.*commercial/.test(metadata)
      );
    if (role === "air") return /air|flight|airport/.test(descriptiveMetadata);
    if (role === "opfor") return /red|opfor|enemy|hostile/.test(metadata);
    if (role === "submarine") return /sub|underwater/.test(metadata);
    return /merchant|cargo|commerce|commercial|traffic/.test(metadata);
  });
  if (matches.length) return matches;
  // Compatibility fallback for older templates whose zones only have generic
  // labels. New templates should label zones by function instead.
  const fallback = {
    fishing: /^Zone[3-8]$/,
    air: /^Zone2$/,
    opfor: /^Zone(9|10|11)$/,
    submarine: /^Zone(9|10|11)$/,
    merchant: /^Zone12$/,
  }[role];
  return template.zones.filter((zone) => fallback.test(zone.id));
}

function isNamedAirSpawnZone(zone: TemplateZone): boolean {
  const metadata = `${zone.id} ${zone.label} ${zone.labelKey}`.toLowerCase();
  return /air\s*traffic\s*spawn|air\s*spawn|flight\s*spawn|civil\s*air/.test(
    metadata,
  );
}

function isRefineryStyleLandUnit(unit: TemplateLandUnit): boolean {
  return /refinery|fueltanks|oil|terminal/.test(unit.type.toLowerCase());
}

function applyCampaignLandUnitState(
  landUnits: TemplateLandUnit[],
  config: MissionGenerationConfig | undefined,
): TemplateLandUnit[] {
  const destroyedTags =
    config?.campaignState?.destroyedInfrastructureTags ?? [];
  const refineryDestroyed = destroyedTags.some((tag) =>
    /refinery|oil|terminal|fuel/.test(tag.toLowerCase()),
  );
  if (!refineryDestroyed) return landUnits;
  return landUnits.filter((unit) => !isRefineryStyleLandUnit(unit));
}

function bearingDegrees(from: [number, number], to: [number, number]): number {
  const latitude = ((from[0] + to[0]) / 2) * (Math.PI / 180);
  const north = to[0] - from[0];
  const east = (to[1] - from[1]) * Math.cos(latitude);
  return (Math.atan2(east, north) * 180) / Math.PI < 0
    ? ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360
    : (Math.atan2(east, north) * 180) / Math.PI;
}

function positionOnLane(
  lane: TheaterLane,
  seed: string,
  index: number,
  totalUnits: number,
): { position: [number, number]; vector: [number, number]; bearing: number } {
  const progress = (index + 1) / (totalUnits + 1);
  const segment = Math.min(
    lane.coordinates.length - 2,
    Math.floor(progress * (lane.coordinates.length - 1)),
  );
  const from = lane.coordinates[segment] ?? lane.coordinates[0] ?? [0, 0];
  const to = lane.coordinates[segment + 1] ?? from;
  const segmentProgress = progress * (lane.coordinates.length - 1) - segment;
  const offset = Math.max(
    0.12,
    Math.min(0.88, segmentProgress + (random(seed, index * 2) - 0.5) * 0.12),
  );
  const vector: [number, number] = [to[0] - from[0], to[1] - from[1]];
  return {
    position: [
      Number((from[0] + vector[0] * offset).toFixed(4)),
      Number((from[1] + vector[1] * offset).toFixed(4)),
    ],
    vector,
    bearing: Number(bearingDegrees(from, to).toFixed(1)),
  };
}

export function generateLaneMission(
  lane: TheaterLane,
  traffic: LaneTrafficPicture,
  seed: string,
  playerCountryId: string,
  routeRisk: number,
  originOverride?: [number, number],
  campaignTime?: string,
  template?: MissionTemplateMetadata,
  generationConfig?: MissionGenerationConfig,
): GeneratedLaneMission {
  const first = lane.coordinates[0] ?? [0, 0];
  const last = lane.coordinates[lane.coordinates.length - 1] ?? first;
  const originPlacement = positionOnLane(lane, `${seed}:origin`, 0, 9);
  const origin = originOverride ?? originPlacement.position;
  const direction: [number, number] = [last[0] - first[0], last[1] - first[1]];
  const templateFishingCount = template
    ? 10 + (hash(`${seed}:${lane.id}:fishing-density`) % 21)
    : undefined;
  let fishingPopulationAllocated = false;
  const candidateTraffic = traffic.traffic
    .filter((spawn) => spawn.expectedDailyCount > 0)
    .flatMap((spawn) => {
      let count: number;
      if (spawn.category === "civilian_aircraft")
        count = Math.min(2, Math.max(1, spawn.expectedDailyCount));
      else if (spawn.kind === "cruise") count = 1;
      else if (spawn.category === "merchant_vessel")
        count =
          lane.commodity === "fuel"
            ? 3
            : Math.min(2, Math.max(1, Math.ceil(spawn.expectedDailyCount / 8)));
      else if (spawn.category === "fishing_vessel" && template) {
        count = fishingPopulationAllocated ? 0 : (templateFishingCount ?? 0);
        fishingPopulationAllocated = true;
      } else
        count = Math.min(
          3,
          Math.max(1, Math.ceil(spawn.expectedDailyCount / 8)),
        );
      return Array.from({ length: count }, (_, index) => ({
        ...spawn,
        id: `${lane.commodity}-${spawn.id}-${index + 1}`,
      }));
    });
  const possibleMilitary = lane.kind === "shipping" && routeRisk >= 0.25;
  const totalUnits = candidateTraffic.length + (possibleMilitary ? 2 : 0);
  const randomFor = (value: string, index: number) =>
    hash(`${seed}:${value}:${index}`) / 4_294_967_295;
  const fishingCandidateIndices = candidateTraffic.flatMap((spawn, index) =>
    spawn.category === "fishing_vessel" ? [index] : [],
  );
  const cargoCandidateIndices = candidateTraffic.flatMap((spawn, index) =>
    spawn.category === "merchant_vessel" ? [index] : [],
  );
  const fishingOrdinalByIndex = new Map(
    fishingCandidateIndices.map((candidateIndex, ordinal) => [
      candidateIndex,
      ordinal,
    ]),
  );
  const cargoOrdinalByIndex = new Map(
    cargoCandidateIndices.map((candidateIndex, ordinal) => [
      candidateIndex,
      ordinal,
    ]),
  );
  const stoppedFishingIndices = new Set(
    fishingCandidateIndices
      .slice()
      .sort(
        (left, right) =>
          hash(`${seed}:fishing-stop:${left}`) -
          hash(`${seed}:fishing-stop:${right}`),
      )
      .slice(0, Math.ceil(fishingCandidateIndices.length * 0.2)),
  );
  const radarOnFishingIndices = new Set(
    fishingCandidateIndices
      .slice()
      .sort(
        (left, right) =>
          hash(`${seed}:fishing-radar:${left}`) -
          hash(`${seed}:fishing-radar:${right}`),
      )
      .slice(0, Math.ceil(fishingCandidateIndices.length / 2)),
  );
  const occupied: Array<[number, number]> = [];
  const airportLocal = template?.mapSymbols.find((symbol) =>
    symbol.label.toLowerCase().includes("airport"),
  );
  const airportPoint = airportLocal
    ? geoToTemplateLocal(airportLocal.geoPoint, template!.mapCenter)
    : undefined;
  const portSymbol = template?.mapSymbols.find((symbol) =>
    symbol.label.toLowerCase().includes("port"),
  );
  const portPoint = portSymbol
    ? geoToTemplateLocal(portSymbol.geoPoint, template!.mapCenter)
    : undefined;
  const localDistance = (left: TemplateWaypoint, right: [number, number]) =>
    Math.hypot(left[0] - right[0], left[2] - right[1]);
  const airRoute = (inbound: boolean, index: number) => {
    if (!template) return undefined;
    const routes = template.routes.filter((route) => route.kind === "air");
    if (!routes.length) return undefined;
    const distanceToAirport = (route: TemplateRoute) => {
      if (!airportPoint) return Number.POSITIVE_INFINITY;
      return Math.min(
        ...(route.spawnPosition
          ? [localDistance(route.spawnPosition, airportPoint)]
          : []),
        ...route.waypoints.map((point) => localDistance(point, airportPoint)),
      );
    };
    const ranked = routes
      .map((route) => ({ route, distance: distanceToAirport(route) }))
      .sort((left, right) => left.distance - right.distance);
    if (!airportPoint) return routes[index % routes.length];
    if (inbound) {
      const airportApproaches = ranked.filter(({ route }) =>
        route.waypoints.some(
          (point) => localDistance(point, airportPoint) <= 5,
        ),
      );
      return (
        airportApproaches.sort(
          (left, right) =>
            localDistance(
              right.route.spawnPosition ?? right.route.waypoints[0]!,
              airportPoint,
            ) -
            localDistance(
              left.route.spawnPosition ?? left.route.waypoints[0]!,
              airportPoint,
            ),
        )[0]?.route ?? routes[index % routes.length]
      );
    }
    return (
      ranked.find(
        ({ route }) =>
          localDistance(
            route.spawnPosition ?? route.waypoints[0]!,
            airportPoint,
          ) <= 5,
      )?.route ??
      ranked[0]?.route ??
      routes[index % routes.length]
    );
  };
  const templatePlacement = (
    category: string,
    role: GeneratedLaneUnit["role"],
    index: number,
    inbound = false,
  ): {
    spawnZoneId?: string;
    position?: [number, number];
    nativePosition?: TemplateWaypoint;
    nativeWaypoints?: TemplateWaypoint[];
    nearPort?: boolean;
  } => {
    if (!template) return {};
    const kind =
      role === "possible_military" && category === "submarine"
        ? "submarine"
        : role === "possible_military"
          ? "opfor"
          : category === "fishing_vessel"
            ? "fishing"
            : category === "civilian_aircraft"
              ? "air"
              : category === "submarine"
                ? "submarine"
                : "merchant";
    const routes = template.routes.filter(
      (route) =>
        route.kind === kind &&
        (kind !== "air" || route.id.startsWith("NeutralAircraft")) &&
        (kind !== "merchant" || route.waypoints.length >= 3),
    );
    let route =
      kind === "air"
        ? airRoute(inbound, index)
        : kind === "fishing"
          ? routes[index % routes.length]
          : routes[Math.floor(randomFor(kind, index) * routes.length)];
    let zones =
      role === "possible_military"
        ? template.zones.filter((zone) => /^Zone(9|10|11)$/.test(zone.id))
        : category === "fishing_vessel"
          ? zonesForRole(template, "fishing")
          : category === "civilian_aircraft"
            ? zonesForRole(template, "air")
            : zonesForRole(template, "merchant");
    if (
      route &&
      (role === "possible_military" || category === "civilian_aircraft")
    ) {
      const first = route.waypoints[0];
      if (first) {
        zones = zones.slice().sort((left, right) => {
          const leftLocal = geoToTemplateLocal(
            left.geoPoint,
            template.mapCenter,
          );
          const rightLocal = geoToTemplateLocal(
            right.geoPoint,
            template.mapCenter,
          );
          const leftDistance = Math.hypot(
            leftLocal[0] - first[0],
            leftLocal[1] - first[2],
          );
          const rightDistance = Math.hypot(
            rightLocal[0] - first[0],
            rightLocal[1] - first[2],
          );
          return leftDistance - rightDistance;
        });
      }
    }
    const routeMatchedZone = route && role === "possible_military";
    const zone = routeMatchedZone
      ? zones[hash(`${seed}:${kind}:zone:${index}`) % Math.max(zones.length, 1)]
      : category === "fishing_vessel"
        ? zones[index % zones.length]
        : zones[Math.floor(randomFor(category, index) * zones.length)];
    if (kind === "fishing" && zone) {
      const center = geoToTemplateLocal(zone.geoPoint, template.mapCenter);
      route = routes.reduce<typeof route>((closest, candidate) => {
        const closestPoint = closest?.spawnPosition ?? closest?.waypoints[0];
        const candidatePoint =
          candidate.spawnPosition ?? candidate.waypoints[0];
        if (!candidatePoint) return closest;
        if (!closestPoint) return candidate;
        const closestDistance = Math.hypot(
          closestPoint[0] - center[0],
          closestPoint[2] - center[1],
        );
        const candidateDistance = Math.hypot(
          candidatePoint[0] - center[0],
          candidatePoint[2] - center[1],
        );
        return candidateDistance < closestDistance ? candidate : closest;
      }, route);
    }
    const routeWaypoints =
      inbound && route ? route.waypoints.slice().reverse() : route?.waypoints;
    if (!zone && !route?.spawnPosition) return {};
    if (kind === "merchant" && routeWaypoints?.length) {
      const nearestPortIndex = portPoint
        ? routeWaypoints.reduce(
            (closest, point, pointIndex) =>
              localDistance(point, portPoint) <
              localDistance(routeWaypoints[closest]!, portPoint)
                ? pointIndex
                : closest,
            0,
          )
        : undefined;
      const routeIndex =
        nearestPortIndex !== undefined && index % 3 === 0
          ? nearestPortIndex
          : Math.floor(
              randomFor(`${kind}-waypoint-${inbound ? "in" : "out"}`, index) *
                routeWaypoints.length,
            );
      const candidateIndices = [
        ...Array.from(
          { length: routeWaypoints.length - routeIndex },
          (_, offset) => routeIndex + offset,
        ),
        ...Array.from({ length: routeIndex }, (_, offset) => offset),
      ];
      const movementCandidateIndices = candidateIndices.filter(
        (candidateIndex) => {
          if (routeWaypoints.length <= 2)
            return candidateIndex < routeWaypoints.length - 1;
          return (
            candidateIndex > 0 && candidateIndex < routeWaypoints.length - 1
          );
        },
      );
      const candidatePool =
        movementCandidateIndices.length > 0
          ? movementCandidateIndices
          : candidateIndices.filter(
              (candidateIndex) => candidateIndex < routeWaypoints.length - 1,
            );
      const selectedRouteIndex =
        candidatePool.find((candidateIndex) => {
          const candidate = routeWaypoints[candidateIndex];
          if (!candidate) return false;
          return occupied.every(
            ([east, north]) =>
              Math.hypot(candidate[0] - east, candidate[2] - north) >= 0.2,
          );
        }) ?? Math.min(routeIndex, Math.max(0, routeWaypoints.length - 2));
      const routePoint =
        routeWaypoints[selectedRouteIndex] ??
        routeWaypoints[routeIndex] ??
        routeWaypoints[0]!;
      const sampledLocal: [number, number] = [routePoint[0], routePoint[2]];
      occupied.push([sampledLocal[0], sampledLocal[1]]);
      const nearPort =
        portPoint !== undefined &&
        Math.hypot(
          sampledLocal[0] - portPoint[0],
          sampledLocal[1] - portPoint[1],
        ) <= 10;
      const spawn: TemplateWaypoint = [sampledLocal[0], "0", sampledLocal[1]];
      // Preserve route travel order from the selected route point. This avoids
      // backtracking to wp1 when a unit is spawned near a mid-route waypoint.
      const routeTail = routeWaypoints.slice(selectedRouteIndex);
      const resolvedRouteTail =
        routeTail.length >= 2
          ? routeTail
          : [
              routePoint,
              routeWaypoints[
                (selectedRouteIndex + 1) % routeWaypoints.length
              ] ?? routePoint,
            ];
      return {
        ...(zone ? { spawnZoneId: zone.id } : {}),
        position: templateLocalToGeo(sampledLocal, template.mapCenter),
        nativePosition: spawn,
        nativeWaypoints: resolvedRouteTail,
        nearPort,
      };
    }
    if (inbound && zone && kind === "merchant") {
      let sampled = sampleTemplateZone(zone, template, seed, index + 100);
      for (let attempt = 1; attempt < 12; attempt += 1) {
        if (
          occupied.every(
            ([east, north]) =>
              Math.hypot(sampled.local[0] - east, sampled.local[1] - north) >=
              0.75,
          )
        )
          break;
        sampled = sampleTemplateZone(
          zone,
          template,
          seed,
          index + 100 + attempt * 17,
        );
      }
      const spawn: TemplateWaypoint = [sampled.local[0], "0", sampled.local[1]];
      occupied.push(sampled.local);
      return {
        spawnZoneId: zone.id,
        position: sampled.geo,
        nativePosition: spawn,
        ...(route
          ? {
              nativeWaypoints: [spawn, route.waypoints[0] ?? spawn],
            }
          : {}),
      };
    }
    if (route?.spawnPosition && (kind === "submarine" || kind === "air")) {
      if (kind === "submarine" && role === "possible_military" && zone) {
        let sampled = sampleTemplateZone(zone, template, seed, index + 900);
        for (let attempt = 1; attempt < 32; attempt += 1) {
          if (
            occupied.every(
              ([east, north]) =>
                Math.hypot(sampled.local[0] - east, sampled.local[1] - north) >=
                4,
            )
          )
            break;
          sampled = sampleTemplateZone(
            zone,
            template,
            seed,
            index + 900 + attempt * 23,
          );
        }
        const spawn: TemplateWaypoint = [
          sampled.local[0],
          "shallow",
          sampled.local[1],
        ];
        occupied.push([sampled.local[0], sampled.local[1]]);
        return {
          spawnZoneId: zone.id,
          position: sampled.geo,
          nativePosition: spawn,
          ...(routeWaypoints ? { nativeWaypoints: routeWaypoints } : {}),
        };
      }
      const spawn =
        kind === "air" && airportPoint
          ? inbound
            ? route.spawnPosition
            : ([airportPoint[0], "1000", airportPoint[1]] as TemplateWaypoint)
          : inbound
            ? (routeWaypoints?.[0] ?? route.spawnPosition)
            : route.spawnPosition;
      let resolvedSpawn = spawn;
      if (kind === "air" && zone) {
        const zoneCenter = geoToTemplateLocal(
          zone.geoPoint,
          template.mapCenter,
        );
        const routeAnchor = route.spawnPosition ?? routeWaypoints?.[0];
        const routeTooFarFromZone = routeAnchor
          ? Math.hypot(
              routeAnchor[0] - zoneCenter[0],
              routeAnchor[2] - zoneCenter[1],
            ) > 120
          : true;
        if (isNamedAirSpawnZone(zone) || routeTooFarFromZone) {
          let sampled = sampleTemplateZone(zone, template, seed, index + 700);
          for (let attempt = 1; attempt < 24; attempt += 1) {
            if (
              occupied.every(
                ([east, north]) =>
                  Math.hypot(
                    sampled.local[0] - east,
                    sampled.local[1] - north,
                  ) >= 2.5,
              )
            )
              break;
            sampled = sampleTemplateZone(
              zone,
              template,
              seed,
              index + 700 + attempt * 29,
            );
          }
          resolvedSpawn = [
            sampled.local[0],
            inbound ? "10000" : "1000",
            sampled.local[1],
          ] as TemplateWaypoint;
        }
      }
      const airWaypoints =
        kind === "air" && airportPoint
          ? inbound
            ? [
                ...(route.waypoints ?? []),
                [airportPoint[0], "3000", airportPoint[1]] as TemplateWaypoint,
              ]
            : [
                [airportPoint[0], "1000", airportPoint[1]] as TemplateWaypoint,
                ...(route.waypoints ?? []).filter(
                  (point) => localDistance(point, airportPoint) > 1,
                ),
              ]
          : routeWaypoints;
      const [east, , north] = resolvedSpawn;
      occupied.push([east, north]);
      return {
        ...(zone ? { spawnZoneId: zone.id } : {}),
        position: templateLocalToGeo([east, north], template.mapCenter),
        nativePosition: resolvedSpawn,
        ...(airWaypoints ? { nativeWaypoints: airWaypoints } : {}),
      };
    }
    if (!zone) return {};
    let sampled = sampleTemplateZone(zone, template, seed, index + 100);
    if (route && route.waypoints[0] && role === "possible_military") {
      const target = route.waypoints[0];
      const candidates = Array.from({ length: 24 }, (_, attempt) =>
        sampleTemplateZone(zone, template, seed, index + 100 + attempt * 17),
      );
      sampled = candidates.reduce((closest, candidate) => {
        const closestDistance = Math.hypot(
          closest.local[0] - target[0],
          closest.local[1] - target[2],
        );
        const candidateDistance = Math.hypot(
          candidate.local[0] - target[0],
          candidate.local[1] - target[2],
        );
        return candidateDistance < closestDistance ? candidate : closest;
      });
    }
    const minimumSeparation =
      category === "merchant_vessel"
        ? 0.75
        : category === "fishing_vessel"
          ? 0.35
          : 2.5;
    for (let attempt = 1; attempt < 64; attempt += 1) {
      if (
        occupied.every(
          ([east, north]) =>
            Math.hypot(sampled.local[0] - east, sampled.local[1] - north) >=
            minimumSeparation,
        )
      )
        break;
      sampled = sampleTemplateZone(
        zone,
        template,
        seed,
        index + 100 + attempt * 17,
      );
    }
    occupied.push(sampled.local);
    let resolvedWaypoints = routeWaypoints;
    if (kind === "fishing") {
      resolvedWaypoints = [];
      let previous = sampled.local;
      for (let waypointIndex = 0; waypointIndex < 4; waypointIndex += 1) {
        let waypoint = sampleTemplateZone(
          zone,
          template,
          `${seed}:fishing-loop`,
          index + 500 + waypointIndex * 31,
        );
        for (let attempt = 1; attempt < 32; attempt += 1) {
          const minimumLeg = waypointIndex === 0 ? 0.6 : 0.35;
          if (
            Math.hypot(
              waypoint.local[0] - previous[0],
              waypoint.local[1] - previous[1],
            ) >= minimumLeg
          )
            break;
          waypoint = sampleTemplateZone(
            zone,
            template,
            `${seed}:fishing-loop`,
            index + 500 + waypointIndex * 31 + attempt * 19,
          );
        }
        resolvedWaypoints.push([waypoint.local[0], "0", waypoint.local[1]]);
        previous = waypoint.local;
      }
    }
    return {
      spawnZoneId: zone.id,
      position: sampled.geo,
      nativePosition: [
        sampled.local[0],
        kind === "air" ? "10000" : kind === "submarine" ? "shallow" : "0",
        sampled.local[1],
      ] as TemplateWaypoint,
      ...(resolvedWaypoints ? { nativeWaypoints: resolvedWaypoints } : {}),
    };
  };
  const fishingNameCountByCountry = new Map<string, number>();
  const cargoNameCountByCountry = new Map<string, number>();
  const units: GeneratedLaneUnit[] = candidateTraffic.map((spawn, index) => {
    const placement = positionOnLane(lane, seed, index, totalUnits);
    const inbound =
      spawn.category === "civilian_aircraft"
        ? index % 2 === 0
        : spawn.category === "merchant_vessel" && index % 2 === 1;
    const templateUnit = templatePlacement(
      spawn.category,
      "neutral",
      index,
      inbound,
    );
    const fishing = spawn.category === "fishing_vessel";
    const fishingOrdinal = fishingOrdinalByIndex.get(index) ?? 0;
    const fishingAsset = fishing
      ? northAtlanticFishingAssets[
          (hash(`${seed}:fishing-asset-order`) + fishingOrdinal) %
            northAtlanticFishingAssets.length
        ]
      : undefined;
    const baseCountryId =
      (inbound && spawn.category === "merchant_vessel"
        ? (lane.countryIds[1] ?? spawn.nationality)
        : spawn.nationality) ??
      lane.countryIds[0] ??
      "norway";
    const merchant = spawn.category === "merchant_vessel";
    const merchantInTemplate = merchant && Boolean(template);
    const cargoOrdinal = cargoOrdinalByIndex.get(index) ?? 0;
    const cargoCountryPool = merchantInTemplate
      ? Array.from(
          new Set(
            lane.countryIds.length > 1
              ? [...lane.countryIds, ...northSeaCargoCountries]
              : lane.countryIds,
          ),
        ).filter((countryId) => cargoVesselNames[countryId])
      : [];
    const cargoCountryId =
      merchant && cargoCountryPool.length > 0
        ? (cargoCountryPool[
            (hash(`${seed}:cargo-country`) + cargoOrdinal) %
              cargoCountryPool.length
          ] ?? baseCountryId)
        : baseCountryId;
    const cargoAsset = merchantInTemplate
      ? spawn.kind === "cruise"
        ? northAtlanticCargoAssets[2]
        : northAtlanticCargoAssets[
            (hash(`${seed}:cargo-asset`) + cargoOrdinal) %
              northAtlanticCargoAssets.length
          ]
      : undefined;
    const countryId =
      fishingAsset?.countryId ?? cargoCountryId ?? baseCountryId;
    const vesselNameOrdinal =
      (fishing ? fishingNameCountByCountry : cargoNameCountByCountry).get(
        countryId,
      ) ?? 0;
    const vesselName = fishing
      ? fishingVesselName(countryId, vesselNameOrdinal, seed)
      : merchantInTemplate
        ? cargoVesselName(countryId, vesselNameOrdinal, seed)
        : undefined;
    if (fishing)
      fishingNameCountByCountry.set(countryId, vesselNameOrdinal + 1);
    if (merchant) cargoNameCountByCountry.set(countryId, vesselNameOrdinal + 1);
    const stopped = fishing && stoppedFishingIndices.has(index);
    const radarActive = fishing && radarOnFishingIndices.has(index);
    const stoppedMerchant =
      merchant &&
      randomFor("merchant-stop", index) < (templateUnit.nearPort ? 0.35 : 0.06);
    const stoppedUnit = stopped || stoppedMerchant;
    const telegraph = stoppedUnit
      ? 0
      : fishing
        ? 1 + (hash(`${seed}:fishing-speed:${index}`) % 3)
        : merchant && templateUnit.nearPort
          ? 1
          : merchant
            ? 2
            : undefined;
    return {
      id: `${spawn.id}-contact-${index + 1}`,
      role:
        spawn.kind === "merchant" || spawn.kind === "civilian_air"
          ? "civilian"
          : "neutral",
      category: spawn.category,
      countryId,
      position: templateUnit.position ?? placement.position,
      directionVector: placement.vector,
      bearingDegrees: fishing
        ? hash(`${seed}:fishing-heading:${index}`) % 360
        : placement.bearing,
      identificationRequired: spawn.identificationRequired,
      placeholder: true,
      ...(telegraph !== undefined ? { telegraph } : {}),
      ...(fishing ? { radarActive } : {}),
      ...(templateUnit.nearPort ? { nearPort: true } : {}),
      ...(spawn.category === "civilian_aircraft"
        ? { airTrafficDirection: inbound ? "inbound" : "outbound" }
        : {}),
      ...(vesselName ? { vesselName } : {}),
      ...(fishingAsset
        ? {
            nativeType: fishingAsset.type,
            nativeVariant: fishingAsset.variant,
            ...(fishingAsset.nation
              ? { nativeNation: fishingAsset.nation }
              : {}),
            contactTypeLabel: fishingAsset.label,
          }
        : {}),
      ...(cargoAsset
        ? {
            nativeType: cargoAsset.type,
            nativeVariant: cargoAsset.variant,
            contactTypeLabel: cargoAsset.label,
          }
        : {}),
      ...(templateUnit.spawnZoneId
        ? { spawnZoneId: templateUnit.spawnZoneId }
        : {}),
      ...(templateUnit.nativePosition
        ? { nativePosition: templateUnit.nativePosition }
        : {}),
      ...(stoppedUnit
        ? { nativeWaypoints: [] }
        : templateUnit.nativeWaypoints
          ? { nativeWaypoints: templateUnit.nativeWaypoints }
          : {}),
    };
  });
  if (template) {
    const fishingZones = zonesForRole(template, "fishing");
    let biologicIndex = 0;
    fishingZones.forEach((zone, zoneIndex) => {
      const density = hash(`${seed}:biologic-density:${zone.id}`) % 3;
      const count =
        density === 0 || (biologicIndex === 0 && zoneIndex === 0)
          ? 1
          : density === 1
            ? 2
            : 0;
      for (let localIndex = 0; localIndex < count; localIndex += 1) {
        const sampled = sampleTemplateZone(
          zone,
          template,
          `${seed}:biologic:${zone.id}`,
          localIndex,
        );
        const asset = northAtlanticBiologicAssets[
          (hash(`${seed}:biologic-type:${zone.id}`) + localIndex) %
            northAtlanticBiologicAssets.length
        ] ?? { type: "bio_fin_whale", label: "Fin whale" };
        units.push({
          id: `${lane.id}-biologic-${biologicIndex + 1}`,
          role: "neutral",
          category: "biological",
          countryId: "norway",
          position: sampled.geo,
          directionVector: [0, 0],
          bearingDegrees:
            hash(`${seed}:biologic-heading:${zoneIndex}:${localIndex}`) % 360,
          identificationRequired: false,
          placeholder: true,
          spawnZoneId: zone.id,
          nativePosition: [sampled.local[0], "shallow", sampled.local[1]],
          telegraph: 2,
          nativeType: asset.type,
          nativeVariant: "Default",
          contactTypeLabel: asset.label,
        });
        biologicIndex += 1;
      }
    });
  }
  if (possibleMilitary) {
    const surfaceOffset =
      hash(`${seed}:opfor-surface`) % opforSurfacePool.length;
    const submarineOffset =
      hash(`${seed}:opfor-submarine`) % opforSubmarinePool.length;

    opforSurfacePool.forEach((asset, assetIndex) => {
      const selected =
        opforSurfacePool[
          (surfaceOffset + assetIndex) % opforSurfacePool.length
        ] ?? asset;
      const indexBase = units.length + assetIndex;
      const placement = positionOnLane(lane, seed, indexBase, totalUnits + 8);
      const templateUnit = templatePlacement(
        selected.category,
        "possible_military",
        indexBase,
      );
      units.push({
        id: `${lane.id}-possible-surface-${assetIndex + 1}`,
        role: "possible_military",
        category: selected.category,
        countryId: selected.countryId,
        position: templateUnit.position ?? placement.position,
        directionVector: placement.vector,
        bearingDegrees: placement.bearing,
        identificationRequired: true,
        placeholder: true,
        nativeType: selected.type,
        nativeVariant: selected.variant,
        spawnChance: selected.spawnChance,
        ...(templateUnit.spawnZoneId
          ? { spawnZoneId: templateUnit.spawnZoneId }
          : {}),
        ...(templateUnit.nativePosition
          ? { nativePosition: templateUnit.nativePosition }
          : {}),
        ...(templateUnit.nativeWaypoints
          ? { nativeWaypoints: templateUnit.nativeWaypoints }
          : {}),
      });
    });

    const submarineCandidates = 5;
    for (
      let candidateIndex = 0;
      candidateIndex < submarineCandidates;
      candidateIndex += 1
    ) {
      const selected =
        opforSubmarinePool[
          (submarineOffset + candidateIndex) % opforSubmarinePool.length
        ] ?? opforSubmarinePool[0]!;
      const indexBase = units.length + candidateIndex;
      const placement = positionOnLane(lane, seed, indexBase, totalUnits + 10);
      const templateUnit = templatePlacement(
        "submarine",
        "possible_military",
        indexBase,
      );
      units.push({
        id: `${lane.id}-possible-submarine-${candidateIndex + 1}`,
        role: "possible_military",
        category: "submarine",
        countryId: selected.countryId,
        position: templateUnit.position ?? placement.position,
        directionVector: placement.vector,
        bearingDegrees: placement.bearing,
        identificationRequired: true,
        placeholder: true,
        nativeType: selected.type,
        nativeVariant: selected.variant,
        spawnChance:
          opforSubmarineSpawnChances[
            candidateIndex % opforSubmarineSpawnChances.length
          ] ?? 0.2,
        ...(templateUnit.spawnZoneId
          ? { spawnZoneId: templateUnit.spawnZoneId }
          : {}),
        ...(templateUnit.nativePosition
          ? { nativePosition: templateUnit.nativePosition }
          : {}),
        ...(templateUnit.nativeWaypoints
          ? { nativeWaypoints: templateUnit.nativeWaypoints }
          : {}),
      });
    }
  }
  const bearing = bearingDegrees(first, last);
  const mission: GeneratedLaneMission = {
    id: `lane-mission-${lane.id}-${seed}`,
    title: `Generated ${lane.name} patrol picture`,
    laneId: lane.id,
    laneName: lane.name,
    seed,
    playerCountryId,
    origin,
    candidateCountries: [...new Set(lane.countryIds)],
    directionVector: direction,
    bearingDegrees: Number(bearing.toFixed(1)),
    waypoints: lane.coordinates.map(([latitude, longitude]) => [
      latitude,
      longitude,
    ]),
    units,
    guidance:
      "Placeholder positions are deterministic for this seed. Identify every contact before engagement; replace placeholders with scenario units during mission export.",
  };
  if (campaignTime !== undefined) mission.campaignTime = campaignTime;
  if (template) {
    mission.nativeMapCenter = template.mapCenter;
    const player = template.zones.find((zone) => zone.id === "Zone1");
    if (player) {
      const local = geoToTemplateLocal(origin, template.mapCenter);
      mission.nativeOriginPosition = [local[0], "0", local[1]];
    }
    const merchantRoute = template.routes.find(
      (route) => route.kind === "merchant",
    );
    const playerRoute = template.routes.find(
      (route) => route.kind === "player",
    );
    if (playerRoute) mission.nativeWaypoints = playerRoute.waypoints;
    if (playerRoute?.rawWaypoints?.length)
      mission.nativeWaypointTokens = playerRoute.rawWaypoints;
    else if (merchantRoute) mission.nativeWaypoints = merchantRoute.waypoints;
    if (template.landUnits.length)
      mission.nativeLandUnits = applyCampaignLandUnitState(
        template.landUnits,
        generationConfig,
      );
    if (template.mapSymbols.length)
      mission.nativeMapSymbols = template.mapSymbols;
    if (template.zones.length) mission.nativeZones = template.zones;
  }
  return mission;
}
