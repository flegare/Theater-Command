export type HexTerrainType =
  | "deep_sea"
  | "coastal_waters"
  | "strait_chokepoint"
  | "plains"
  | "forest"
  | "mountain_fjord"
  | "urban_metropolis"
  | "island";

export type HexStrategicFacility =
  | "naval_base"
  | "air_base"
  | "refinery"
  | "offshore_rig"
  | "shipyard"
  | "radar_site"
  | "coastal_fort";

export type HexCellOwnership = {
  side: "blufor" | "opfor" | "neutral";
  countryId: string;
};

export type HexCellYields = {
  fundsRevenue: number;
  productionPoints: number;
  energyFuel: number;
};

export type HexChildSite = {
  id: string;
  name: string;
  kind:
    | "naval_base"
    | "air_base"
    | "world_port"
    | "factory"
    | "fuel_terminal"
    | "radar_site"
    | "aa_site"
    | "firing_range";
  latitude: number;
  longitude: number;
  output?: string;
  status?: "operational" | "damaged" | "destroyed";
};

export type HexPotentialInfrastructure = {
  id: string;
  name: string;
  costFunds: number;
  costProduction: number;
  effect: string;
};

export type StrategicHexCell = {
  id: string;
  axial: { q: number; r: number };
  name: string;
  centroid: [number, number]; // [lat, lon]
  polygon: Array<[number, number]>; // 6 [lat, lon] vertices
  terrain: HexTerrainType;
  ownership: HexCellOwnership;
  yields: HexCellYields;
  facilities: HexStrategicFacility[];
  neighbors: string[];
  isCoreTheater: boolean;
  coldWarContext?: string;
  population?: number;
  economicActivities?: string[];
  childSites?: HexChildSite[];
  potentialInfrastructure?: HexPotentialInfrastructure[];
};

export const TOTAL_LONGITUDE_COLUMNS = 134; // 360 / 134 ≈ 2.6865 deg per column
export const HEX_SPACING_LON = 360 / TOTAL_LONGITUDE_COLUMNS;
export const MERCATOR_SPACING_X = (2 * Math.PI) / TOTAL_LONGITUDE_COLUMNS;
export const MERCATOR_SPACING_Y = (Math.sqrt(3) / 2) * MERCATOR_SPACING_X;
export const MERCATOR_RADIUS = MERCATOR_SPACING_X / Math.sqrt(3);
export const HEX_SPACING_LAT = (MERCATOR_SPACING_Y * 180) / Math.PI;

/**
 * Normalizes longitude to [-180, 180) degrees.
 */
export function normalizeLongitude(lon: number): number {
  let normalized = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (normalized >= 180) normalized = -180;
  return Number(normalized.toFixed(4));
}

/**
 * Converts geographic [latitude, longitude] to conformal Mercator coordinates [x, y] in radians.
 */
export function latLonToMercator(
  lat: number,
  lon: number,
): [x: number, y: number] {
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const x = (lon * Math.PI) / 180;
  const rad = (clampedLat * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return [x, y];
}

/**
 * Converts conformal Mercator coordinates [x, y] in radians to geographic [latitude, longitude].
 */
export function mercatorToLatLon(
  x: number,
  y: number,
): [latitude: number, longitude: number] {
  const lon = (x * 180) / Math.PI;
  const lat = ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
  return [Number(lat.toFixed(4)), Number(normalizeLongitude(lon).toFixed(4))];
}

/**
 * Converts axial coordinates (q, r) to geographic [latitude, longitude] with Mercator compensation.
 */
export function axialToCoordinates(
  q: number,
  r: number,
): [latitude: number, longitude: number] {
  const y = r * MERCATOR_SPACING_Y;
  const x = (q + r * 0.5) * MERCATOR_SPACING_X;
  return mercatorToLatLon(x, y);
}

/**
 * Converts geographic [latitude, longitude] to continuous axial coordinates { q, r }.
 */
export function coordinatesToAxial(
  latitude: number,
  longitude: number,
): { q: number; r: number } {
  const [x, y] = latLonToMercator(latitude, longitude);
  const r = Math.round(y / MERCATOR_SPACING_Y);
  const q = Math.round(x / MERCATOR_SPACING_X - r * 0.5);
  return { q, r };
}

/**
 * Generates regular 6-vertex hexagon polygon with exact seamless tessellation geometry.
 */
export function generateHexPolygon(
  centroidLat: number,
  centroidLon: number,
): Array<[number, number]> {
  const [cx, cy] = latLonToMercator(centroidLat, centroidLon);
  const vertices: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const angleRad = (Math.PI / 180) * (60 * i + 30);
    const vx = cx + MERCATOR_RADIUS * Math.cos(angleRad);
    const vy = cy + MERCATOR_RADIUS * Math.sin(angleRad);
    vertices.push(mercatorToLatLon(vx, vy));
  }
  return vertices;
}

/**
 * Returns the 6 adjacent axial neighbor coordinates with spherical antimeridian wrapping.
 */
export function getAxialNeighbors(
  q: number,
  r: number,
): Array<{ q: number; r: number; hexId: string }> {
  const directions = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  return directions.map((dir) => {
    const nq = q + dir.q;
    const nr = r + dir.r;
    return {
      q: nq,
      r: nr,
      hexId: getHexIdForAxial(nq, nr),
    };
  });
}

/**
 * Calculates shortest spherical step distance between two axial hex coordinates,
 * taking into account longitudinal antimeridian wrapping.
 */
export function getAxialDistance(
  q1OrC1: number | { q: number; r: number },
  r1OrC2: number | { q: number; r: number },
  q2?: number,
  r2?: number,
): number {
  let q1: number, r1: number, q2Val: number, r2Val: number;
  if (typeof q1OrC1 === "object" && typeof r1OrC2 === "object") {
    q1 = q1OrC1.q;
    r1 = q1OrC1.r;
    q2Val = r1OrC2.q;
    r2Val = r1OrC2.r;
  } else {
    q1 = q1OrC1 as number;
    r1 = r1OrC2 as number;
    q2Val = q2 ?? 0;
    r2Val = r2 ?? 0;
  }
  const dr = r1 - r2Val;
  const period = TOTAL_LONGITUDE_COLUMNS;
  const rawDq = q1 - q2Val;
  const dq = (((rawDq % period) + period + period / 2) % period) - period / 2;
  const ds = -dq - dr;
  return Math.round((Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2);
}

export function axialToLatLon(
  q: number,
  r: number,
): { latitude: number; longitude: number } {
  const [lat, lon] = axialToCoordinates(q, r);
  return { latitude: lat, longitude: lon };
}

export function latLonToAxial(
  latitude: number,
  longitude: number,
): { q: number; r: number } {
  return coordinatesToAxial(latitude, longitude);
}

export function getHexIdForAxial(q: number, r: number): string {
  // Check if this matches a handcrafted core hex first
  const core = normalizedBalticCoreHexList.find(
    (h) => h.axial.q === q && h.axial.r === r,
  );
  if (core) return core.id;
  return `hex-w-q${q >= 0 ? `p${q}` : `m${Math.abs(q)}`}-r${r >= 0 ? `p${r}` : `m${Math.abs(r)}`}`;
}

// -------------------------------------------------------------------------
// HANDCRAFTED BALTIC & NORTHERN FLANK CORE HEXES (30+ High-Fidelity Hubs)
// -------------------------------------------------------------------------

const balticCoreHexList: StrategicHexCell[] = [
  {
    id: "hex-nor-bergen",
    axial: { q: -15, r: 33 }, // lat 60.2, lon 5.2
    name: "Bergen / Rogaland / Troll-A Gate",
    centroid: [60.2, 5.2],
    polygon: generateHexPolygon(60.2, 5.2),
    terrain: "mountain_fjord",
    ownership: { side: "blufor", countryId: "norway" },
    yields: { fundsRevenue: 35, productionPoints: 15, energyFuel: 40 },
    facilities: ["naval_base", "air_base", "refinery", "offshore_rig"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Primary Royal Norwegian Navy operational hub and NATO North Atlantic reinforcement terminal. Home to Haakonsvern Naval Base, Flesland Air Station staging 332 Sqn F-16s, and Mongstad crude refining terminal.",
    population: 210000,
    economicActivities: [
      "naval_shipbuilding",
      "deepwater_oil_extraction",
      "crude_refining",
      "commercial_shipping",
      "coastal_fisheries",
    ],
    childSites: [
      {
        id: "bergen-naval",
        name: "Haakonsvern Naval Base",
        kind: "naval_base",
        latitude: 60.334,
        longitude: 5.222,
        output: "Frigate and coastal submarine berths",
        status: "operational",
      },
      {
        id: "bergen-airport",
        name: "Flesland Air Station",
        kind: "air_base",
        latitude: 60.293,
        longitude: 5.218,
        output: "RNoAF 332 Sqn F-16A readiness",
        status: "operational",
      },
      {
        id: "bergen-port",
        name: "Port of Bergen Commercial Docks",
        kind: "world_port",
        latitude: 60.393,
        longitude: 5.323,
        output: "Bulk freight & merchant convoy loading",
        status: "operational",
      },
      {
        id: "bergen-aa",
        name: "Flesland I-HAWK SAM Battery",
        kind: "aa_site",
        latitude: 60.285,
        longitude: 5.24,
        output: "Point air defense umbrella",
        status: "operational",
      },
      {
        id: "mongstad-refinery",
        name: "Mongstad Petroleum Refinery",
        kind: "fuel_terminal",
        latitude: 60.81,
        longitude: 5.03,
        output: "High-octane naval distillates",
        status: "operational",
      },
      {
        id: "troll-rig",
        name: "Statfjord / Troll Maritime Platform",
        kind: "firing_range",
        latitude: 61.25,
        longitude: 1.85,
        output: "North Sea petroleum extraction",
        status: "operational",
      },
    ],
    potentialInfrastructure: [
      {
        id: "opt-bergen-sam",
        name: "Reinforce I-HAWK SAM Battery",
        costFunds: 180,
        costProduction: 25,
        effect: "+2 Point Defense against Soviet ASM strikes",
      },
      {
        id: "opt-bergen-has",
        name: "Construct Hardened Aircraft Shelters",
        costFunds: 140,
        costProduction: 40,
        effect: "Protects F-16 wings against airfield suppression",
      },
      {
        id: "opt-bergen-fuel",
        name: "Underground Fuel Storage Tanks",
        costFunds: 110,
        costProduction: 30,
        effect: "+50 bbl/d emergency reserve storage",
      },
    ],
  },
  {
    id: "hex-nor-oslo",
    axial: { q: -12, r: 32 }, // lat 59.6, lon 10.7
    name: "Oslofjord / Eastern Norway",
    centroid: [59.6, 10.7],
    polygon: generateHexPolygon(59.6, 10.7),
    terrain: "urban_metropolis",
    ownership: { side: "blufor", countryId: "norway" },
    yields: { fundsRevenue: 45, productionPoints: 30, energyFuel: 15 },
    facilities: ["naval_base", "air_base", "shipyard"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "National command headquarters, industrial mobilization center, and defense manufacturing complex at Kongsberg producing Penguin anti-ship missiles.",
    population: 450000,
    economicActivities: [
      "guided_missiles",
      "heavy_machinery",
      "electronics",
      "government_administration",
      "telecommunications",
    ],
    childSites: [
      {
        id: "oslo-command",
        name: "Forsvarets Overkommando (Huseby HQ)",
        kind: "world_port",
        latitude: 59.94,
        longitude: 10.66,
        output: "Strategic Command & Allied Coordination",
        status: "operational",
      },
      {
        id: "kongsberg-factory",
        name: "Kongsberg Våpenfabrikk",
        kind: "factory",
        latitude: 59.67,
        longitude: 9.65,
        output: "Penguin Anti-Ship Missile production",
        status: "operational",
      },
      {
        id: "rygge-air",
        name: "Rygge Air Station",
        kind: "air_base",
        latitude: 59.378,
        longitude: 10.785,
        output: "Air defense interceptor wing",
        status: "operational",
      },
      {
        id: "horten-naval",
        name: "Karljohansvern Naval Shipyard (Horten)",
        kind: "naval_base",
        latitude: 59.425,
        longitude: 10.485,
        output: "Kobben-class submarine maintenance",
        status: "operational",
      },
    ],
    potentialInfrastructure: [
      {
        id: "opt-oslo-missile",
        name: "Expand Penguin Missile Assembly Lines",
        costFunds: 220,
        costProduction: 50,
        effect: "+15 Daily Production capacity",
      },
    ],
  },
  {
    id: "hex-nor-trondheim",
    axial: { q: -14, r: 36 },
    name: "Trondheim / Orland Air Base",
    centroid: [63.4, 10.2],
    polygon: generateHexPolygon(63.4, 10.2),
    terrain: "mountain_fjord",
    ownership: { side: "blufor", countryId: "norway" },
    yields: { fundsRevenue: 25, productionPoints: 20, energyFuel: 10 },
    facilities: ["naval_base", "air_base", "coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Central Norway fortress sector and prepositioned US Marine Corps Equipment caves (NALMEB). Ørland Air Base hosts NATO AWACS forward operations.",
    population: 135000,
    economicActivities: [
      "allied_prepositioning",
      "tactical_radar_surveillance",
      "coastal_heavy_engineering",
    ],
    childSites: [
      {
        id: "orland-air",
        name: "Ørland Main Air Station",
        kind: "air_base",
        latitude: 63.7,
        longitude: 9.6,
        output: "NATO E-3A Sentry AWACS & 338 Sqn F-16",
        status: "operational",
      },
      {
        id: "trondheim-port",
        name: "Port of Trondheim & Fjord Anchorage",
        kind: "world_port",
        latitude: 63.43,
        longitude: 10.39,
        output: "US Marine heavy prepositioning terminal",
        status: "operational",
      },
      {
        id: "vaernes-air",
        name: "Værnes Military Air Station",
        kind: "air_base",
        latitude: 63.457,
        longitude: 10.924,
        output: "Allied transport staging & airlift receiving",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-nor-bodo",
    axial: { q: -15, r: 40 },
    name: "Bodø Main Air Station / NATO HQ North",
    centroid: [67.3, 14.4],
    polygon: generateHexPolygon(67.3, 14.4),
    terrain: "mountain_fjord",
    ownership: { side: "blufor", countryId: "norway" },
    yields: { fundsRevenue: 20, productionPoints: 15, energyFuel: 10 },
    facilities: ["naval_base", "air_base", "radar_site"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Headquarters of Allied Forces Northern Norway (NON). Primary forward operating base for QRA F-16 fighters and Sea King SAR.",
    population: 35000,
    economicActivities: [
      "forward_air_defense",
      "maritime_surveillance",
      "arctic_logistics",
    ],
    childSites: [
      {
        id: "bodo-air-base",
        name: "Bodø Main Air Station",
        kind: "air_base",
        latitude: 67.269,
        longitude: 14.365,
        output: "331/334 Sqn F-16 QRA interceptors",
        status: "operational",
      },
      {
        id: "bodo-hq",
        name: "Reitan Joint Operational Headquarters",
        kind: "radar_site",
        latitude: 67.31,
        longitude: 14.62,
        output: "Hardened underground mountain C2 bunker",
        status: "operational",
      },
      {
        id: "bodo-naval",
        name: "Bodø Coastal Patrol Station",
        kind: "naval_base",
        latitude: 67.28,
        longitude: 14.38,
        output: "Hauk-class fast missile boat replenishment",
        status: "operational",
      },
      {
        id: "bodo-sam",
        name: "Bodø NOAH (Norwegian Adapted HAWK)",
        kind: "aa_site",
        latitude: 67.26,
        longitude: 14.41,
        output: "Base air defense perimeter",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-nor-tromso",
    axial: { q: -14, r: 42 },
    name: "Tromsø / Olavsvern Submarine Base",
    centroid: [69.6, 19.0],
    polygon: generateHexPolygon(69.6, 19.0),
    terrain: "mountain_fjord",
    ownership: { side: "blufor", countryId: "norway" },
    yields: { fundsRevenue: 20, productionPoints: 10, energyFuel: 10 },
    facilities: ["naval_base", "coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Sub-arctic naval redoubt and fortress. Home to Olavsvern mountain submarine pens carved into solid granite for covert allied submarine support.",
    population: 50000,
    economicActivities: [
      "arctic_submarine_bunkering",
      "signals_intelligence",
      "polar_transport",
    ],
    childSites: [
      {
        id: "olavsvern-naval",
        name: "Olavsvern Submarine Base (Rock Pens)",
        kind: "naval_base",
        latitude: 69.51,
        longitude: 19.02,
        output: "Covert nuclear & diesel submarine resupply",
        status: "operational",
      },
      {
        id: "bardufoss-air",
        name: "Bardufoss Air Station",
        kind: "air_base",
        latitude: 69.056,
        longitude: 18.54,
        output: "Allied Arctic Brigade helicopter & CAS staging",
        status: "operational",
      },
      {
        id: "tromso-port",
        name: "Port of Tromsø Arctic Terminal",
        kind: "world_port",
        latitude: 69.65,
        longitude: 18.96,
        output: "Northern Norway supply lifeline",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-nor-finnmark",
    axial: { q: -10, r: 43 },
    name: "Finnmark / Vardø Radar Sentry",
    centroid: [70.4, 30.8],
    polygon: generateHexPolygon(70.4, 30.8),
    terrain: "mountain_fjord",
    ownership: { side: "blufor", countryId: "norway" },
    yields: { fundsRevenue: 10, productionPoints: 5, energyFuel: 5 },
    facilities: ["radar_site", "coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Front-line NATO Arctic border watching the Kola Peninsula. High-power early-warning radar arrays at Vardø track Soviet ballistic missile tests and Northern Fleet sorties.",
    population: 18000,
    economicActivities: [
      "early_warning_radar",
      "electronic_surveillance",
      "arctic_border_guard",
    ],
    childSites: [
      {
        id: "vardo-radar",
        name: "Globus / Vardø Early Warning Radar",
        kind: "radar_site",
        latitude: 70.37,
        longitude: 31.1,
        output: "Long-range ballistic missile & aerospace tracking",
        status: "operational",
      },
      {
        id: "banak-air",
        name: "Banak Air Station (Lakselv)",
        kind: "air_base",
        latitude: 70.067,
        longitude: 24.973,
        output: "Arctic interceptor strip & maritime SAR",
        status: "operational",
      },
      {
        id: "kirkenes-border",
        name: "Garrison Sør-Varanger (GSV)",
        kind: "firing_range",
        latitude: 69.727,
        longitude: 30.045,
        output: "Soviet-Norwegian border surveillance force",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-den-skagerrak",
    axial: { q: -12, r: 31 },
    name: "Skagerrak Chokepoint",
    centroid: [57.8, 8.5],
    polygon: generateHexPolygon(57.8, 8.5),
    terrain: "strait_chokepoint",
    ownership: { side: "blufor", countryId: "denmark" },
    yields: { fundsRevenue: 20, productionPoints: 5, energyFuel: 5 },
    facilities: ["coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Western gateway connecting North Sea and Baltic approaches. Critical submarine transit lane monitored by Danish and Norwegian maritime patrol aircraft.",
    population: 45000,
    economicActivities: [
      "maritime_traffic_control",
      "deepwater_fishing",
      "channel_surveillance",
    ],
  },
  {
    id: "hex-den-kattegat",
    axial: { q: -11, r: 30 },
    name: "Kattegat Chokepoint",
    centroid: [56.7, 11.8],
    polygon: generateHexPolygon(56.7, 11.8),
    terrain: "strait_chokepoint",
    ownership: { side: "blufor", countryId: "denmark" },
    yields: { fundsRevenue: 25, productionPoints: 10, energyFuel: 5 },
    facilities: ["coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Narrow Danish strait controlling access into the Great Belt and Baltic Sea.",
    population: 60000,
    economicActivities: ["strait_interdiction", "commercial_shipping"],
  },
  {
    id: "hex-den-copenhagen",
    axial: { q: -10, r: 29 },
    name: "Copenhagen / Zealand / Sound Gate",
    centroid: [55.7, 12.6],
    polygon: generateHexPolygon(55.7, 12.6),
    terrain: "urban_metropolis",
    ownership: { side: "blufor", countryId: "denmark" },
    yields: { fundsRevenue: 40, productionPoints: 25, energyFuel: 10 },
    facilities: ["naval_base", "air_base", "coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Capital of Denmark and NATO Baltic Approaches (BALTAP) operational hub.",
    population: 1350000,
    economicActivities: [
      "naval_command",
      "precision_electronics",
      "commercial_transit",
    ],
    childSites: [
      {
        id: "holmen-naval",
        name: "Holmen Royal Danish Naval Base",
        kind: "naval_base",
        latitude: 55.685,
        longitude: 12.602,
        output: "Frigate and minelayer squadrons",
        status: "operational",
      },
      {
        id: "vaerlose-air",
        name: "Værløse Air Base",
        kind: "air_base",
        latitude: 55.77,
        longitude: 12.35,
        output: "Danish Air Force maritime patrol & C-130",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-den-jutland",
    axial: { q: -11, r: 29 },
    name: "Jutland / Karup Air Base",
    centroid: [56.2, 9.1],
    polygon: generateHexPolygon(56.2, 9.1),
    terrain: "plains",
    ownership: { side: "blufor", countryId: "denmark" },
    yields: { fundsRevenue: 30, productionPoints: 20, energyFuel: 5 },
    facilities: ["air_base", "coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Headquarters of NATO Allied Command Baltic Approaches (BALTAP) bunker complex at Karup.",
    population: 250000,
    economicActivities: ["air_interception", "ground_force_staging"],
    childSites: [
      {
        id: "karup-hq",
        name: "HQ BALTAP & Karup Air Base",
        kind: "air_base",
        latitude: 56.296,
        longitude: 9.099,
        output: "F-16 fighter-bomber wings & NATO bunker",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-bal-bornholm",
    axial: { q: -8, r: 28 },
    name: "Bornholm Island Baltic Bastion",
    centroid: [55.1, 14.9],
    polygon: generateHexPolygon(55.1, 14.9),
    terrain: "island",
    ownership: { side: "blufor", countryId: "denmark" },
    yields: { fundsRevenue: 15, productionPoints: 5, energyFuel: 5 },
    facilities: ["radar_site", "coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Front-line Danish island in the central Baltic. Crucial signals intelligence (SIGINT) station intercepting Soviet Baltic Fleet transmissions.",
    population: 47000,
    economicActivities: ["signals_intelligence", "baltic_sea_reconnaissance"],
    childSites: [
      {
        id: "dueodde-radar",
        name: "Dueodde SIGINT & Radar Array",
        kind: "radar_site",
        latitude: 54.99,
        longitude: 15.07,
        output: "High-frequency Soviet radar & radio intercept",
        status: "operational",
      },
      {
        id: "ronne-port",
        name: "Port of Rønne",
        kind: "world_port",
        latitude: 55.098,
        longitude: 14.695,
        output: "Fast torpedo boat & minelayer shelter",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-bal-gotland",
    axial: { q: -8, r: 30 },
    name: "Gotland Island Strategic Bastion",
    centroid: [57.5, 18.5],
    polygon: generateHexPolygon(57.5, 18.5),
    terrain: "island",
    ownership: { side: "neutral", countryId: "sweden" },
    yields: { fundsRevenue: 20, productionPoints: 10, energyFuel: 5 },
    facilities: ["radar_site", "air_base", "coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Sweden's unsinkable aircraft carrier in the central Baltic Sea. Heavily fortified with underground coastal artillery and Viggen interceptors.",
    population: 55000,
    economicActivities: [
      "armed_neutrality_defense",
      "baltic_surveillance",
      "limestone_extraction",
    ],
    childSites: [
      {
        id: "visby-air",
        name: "Visby Airfield (F13G Detachment)",
        kind: "air_base",
        latitude: 57.663,
        longitude: 18.346,
        output: "JA-37 Viggen QRA interceptors",
        status: "operational",
      },
      {
        id: "visby-port",
        name: "Port of Visby & Coastal Battery",
        kind: "world_port",
        latitude: 57.635,
        longitude: 18.29,
        output: "Spica-class torpedo boat anchorage",
        status: "operational",
      },
      {
        id: "tingstade-radar",
        name: "Tingstäde Radar Fortress",
        kind: "radar_site",
        latitude: 57.735,
        longitude: 18.625,
        output: "Underground Baltic air surveillance radar",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-swe-karlskrona",
    axial: { q: -9, r: 29 },
    name: "Karlskrona / Swedish Naval HQ",
    centroid: [56.2, 15.6],
    polygon: generateHexPolygon(56.2, 15.6),
    terrain: "urban_metropolis",
    ownership: { side: "neutral", countryId: "sweden" },
    yields: { fundsRevenue: 35, productionPoints: 30, energyFuel: 10 },
    facilities: ["naval_base", "shipyard"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Headquarters of the Royal Swedish Navy and Kockums submarine yards. Site of the famous 1981 'Whiskey on the Rocks' Soviet submarine incident.",
    population: 60000,
    economicActivities: [
      "submarine_manufacturing",
      "naval_command",
      "telecommunications",
    ],
    childSites: [
      {
        id: "karlskrona-naval",
        name: "Karlskrona Naval Base HQ",
        kind: "naval_base",
        latitude: 56.16,
        longitude: 15.585,
        output: "Swedish Coastal Fleet flagship & missile boats",
        status: "operational",
      },
      {
        id: "kockums-shipyard",
        name: "Kockums Submarine Shipyard",
        kind: "factory",
        latitude: 56.155,
        longitude: 15.59,
        output: "Näcken-class stealth submarine construction",
        status: "operational",
      },
      {
        id: "ronneby-air",
        name: "F17 Kallinge Blekinge Wing",
        kind: "air_base",
        latitude: 56.267,
        longitude: 15.265,
        output: "AJ-37 Viggen maritime strike squadrons",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-swe-stockholm",
    axial: { q: -9, r: 32 },
    name: "Stockholm / Muskö Underground Naval Base",
    centroid: [59.3, 18.1],
    polygon: generateHexPolygon(59.3, 18.1),
    terrain: "urban_metropolis",
    ownership: { side: "neutral", countryId: "sweden" },
    yields: { fundsRevenue: 50, productionPoints: 35, energyFuel: 10 },
    facilities: ["naval_base", "air_base", "shipyard"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Capital of Sweden and home to the world's most advanced subterranean naval base inside Mount Muskö, capable of docking entire destroyers inside bomb-proof caves.",
    population: 1400000,
    economicActivities: [
      "advanced_electronics",
      "aerospace_engineering",
      "government_administration",
    ],
    childSites: [
      {
        id: "musko-naval",
        name: "Muskö Underground Naval Fortress",
        kind: "naval_base",
        latitude: 58.98,
        longitude: 18.08,
        output: "Subterranean dry docks & fleet command",
        status: "operational",
      },
      {
        id: "barkarby-air",
        name: "F8 Barkarby Air Base",
        kind: "air_base",
        latitude: 59.418,
        longitude: 17.886,
        output: "Capital air defense & radar guidance",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-ger-kiel",
    axial: { q: -10, r: 28 },
    name: "Kiel / Holtenau Canal / German Bight",
    centroid: [54.3, 10.1],
    polygon: generateHexPolygon(54.3, 10.1),
    terrain: "urban_metropolis",
    ownership: { side: "blufor", countryId: "west-germany" },
    yields: { fundsRevenue: 50, productionPoints: 40, energyFuel: 20 },
    facilities: ["naval_base", "air_base", "shipyard", "refinery"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Federal German Navy (Bundesmarine) headquarters and western gateway to the Baltic via the Kiel Canal.",
    population: 250000,
    economicActivities: [
      "diesel_submarine_building",
      "canal_transit",
      "heavy_naval_engineering",
    ],
    childSites: [
      {
        id: "kiel-naval-base",
        name: "Kiel-Tirpitzhafen Naval Base",
        kind: "naval_base",
        latitude: 54.34,
        longitude: 10.15,
        output: "Type 206 submarine flotilla & destroyers",
        status: "operational",
      },
      {
        id: "hdw-kiel",
        name: "Howaldtswerke-Deutsche Werft (HDW)",
        kind: "factory",
        latitude: 54.32,
        longitude: 10.16,
        output: "Export submarine construction & heavy drydock",
        status: "operational",
      },
      {
        id: "jagel-air-base",
        name: "Jagel Air Base (Marineflieger MFG-1)",
        kind: "air_base",
        latitude: 54.458,
        longitude: 9.516,
        output: "Panavia Tornado IDS maritime strike",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-ger-rostock",
    axial: { q: -9, r: 28 },
    name: "Rostock / East German Littoral",
    centroid: [54.1, 12.1],
    polygon: generateHexPolygon(54.1, 12.1),
    terrain: "coastal_waters",
    ownership: { side: "opfor", countryId: "east-germany" },
    yields: { fundsRevenue: 40, productionPoints: 30, energyFuel: 20 },
    facilities: ["naval_base", "refinery"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Main base of the East German Volksmarine (Peoples Navy) and Warnowwerft shipyards.",
    population: 240000,
    economicActivities: [
      "warsaw_pact_coastal_defense",
      "maritime_diesel_engines",
      "seaport_logistics",
    ],
    childSites: [
      {
        id: "warnemunde-naval",
        name: "Warnemünde / Hohe Düne Naval Base",
        kind: "naval_base",
        latitude: 54.18,
        longitude: 12.1,
        output: "Koni-class frigates & Tarantul missile corvettes",
        status: "operational",
      },
      {
        id: "rostock-port",
        name: "Überseehafen Rostock",
        kind: "world_port",
        latitude: 54.145,
        longitude: 12.13,
        output: "Warsaw Pact deepwater supply port",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-pol-szczecin",
    axial: { q: -8, r: 27 },
    name: "Szczecin / Pomeranian Bay",
    centroid: [53.6, 14.5],
    polygon: generateHexPolygon(53.6, 14.5),
    terrain: "plains",
    ownership: { side: "opfor", countryId: "poland" },
    yields: { fundsRevenue: 35, productionPoints: 25, energyFuel: 10 },
    facilities: ["shipyard"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Staging hub for the Polish 7th Lusatian Amphibious Landing Division targeting the Danish islands.",
    population: 390000,
    economicActivities: [
      "amphibious_assault_staging",
      "ship_maintenance",
      "metallurgy",
    ],
  },
  {
    id: "hex-pol-gdansk",
    axial: { q: -7, r: 28 },
    name: "Gdansk / Gdynia / Vistula Spit",
    centroid: [54.4, 18.6],
    polygon: generateHexPolygon(54.4, 18.6),
    terrain: "urban_metropolis",
    ownership: { side: "opfor", countryId: "poland" },
    yields: { fundsRevenue: 45, productionPoints: 35, energyFuel: 15 },
    facilities: ["naval_base", "shipyard"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Main naval base of the Polish Navy (Marynarka Wojenna) at Gdynia and Lenin Shipyard at Gdańsk.",
    population: 580000,
    economicActivities: [
      "naval_combatant_production",
      "heavy_cargo_fabrication",
      "refining",
    ],
    childSites: [
      {
        id: "gdynia-naval-base",
        name: "Oksywie Naval Base (Gdynia)",
        kind: "naval_base",
        latitude: 54.545,
        longitude: 18.55,
        output: "Warsaw Pact Kashin-class destroyer & Foxtrot subs",
        status: "operational",
      },
      {
        id: "gdansk-shipyard",
        name: "Gdańsk Naval Shipyard",
        kind: "factory",
        latitude: 54.37,
        longitude: 18.65,
        output: "Polnocny-class amphibious landing ships",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-sov-kaliningrad",
    axial: { q: -6, r: 28 },
    name: "Kaliningrad / Baltiysk Bastion",
    centroid: [54.7, 20.5],
    polygon: generateHexPolygon(54.7, 20.5),
    terrain: "urban_metropolis",
    ownership: { side: "opfor", countryId: "soviet-union" },
    yields: { fundsRevenue: 55, productionPoints: 40, energyFuel: 25 },
    facilities: ["naval_base", "air_base", "coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Headquarters of the Twice Red Banner Soviet Baltic Fleet at Baltiysk. An unsinkable fortress loaded with Sovremenny destroyers and Su-24 Fencer strike bombers.",
    population: 400000,
    economicActivities: [
      "baltic_fleet_command",
      "naval_aviation",
      "tactical_missile_stockpiling",
    ],
    childSites: [
      {
        id: "baltiysk-naval-hq",
        name: "Baltiysk Naval Base & Fleet HQ",
        kind: "naval_base",
        latitude: 54.64,
        longitude: 19.89,
        output: "Baltic Fleet surface task forces & Kilo subs",
        status: "operational",
      },
      {
        id: "chkalovsk-air",
        name: "Chkalovsk Naval Strike Air Base",
        kind: "air_base",
        latitude: 54.767,
        longitude: 20.4,
        output: "Su-24 Fencer & Tu-22M Backfire strike regiment",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-sov-riga",
    axial: { q: -6, r: 30 },
    name: "Riga / Gulf of Riga Littoral",
    centroid: [56.9, 24.1],
    polygon: generateHexPolygon(56.9, 24.1),
    terrain: "coastal_waters",
    ownership: { side: "opfor", countryId: "soviet-union" },
    yields: { fundsRevenue: 40, productionPoints: 30, energyFuel: 15 },
    facilities: ["naval_base", "shipyard"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Headquarters of the Soviet Baltic Military District and electronics manufacturing center for military radar systems.",
    population: 850000,
    economicActivities: [
      "military_electronics",
      "rail_rolling_stock",
      "naval_repairs",
    ],
  },
  {
    id: "hex-sov-tallinn",
    axial: { q: -7, r: 32 },
    name: "Tallinn / Paldiski Submarine Base",
    centroid: [59.4, 24.7],
    polygon: generateHexPolygon(59.4, 24.7),
    terrain: "urban_metropolis",
    ownership: { side: "opfor", countryId: "soviet-union" },
    yields: { fundsRevenue: 45, productionPoints: 35, energyFuel: 15 },
    facilities: ["naval_base", "air_base"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Soviet naval training base and submarine nuclear reactor training center at Paldiski on the Gulf of Finland.",
    population: 480000,
    economicActivities: [
      "nuclear_submarine_training",
      "chemical_industry",
      "port_throughput",
    ],
    childSites: [
      {
        id: "paldiski-sub-base",
        name: "Paldiski Naval Training Center",
        kind: "naval_base",
        latitude: 59.35,
        longitude: 24.05,
        output: "Soviet nuclear submarine crew reactor training",
        status: "operational",
      },
      {
        id: "tallinn-port",
        name: "Port of Tallinn / Muuga Harbor",
        kind: "world_port",
        latitude: 59.44,
        longitude: 24.75,
        output: "Bulk freight & military logistics hub",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-sov-kronstadt",
    axial: { q: -5, r: 32 },
    name: "Kronstadt / Leningrad Fortress",
    centroid: [60.0, 30.1],
    polygon: generateHexPolygon(60.0, 30.1),
    terrain: "urban_metropolis",
    ownership: { side: "opfor", countryId: "soviet-union" },
    yields: { fundsRevenue: 75, productionPoints: 60, energyFuel: 35 },
    facilities: ["naval_base", "air_base", "shipyard", "refinery"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "The heavy industrial heart of Soviet naval shipbuilding. Leningrad Admiralty, Baltic Shipyard, and Severnaya Verf produce cruisers and destroyers.",
    population: 4800000,
    economicActivities: [
      "heavy_naval_shipbuilding",
      "nuclear_reactor_fabrication",
      "guided_missile_production",
      "heavy_optics",
    ],
    childSites: [
      {
        id: "kronstadt-fortress",
        name: "Kronstadt Island Naval Base",
        kind: "naval_base",
        latitude: 59.99,
        longitude: 29.77,
        output: "Baltic Fleet primary reserve & coastal battery",
        status: "operational",
      },
      {
        id: "admiralty-shipyards",
        name: "Leningrad Admiralty & Baltic Shipyards",
        kind: "factory",
        latitude: 59.92,
        longitude: 30.27,
        output: "Nuclear icebreakers & Kilo-class submarines",
        status: "operational",
      },
      {
        id: "levashovo-air",
        name: "Levashovo Military Air Base",
        kind: "air_base",
        latitude: 60.088,
        longitude: 30.198,
        output: "Air defense MiG-31 & Tu-134 naval transports",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-sov-kola",
    axial: { q: -9, r: 42 },
    name: "Severomorsk / Kola Peninsula Red Bastion",
    centroid: [69.1, 33.4],
    polygon: generateHexPolygon(69.1, 33.4),
    terrain: "mountain_fjord",
    ownership: { side: "opfor", countryId: "soviet-union" },
    yields: { fundsRevenue: 60, productionPoints: 50, energyFuel: 40 },
    facilities: ["naval_base", "air_base", "shipyard", "refinery"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Nucleus of the Red Banner Northern Fleet. Massive concentration of nuclear ballistic missile submarines (SSBNs) and naval aviation.",
    population: 420000,
    economicActivities: [
      "nuclear_naval_maintenance",
      "heavy_nickel_mining",
      "arctic_logistics",
      "long_range_aviation",
    ],
    childSites: [
      {
        id: "severomorsk-hq",
        name: "Severomorsk Northern Fleet HQ",
        kind: "naval_base",
        latitude: 69.07,
        longitude: 33.42,
        output: "Missile cruiser Kirov & destroyer berths",
        status: "operational",
      },
      {
        id: "polyarny-sub-base",
        name: "Polyarny Submarine Base (Olenya Bay)",
        kind: "naval_base",
        latitude: 69.2,
        longitude: 33.45,
        output: "Victor III & Delta IV submarine pens",
        status: "operational",
      },
      {
        id: "olenya-air-base",
        name: "Olenya Naval Strike Air Base",
        kind: "air_base",
        latitude: 68.15,
        longitude: 33.47,
        output: "Tu-22M3 Backfire supersonic bombers",
        status: "operational",
      },
      {
        id: "murmansk-port",
        name: "Murmansk Commercial Seaport",
        kind: "world_port",
        latitude: 68.97,
        longitude: 33.08,
        output: "Ice-free strategic logistics terminal",
        status: "operational",
      },
      {
        id: "kola-sam-complex",
        name: "Murmansk S-200 / S-300 SAM Complex",
        kind: "aa_site",
        latitude: 68.99,
        longitude: 33.15,
        output: "Strategic air defense umbrella",
        status: "operational",
      },
    ],
    potentialInfrastructure: [
      {
        id: "opt-kola-backfire",
        name: "Expand Tu-22M3 Weapon Bunkers",
        costFunds: 250,
        costProduction: 60,
        effect: "+20% Naval Strike range & ASM payload",
      },
    ],
  },
  {
    id: "hex-sov-polyarny",
    axial: { q: -8, r: 42 },
    name: "Polyarny / Olenya Guba Nuclear Sub Base",
    centroid: [69.2, 35.8],
    polygon: generateHexPolygon(69.2, 35.8),
    terrain: "mountain_fjord",
    ownership: { side: "opfor", countryId: "soviet-union" },
    yields: { fundsRevenue: 50, productionPoints: 40, energyFuel: 30 },
    facilities: ["naval_base", "coastal_fort"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Gadzhiyevo, Sayda Guba, and Zapadnaya Litsa. Home of the Soviet Typhoon and Delta SSBN submarine flotillas hidden inside narrow Arctic fjords.",
    population: 85000,
    economicActivities: [
      "nuclear_submarine_patrols",
      "ballistic_missile_loading",
      "submarine_tunnels",
    ],
    childSites: [
      {
        id: "gadzhiyevo-sub",
        name: "Gadzhiyevo (Yagelnya Bay) SSBN Base",
        kind: "naval_base",
        latitude: 69.255,
        longitude: 33.325,
        output: "Delta IV nuclear ballistic missile submarines",
        status: "operational",
      },
      {
        id: "zapadnaya-litsa",
        name: "Zapadnaya Litsa (Nerpichya) Typhoon Base",
        kind: "naval_base",
        latitude: 69.42,
        longitude: 32.4,
        output: "Typhoon (Akula Project 941) giant SSBNs",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-gbr-scapa",
    axial: { q: -17, r: 32 },
    name: "Scapa Flow & Orkneys Anchor",
    centroid: [58.9, -3.1],
    polygon: generateHexPolygon(58.9, -3.1),
    terrain: "island",
    ownership: { side: "blufor", countryId: "united-kingdom" },
    yields: { fundsRevenue: 30, productionPoints: 15, energyFuel: 15 },
    facilities: [
      "naval_base",
      "fuel_terminal" as HexStrategicFacility,
      "coastal_fort",
    ],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Historic Royal Navy deep-water natural harbor guarding the northern maritime approaches between Scotland and the Faroe Islands.",
    population: 22000,
    economicActivities: [
      "north_sea_oil_terminal",
      "royal_navy_anchorage",
      "maritime_patrol_staging",
    ],
    childSites: [
      {
        id: "scapa-anchorage",
        name: "Scapa Flow Fleet Anchorage",
        kind: "naval_base",
        latitude: 58.9,
        longitude: -3.05,
        output: "Royal Navy task group sheltered staging",
        status: "operational",
      },
      {
        id: "flotta-terminal",
        name: "Flotta Oil Terminal",
        kind: "fuel_terminal",
        latitude: 58.825,
        longitude: -3.1,
        output: "North Sea crude extraction and bunkering",
        status: "operational",
      },
      {
        id: "lossiemouth-air",
        name: "RAF Lossiemouth",
        kind: "air_base",
        latitude: 57.705,
        longitude: -3.33,
        output: "Nimrod MR2 ASW & Buccaneer maritime strike",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-gbr-scotland",
    axial: { q: -16, r: 29 },
    name: "Scotland / Rosyth / Firth of Forth",
    centroid: [56.0, -3.2],
    polygon: generateHexPolygon(56.0, -3.2),
    terrain: "urban_metropolis",
    ownership: { side: "blufor", countryId: "united-kingdom" },
    yields: { fundsRevenue: 50, productionPoints: 35, energyFuel: 20 },
    facilities: ["naval_base", "air_base", "shipyard"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Royal Navy Rosyth Royal Dockyard and Faslane / Holy Loch submarine bases supporting British and American deterrent forces.",
    population: 1200000,
    economicActivities: [
      "nuclear_submarine_refits",
      "aerospace_engineering",
      "oil_refining",
    ],
    childSites: [
      {
        id: "rosyth-naval",
        name: "HMNB Rosyth Dockyard",
        kind: "naval_base",
        latitude: 56.025,
        longitude: -3.435,
        output: "Aircraft carrier & nuclear submarine maintenance",
        status: "operational",
      },
      {
        id: "leuchars-air",
        name: "RAF Leuchars",
        kind: "air_base",
        latitude: 56.377,
        longitude: -2.868,
        output: "43/111 Sqn Phantom FGR2 Northern Air Defense",
        status: "operational",
      },
      {
        id: "grangemouth-refinery",
        name: "Grangemouth Refinery",
        kind: "fuel_terminal",
        latitude: 56.015,
        longitude: -3.715,
        output: "Strategic aviation & naval distillate refinery",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-sea-north",
    axial: { q: -14, r: 30 },
    name: "North Sea Oil Basin / Ekofisk",
    centroid: [56.5, 3.2],
    polygon: generateHexPolygon(56.5, 3.2),
    terrain: "deep_sea",
    ownership: { side: "blufor", countryId: "norway" },
    yields: { fundsRevenue: 30, productionPoints: 5, energyFuel: 50 },
    facilities: ["offshore_rig"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Vast offshore petroleum fields (Ekofisk, Forties, Brent) powering Western Europe.",
    population: 5000,
    economicActivities: ["deepwater_oil_and_gas", "subsea_pipeline_grid"],
    childSites: [
      {
        id: "ekofisk-complex",
        name: "Ekofisk Oil Complex",
        kind: "firing_range",
        latitude: 56.54,
        longitude: 3.21,
        output: "Central offshore petroleum hub",
        status: "operational",
      },
    ],
  },
  {
    id: "hex-sea-norwegian",
    axial: { q: -17, r: 36 },
    name: "Norwegian Sea SOSUS Barrier",
    centroid: [64.0, 4.0],
    polygon: generateHexPolygon(64.0, 4.0),
    terrain: "deep_sea",
    ownership: { side: "blufor", countryId: "united-states" },
    yields: { fundsRevenue: 10, productionPoints: 0, energyFuel: 5 },
    facilities: ["radar_site"],
    neighbors: [],
    isCoreTheater: true,
    coldWarContext:
      "Sound Surveillance System (SOSUS) deep hydrophone barrier detecting Soviet submarine sorties from the Kola Peninsula into the Atlantic.",
    population: 0,
    economicActivities: ["acoustic_anti_submarine_warfare"],
    childSites: [
      {
        id: "sosus-norwegian-node",
        name: "Norwegian Basin SOSUS Hydrophone Array",
        kind: "radar_site",
        latitude: 64.0,
        longitude: 4.0,
        output: "Deep sound channel acoustic tracking of Soviet SSNs",
        status: "operational",
      },
    ],
  },
];

const normalizedBalticCoreHexList: StrategicHexCell[] = balticCoreHexList.map(
  (h) => {
    const [exactLat, exactLon] = axialToCoordinates(h.axial.q, h.axial.r);
    return {
      ...h,
      centroid: [exactLat, exactLon] as [number, number],
      polygon: generateHexPolygon(exactLat, exactLon),
    };
  },
);

const coreHexMap = new Map<string, StrategicHexCell>(
  normalizedBalticCoreHexList.map((h) => [h.id, h]),
);

export function getAllBalticCoreHexCells(): StrategicHexCell[] {
  return normalizedBalticCoreHexList;
}

export function getHexCellDefinition(
  hexId: string,
  axialHint?: { q: number; r: number },
): StrategicHexCell {
  const core = coreHexMap.get(hexId);
  if (core) return core;

  let q = 0;
  let r = 0;
  if (axialHint) {
    q = axialHint.q;
    r = axialHint.r;
  } else {
    const match = /^hex-w-q([pm]\d+)-r([pm]\d+)$/.exec(hexId);
    const qPart = match?.[1];
    const rPart = match?.[2];
    if (qPart && rPart) {
      q =
        (qPart.startsWith("p") ? 1 : -1) * Number.parseInt(qPart.slice(1), 10);
      r =
        (rPart.startsWith("p") ? 1 : -1) * Number.parseInt(rPart.slice(1), 10);
    }
  }

  const [lat, lon] = axialToCoordinates(q, r);
  return generateProceduralWorldHex(q, r, lat, lon);
}

export const getHexCell = getHexCellDefinition;

export function getHexNeighbors(hex: StrategicHexCell): StrategicHexCell[] {
  const neighbors = getAxialNeighbors(hex.axial.q, hex.axial.r);
  return neighbors.map((n) =>
    getHexCellDefinition(getHexIdForAxial(n.q, n.r), n),
  );
}

/**
 * Deterministically resolves any point (lat, lon) anywhere on Earth to its containing strategic hex cell.
 */
export function latLonToHexCell(
  latitude: number,
  longitude: number,
): StrategicHexCell {
  const axial = coordinatesToAxial(latitude, longitude);
  const hexId = getHexIdForAxial(axial.q, axial.r);
  return getHexCellDefinition(hexId, axial);
}

import { generatedLandHexes } from "./generatedGlobalHexData.js";

// -------------------------------------------------------------------------
// PROCEDURAL GLOBAL SECTOR CLASSIFICATION ENGINE (10,000+ Hexes)
// -------------------------------------------------------------------------

function generateProceduralWorldHex(
  q: number,
  r: number,
  lat: number,
  lon: number,
): StrategicHexCell {
  const hexId = `hex-w-q${q >= 0 ? `p${q}` : `m${Math.abs(q)}`}-r${r >= 0 ? `p${r}` : `m${Math.abs(r)}`}`;
  const hexKey = `q${q}_r${r}`;
  const landData = generatedLandHexes[hexKey];

  const chokepoint = classifyChokepoint(lat, lon);
  let classification: GlobalCellClassification;

  if (chokepoint) {
    classification = chokepoint;
  } else if (landData) {
    classification = {
      name: landData.n,
      terrain: landData.t,
      ownership: { side: landData.s, countryId: landData.c },
      yields: {
        fundsRevenue: landData.y[0],
        productionPoints: landData.y[1],
        energyFuel: landData.y[2],
      },
      facilities: landData.f,
    };
  } else {
    classification = classifyOcean(lat, lon);
  }

  return {
    id: hexId,
    axial: { q, r },
    name: classification.name,
    centroid: [lat, lon],
    polygon: generateHexPolygon(lat, lon),
    terrain: classification.terrain,
    ownership: classification.ownership,
    yields: classification.yields,
    facilities: classification.facilities,
    neighbors: [],
    isCoreTheater: false,
  };
}

type GlobalCellClassification = {
  name: string;
  terrain: HexTerrainType;
  ownership: HexCellOwnership;
  yields: HexCellYields;
  facilities: HexStrategicFacility[];
};

function classifyChokepoint(
  lat: number,
  lon: number,
): GlobalCellClassification | null {
  // Strait of Gibraltar
  if (lat >= 34.5 && lat <= 37.5 && lon >= -7.0 && lon <= -4.0) {
    return {
      name: "Strait of Gibraltar Chokepoint",
      terrain: "strait_chokepoint",
      ownership: { side: "blufor", countryId: "united-kingdom" },
      yields: { fundsRevenue: 30, productionPoints: 10, energyFuel: 10 },
      facilities: ["naval_base", "radar_site", "coastal_fort"],
    };
  }
  // English Channel / Dover
  if (lat >= 49.0 && lat <= 52.0 && lon >= -2.0 && lon <= 3.0) {
    return {
      name: "English Channel / Dover Strait",
      terrain: "strait_chokepoint",
      ownership: { side: "blufor", countryId: "united-kingdom" },
      yields: { fundsRevenue: 40, productionPoints: 25, energyFuel: 15 },
      facilities: ["naval_base", "radar_site"],
    };
  }
  // GIUK Gap (Greenland-Iceland-UK)
  if (lat >= 61.0 && lat <= 67.0 && lon >= -25.0 && lon <= -9.0) {
    return {
      name: "GIUK Gap / Iceland Barrier",
      terrain: "strait_chokepoint",
      ownership: { side: "blufor", countryId: "iceland" },
      yields: { fundsRevenue: 20, productionPoints: 5, energyFuel: 10 },
      facilities: ["air_base", "radar_site"],
    };
  }
  // Turkish Straits (Bosphorus / Dardanelles)
  if (lat >= 39.5 && lat <= 42.5 && lon >= 25.0 && lon <= 30.5) {
    return {
      name: "Turkish Straits / Bosphorus Gate",
      terrain: "strait_chokepoint",
      ownership: { side: "blufor", countryId: "turkey" },
      yields: { fundsRevenue: 35, productionPoints: 20, energyFuel: 10 },
      facilities: ["naval_base", "coastal_fort", "radar_site"],
    };
  }
  // Suez Canal
  if (lat >= 28.5 && lat <= 32.0 && lon >= 31.0 && lon <= 34.0) {
    return {
      name: "Suez Canal Transit Corridor",
      terrain: "strait_chokepoint",
      ownership: { side: "neutral", countryId: "egypt" },
      yields: { fundsRevenue: 50, productionPoints: 15, energyFuel: 15 },
      facilities: ["radar_site", "coastal_fort"],
    };
  }
  // Bab-el-Mandeb
  if (lat >= 11.0 && lat <= 14.0 && lon >= 42.0 && lon <= 45.0) {
    return {
      name: "Bab-el-Mandeb Strait",
      terrain: "strait_chokepoint",
      ownership: { side: "opfor", countryId: "south-yemen" },
      yields: { fundsRevenue: 20, productionPoints: 5, energyFuel: 10 },
      facilities: ["coastal_fort"],
    };
  }
  // Strait of Hormuz
  if (lat >= 24.5 && lat <= 28.0 && lon >= 54.0 && lon <= 58.0) {
    return {
      name: "Strait of Hormuz Petroleum Chokepoint",
      terrain: "strait_chokepoint",
      ownership: { side: "neutral", countryId: "iran" },
      yields: { fundsRevenue: 60, productionPoints: 20, energyFuel: 90 },
      facilities: ["offshore_rig", "coastal_fort", "radar_site"],
    };
  }
  // Malacca Strait
  if (lat >= 1.0 && lat <= 6.0 && lon >= 98.0 && lon <= 105.0) {
    return {
      name: "Malacca Strait Shipping Artery",
      terrain: "strait_chokepoint",
      ownership: { side: "blufor", countryId: "united-states" },
      yields: { fundsRevenue: 45, productionPoints: 15, energyFuel: 20 },
      facilities: ["naval_base", "radar_site"],
    };
  }
  // Taiwan Strait
  if (lat >= 22.0 && lat <= 26.5 && lon >= 118.0 && lon <= 122.5) {
    return {
      name: "Taiwan Strait Littoral",
      terrain: "strait_chokepoint",
      ownership: { side: "blufor", countryId: "taiwan" },
      yields: { fundsRevenue: 40, productionPoints: 25, energyFuel: 15 },
      facilities: ["air_base", "radar_site", "coastal_fort"],
    };
  }
  // Tsushima / Korea Strait
  if (lat >= 33.0 && lat <= 36.0 && lon >= 127.5 && lon <= 132.0) {
    return {
      name: "Tsushima Strait / Sea of Japan Gateway",
      terrain: "strait_chokepoint",
      ownership: { side: "blufor", countryId: "japan" },
      yields: { fundsRevenue: 35, productionPoints: 20, energyFuel: 10 },
      facilities: ["naval_base", "radar_site"],
    };
  }
  // Panama Canal
  if (lat >= 7.0 && lat <= 10.5 && lon >= -82.0 && lon <= -78.0) {
    return {
      name: "Panama Canal Transit Zone",
      terrain: "strait_chokepoint",
      ownership: { side: "blufor", countryId: "united-states" },
      yields: { fundsRevenue: 50, productionPoints: 20, energyFuel: 15 },
      facilities: ["naval_base", "air_base", "coastal_fort"],
    };
  }
  // Bering Strait
  if (lat >= 64.0 && lat <= 67.5 && (lon >= 166.0 || lon <= -166.0)) {
    return {
      name: "Bering Strait Arctic Gate",
      terrain: "strait_chokepoint",
      ownership: { side: "blufor", countryId: "united-states" },
      yields: { fundsRevenue: 15, productionPoints: 5, energyFuel: 10 },
      facilities: ["radar_site"],
    };
  }
  return null;
}

function classifyOcean(lat: number, lon: number): GlobalCellClassification {
  // 1. High Arctic / Polar Ice
  if (lat > 80.0) {
    return {
      name: `Central Arctic Polar Ice Basin [${lat.toFixed(1)}°N, ${lon.toFixed(1)}°]`,
      terrain: "deep_sea",
      ownership: { side: "neutral", countryId: "international-waters" },
      yields: { fundsRevenue: 5, productionPoints: 0, energyFuel: 5 },
      facilities: [],
    };
  }
  // 2. Antarctic Ice Shelf
  if (lat < -60.0) {
    return {
      name: `Antarctic Treaty Ocean Ice Shelf [${Math.abs(lat).toFixed(1)}°S, ${lon.toFixed(1)}°]`,
      terrain: "deep_sea",
      ownership: { side: "neutral", countryId: "international-waters" },
      yields: { fundsRevenue: 0, productionPoints: 0, energyFuel: 0 },
      facilities: [],
    };
  }
  // 3. North Atlantic Ocean - Neutral International Waters
  if (lat >= 0 && lat <= 80 && lon >= -80 && lon <= 10) {
    return {
      name: `North Atlantic Ocean [${lat.toFixed(1)}°N, ${Math.abs(lon).toFixed(1)}°W]`,
      terrain: "deep_sea",
      ownership: { side: "neutral", countryId: "international-waters" },
      yields: { fundsRevenue: 10, productionPoints: 0, energyFuel: 5 },
      facilities: [],
    };
  }
  // 4. South Atlantic Ocean - Neutral
  if (lat < 0 && lat >= -60 && lon >= -70 && lon <= 20) {
    return {
      name: `South Atlantic Ocean [${Math.abs(lat).toFixed(1)}°S, ${lon.toFixed(1)}°]`,
      terrain: "deep_sea",
      ownership: { side: "neutral", countryId: "international-waters" },
      yields: { fundsRevenue: 10, productionPoints: 0, energyFuel: 5 },
      facilities: [],
    };
  }
  // 5. North Pacific Ocean - Neutral
  if (lat >= 0 && lat <= 70 && (lon <= -100 || lon >= 120)) {
    return {
      name: `North Pacific Ocean [${lat.toFixed(1)}°N, ${lon.toFixed(1)}°]`,
      terrain: "deep_sea",
      ownership: { side: "neutral", countryId: "international-waters" },
      yields: { fundsRevenue: 10, productionPoints: 0, energyFuel: 5 },
      facilities: [],
    };
  }
  // 6. South Pacific Ocean - Neutral
  if (lat < 0 && lat >= -60 && (lon <= -70 || lon >= 140)) {
    return {
      name: `South Pacific Ocean [${Math.abs(lat).toFixed(1)}°S, ${lon.toFixed(1)}°]`,
      terrain: "deep_sea",
      ownership: { side: "neutral", countryId: "international-waters" },
      yields: { fundsRevenue: 10, productionPoints: 0, energyFuel: 5 },
      facilities: [],
    };
  }
  // 7. Indian Ocean - Neutral
  if (lon >= 20 && lon <= 115 && lat >= -60 && lat <= 28) {
    return {
      name: `Indian Ocean Transit Basin [${lat.toFixed(1)}°, ${lon.toFixed(1)}°]`,
      terrain: "deep_sea",
      ownership: { side: "neutral", countryId: "international-waters" },
      yields: { fundsRevenue: 10, productionPoints: 0, energyFuel: 5 },
      facilities: [],
    };
  }

  // Fallback generic ocean
  return {
    name: `International Waters [${lat.toFixed(1)}°, ${lon.toFixed(1)}°]`,
    terrain: "deep_sea",
    ownership: { side: "neutral", countryId: "international-waters" },
    yields: { fundsRevenue: 5, productionPoints: 0, energyFuel: 5 },
    facilities: [],
  };
}

export function listHexCellsInBounds(bounds: {
  west: number;
  south: number;
  east: number;
  north: number;
}): StrategicHexCell[] {
  const result: StrategicHexCell[] = [];
  const visited = new Set<string>();

  // Add handcrafted core hexes if within bounds
  for (const core of balticCoreHexList) {
    if (
      core.centroid[0] >= bounds.south - 2 &&
      core.centroid[0] <= bounds.north + 2 &&
      core.centroid[1] >= bounds.west - 3 &&
      core.centroid[1] <= bounds.east + 3
    ) {
      result.push(core);
      visited.add(core.id);
    }
  }

  // Sample grid within bounds with spherical antimeridian support
  const minR = Math.max(-44, Math.floor(bounds.south / HEX_SPACING_LAT) - 1);
  const maxR = Math.min(44, Math.ceil(bounds.north / HEX_SPACING_LAT) + 1);

  for (let r = minR; r <= maxR; r++) {
    const minQ = Math.floor(bounds.west / HEX_SPACING_LON - r * 0.5) - 1;
    const maxQ = Math.ceil(bounds.east / HEX_SPACING_LON - r * 0.5) + 1;

    for (let q = minQ; q <= maxQ; q++) {
      const hexId = getHexIdForAxial(q, r);
      if (!visited.has(hexId)) {
        visited.add(hexId);
        result.push(getHexCellDefinition(hexId, { q, r }));
      }
    }
  }

  return result;
}
