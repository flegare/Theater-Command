import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const geo = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "data",
      "world",
      "raw",
      "naturalEarthCountries.json",
    ),
    "utf8",
  ),
);

const TOTAL_LONGITUDE_COLUMNS = 134;
const MERCATOR_SPACING_X = (2 * Math.PI) / TOTAL_LONGITUDE_COLUMNS;
const MERCATOR_SPACING_Y = (Math.sqrt(3) / 2) * MERCATOR_SPACING_X;

function mercatorToLatLon(x, y) {
  const lon = (x * 180) / Math.PI;
  const lat = ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
  let normalizedLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (normalizedLon >= 180) normalizedLon = -180;
  return [Number(lat.toFixed(4)), Number(normalizedLon.toFixed(4))];
}

function pointInPolygon(point, vs) {
  const x = point[0],
    y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0],
      yi = vs[i][1];
    const xj = vs[j][0],
      yj = vs[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function findCountry(lon, lat) {
  for (const f of geo.features) {
    const bbox = f.bbox;
    if (
      bbox &&
      (lon < bbox[0] - 0.2 ||
        lon > bbox[2] + 0.2 ||
        lat < bbox[1] - 0.2 ||
        lat > bbox[3] + 0.2)
    ) {
      continue;
    }
    const geom = f.geometry;
    if (!geom) continue;
    if (geom.type === "Polygon") {
      if (pointInPolygon([lon, lat], geom.coordinates[0])) {
        return f.properties;
      }
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        if (pointInPolygon([lon, lat], poly[0])) {
          return f.properties;
        }
      }
    }
  }
  return null;
}

const BLUFOR_ISO = new Set([
  "USA",
  "CAN",
  "GBR",
  "FRA",
  "DEU",
  "ITA",
  "ESP",
  "PRT",
  "NLD",
  "BEL",
  "LUX",
  "DNK",
  "NOR",
  "ISL",
  "GRC",
  "TUR",
  "GRL",
  "JPN",
  "KOR",
  "AUS",
  "NZL",
  "TWN",
  "ISR",
  "PHL",
  "THA",
  "SGP",
  "PRI",
]);

const OPFOR_ISO = new Set([
  "RUS",
  "SOV",
  "UKR",
  "BLR",
  "KAZ",
  "UZB",
  "TKM",
  "KGZ",
  "TJK",
  "GEO",
  "ARM",
  "AZE",
  "MDA",
  "EST",
  "LVA",
  "LTU",
  "POL",
  "CZE",
  "HUN",
  "ROU",
  "BGR",
  "DDR",
  "CUB",
  "PRK",
  "VNM",
  "LAO",
  "MNG",
  "YMD",
  "SYR",
  "LBY",
  "ETH",
  "AGO",
  "MOZ",
  "AFG",
  "NIC",
]);

const landHexMap = {};
const minR = -44;
const maxR = 50;

console.log(
  "Classifying global hexagonal grid against real-world Natural Earth boundaries...",
);
const t0 = Date.now();
let landCount = 0;

for (let r = minR; r <= maxR; r++) {
  const y = r * MERCATOR_SPACING_Y;
  for (let q = -67; q <= 66; q++) {
    const x = (q + r * 0.5) * MERCATOR_SPACING_X;
    const [lat, lon] = mercatorToLatLon(x, y);
    const country = findCountry(lon, lat);
    if (country) {
      landCount++;
      const iso = (
        country.ISO_A3 ||
        country.ADM0_A3 ||
        country.SOV_A3 ||
        ""
      ).toUpperCase();
      const side = BLUFOR_ISO.has(iso)
        ? "blufor"
        : OPFOR_ISO.has(iso)
          ? "opfor"
          : "neutral";
      const countryName =
        country.NAME || country.ADMIN || country.SOVEREIGNT || "Sovereign Land";
      const countrySlug = (country.NAME || country.ADMIN || "unaligned")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const isMajorIndustrial = [
        "USA",
        "GBR",
        "FRA",
        "DEU",
        "ITA",
        "JPN",
        "RUS",
        "SOV",
      ].includes(iso);
      const isOilHub =
        ["SAU", "IRN", "IRQ", "KWT", "ARE", "VEN", "NGA", "LBY"].includes(
          iso,
        ) ||
        (iso === "RUS" && lat > 55 && lon > 60);

      const facilities = [];
      if (isMajorIndustrial) {
        facilities.push("air_base");
        if (["USA", "GBR", "FRA", "JPN", "RUS"].includes(iso))
          facilities.push("naval_base", "shipyard");
      }
      if (isOilHub) {
        facilities.push("refinery", "offshore_rig");
      }

      const hexKey = `q${q}_r${r}`;
      landHexMap[hexKey] = {
        n: `${countryName} [${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}]`,
        c: countrySlug,
        s: side,
        t: isMajorIndustrial
          ? "urban_metropolis"
          : ["NOR", "CHL", "ISL", "CHE"].includes(iso)
            ? "mountain_fjord"
            : "plains",
        y: [
          isMajorIndustrial ? 60 : isOilHub ? 45 : 30,
          isMajorIndustrial ? 50 : 20,
          isOilHub ? 80 : 15,
        ],
        f: facilities,
      };
    }
  }
}

// Step 2: Classify Coastal Waters (1 hex buffer off all coastlines and islands)
const coastalHexMap = {};
const neighborOffsets = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

let coastalCount = 0;

for (let r = minR; r <= maxR; r++) {
  const y = r * MERCATOR_SPACING_Y;
  for (let q = -67; q <= 66; q++) {
    const hexKey = `q${q}_r${r}`;
    if (landHexMap[hexKey]) continue; // already land

    const [lat, lon] = mercatorToLatLon((q + r * 0.5) * MERCATOR_SPACING_X, y);

    // Check if any neighbor is land
    let adjacentLand = null;
    for (const offset of neighborOffsets) {
      let nq = q + offset.q;
      const nr = r + offset.r;
      // Handle longitudinal wrapping
      if (nq > 66) nq -= TOTAL_LONGITUDE_COLUMNS;
      if (nq < -67) nq += TOTAL_LONGITUDE_COLUMNS;
      const neighborLand = landHexMap[`q${nq}_r${nr}`];
      if (neighborLand) {
        adjacentLand = neighborLand;
        break;
      }
    }

    if (adjacentLand) {
      coastalCount++;
      coastalHexMap[hexKey] = {
        n: `${adjacentLand.c.toUpperCase()} Territorial Waters [${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}]`,
        c: adjacentLand.c,
        s: adjacentLand.s,
        t: "coastal_waters",
        y: [20, 10, 10],
        f: [],
      };
    }
  }
}

const combinedHexMap = { ...landHexMap, ...coastalHexMap };

const outputPath = resolve(
  process.cwd(),
  "src",
  "domain",
  "generatedGlobalHexData.ts",
);
const tsContent = `// Auto-generated from Natural Earth Country MultiPolygons & Coastal Maritime Buffers
import type { HexTerrainType, HexStrategicFacility } from "./hexGrid.js";

export type RawLandHexData = {
  n: string;
  c: string;
  s: "blufor" | "opfor" | "neutral";
  t: HexTerrainType;
  y: [number, number, number];
  f: HexStrategicFacility[];
};

export const generatedLandHexes: Record<string, RawLandHexData> = ${JSON.stringify(combinedHexMap)};
`;
writeFileSync(outputPath, tsContent, "utf8");

console.log(
  `Successfully classified ${landCount} land hexes and ${coastalCount} coastal water hexes in ${Date.now() - t0}ms! Wrote to ${outputPath}`,
);
