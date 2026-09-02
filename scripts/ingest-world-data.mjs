import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputRoot = join(root, "data", "world");
const rawRoot = join(outputRoot, "raw");
const sources = {
  naturalEarthCountries: {
    file: "countries.json",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson",
  },
  naturalEarthRegions: {
    file: "regions.json",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson",
  },
  naturalEarthPlaces: {
    file: "places.json",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson",
  },
  naturalEarthPorts: {
    file: "ports.json",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_ports.geojson",
  },
  naturalEarthAirports: {
    file: "airports.json",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_airports.geojson",
  },
};

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function point(feature) {
  if (feature.geometry?.type !== "Point") return null;
  const [longitude, latitude] = feature.geometry.coordinates;
  return { latitude, longitude };
}

function normalize(sourceName, feature) {
  const p = feature.properties ?? {};
  if (sourceName === "naturalEarthCountries") {
    return {
      id: String(p.ADM0_A3 ?? p.SOV_A3 ?? p.ISO_A3),
      name: p.NAME_EN ?? p.NAME ?? p.ADMIN ?? p.SOVEREIGNT ?? "Unnamed country",
      isoA2: p.ISO_A2 ?? null,
      isoA3: p.ISO_A3 ?? null,
      region: p.REGION_UN ?? p.REGION_WB ?? null,
      subregion: p.SUBREGION ?? null,
      geometry: feature.geometry,
    };
  }
  if (sourceName === "naturalEarthRegions") {
    return {
      id: String(p.gid ?? p.woe_id ?? p.name),
      countryId: p.adm0_a3 ?? p.sr_adm0_a3 ?? null,
      name: p.name ?? p.name_en ?? "Unnamed region",
      type: "region",
      geometry: feature.geometry,
    };
  }
  const coordinates = point(feature);
  if (!coordinates) return null;
  return {
    id: String(
      p.wikidataid ??
        p.WIKIDATAID ??
        p.wd_id ??
        p.WOF_ID ??
        p.gn_id ??
        p.GEONAMESID ??
        p.name,
    ),
    countryId:
      p.adm0_a3 ??
      p.ADM0_A3 ??
      p.sov0_a3 ??
      p.SOV_A3 ??
      p.iso_a2 ??
      p.ISO_A2 ??
      null,
    name: p.name ?? p.NAME ?? p.name_en ?? p.NAME_EN ?? "Unnamed site",
    type: sourceName === "naturalEarthPorts" ? "port" : "airport",
    ...coordinates,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/geo+json, application/json" },
  });
  if (!response.ok)
    throw new Error(`Download failed (${response.status}): ${url}`);
  return response.json();
}

async function runSource(sourceName, refresh, manifestSources) {
  const source = sources[sourceName];
  if (!source) throw new Error(`Unknown source: ${sourceName}`);
  const rawPath = join(rawRoot, `${sourceName}.json`);
  await mkdir(rawRoot, { recursive: true });
  let document;
  if (!refresh) {
    try {
      document = JSON.parse(await readFile(rawPath, "utf8"));
    } catch {
      /* first run */
    }
  }
  if (!document) {
    document = await fetchJson(source.url);
    await writeFile(rawPath, `${JSON.stringify(document)}\n`, "utf8");
  }
  if (
    document.type !== "FeatureCollection" ||
    !Array.isArray(document.features)
  )
    throw new Error(`Expected GeoJSON FeatureCollection for ${sourceName}.`);
  const records = document.features
    .map((feature) => normalize(sourceName, feature))
    .filter((record) => record && record.id !== "undefined")
    .sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(
    join(outputRoot, source.file),
    `${JSON.stringify({ version: 1, records }, null, 2)}\n`,
    "utf8",
  );
  manifestSources.push({
    name: sourceName,
    url: source.url,
    license: "Public domain",
    attribution: "Natural Earth / Nathaniel Kelso",
    cachedFile: `raw/${sourceName}.json`,
    normalizedFile: source.file,
    recordCount: records.length,
  });
  console.log(`Imported ${records.length} records from ${sourceName}.`);
}

async function main() {
  const selected = process.argv.includes("--all")
    ? Object.keys(sources)
    : [argument("source", "naturalEarthCountries")];
  const manifestSources = [];
  for (const sourceName of selected)
    await runSource(
      sourceName,
      process.argv.includes("--refresh"),
      manifestSources,
    );
  await writeFile(
    join(outputRoot, "manifest.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), purpose: "Reference geography only; not campaign truth or military strength.", sources: manifestSources }, null, 2)}\n`,
    "utf8",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
