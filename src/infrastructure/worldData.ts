import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type WorldLayer =
  "countries" | "regions" | "places" | "ports" | "airports";
export type WorldRecord = {
  id: string;
  name: string;
  countryId?: string | null;
  type?: string;
  latitude?: number;
  longitude?: number;
  geometry?: { type: string; coordinates: unknown };
  [key: string]: unknown;
};

const cache = new Map<WorldLayer, WorldRecord[]>();

function numericCoordinates(value: unknown): unknown {
  if (Array.isArray(value)) {
    const coordinateStrings = value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.trim().split(/\s+/).length === 2 &&
        entry
          .trim()
          .split(/\s+/)
          .every((part) => Number.isFinite(Number(part))),
    );
    if (coordinateStrings) {
      return value.map((entry) => entry.trim().split(/\s+/).map(Number));
    }
    return value.map(numericCoordinates);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const pair = value.trim().split(/\s+/).map(Number);
    if (pair.length === 2 && pair.every(Number.isFinite)) return pair;
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  return value;
}

function normalizeGeometry(record: WorldRecord): WorldRecord {
  if (!record.geometry) return record;
  return {
    ...record,
    geometry: {
      ...record.geometry,
      coordinates: numericCoordinates(record.geometry.coordinates),
    },
  };
}

function loadLayer(layer: WorldLayer): WorldRecord[] {
  const cached = cache.get(layer);
  if (cached) return cached;
  const file = resolve(process.cwd(), "data", "world", `${layer}.json`);
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    records: WorldRecord[];
  };
  if (!Array.isArray(parsed.records))
    throw new Error(`Invalid world layer: ${layer}`);
  const records = parsed.records.map(normalizeGeometry);
  cache.set(layer, records);
  return records;
}

function geometryBounds(
  geometry: WorldRecord["geometry"],
): [number, number, number, number] | undefined {
  if (!geometry) return undefined;
  const values: number[] = [];
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
      ) {
        values.push(value[0], value[1]);
      } else value.forEach(collect);
    }
  };
  collect(geometry.coordinates);
  if (values.length < 2) return undefined;
  const longitudes = values.filter((_value, index) => index % 2 === 0);
  const latitudes = values.filter((_value, index) => index % 2 === 1);
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}

function intersects(
  record: WorldRecord,
  west: number,
  south: number,
  east: number,
  north: number,
): boolean {
  const bounds =
    record.latitude !== undefined && record.longitude !== undefined
      ? ([
          record.longitude,
          record.latitude,
          record.longitude,
          record.latitude,
        ] as [number, number, number, number])
      : geometryBounds(record.geometry);
  if (!bounds) return false;
  return (
    bounds[0] <= east &&
    bounds[2] >= west &&
    bounds[1] <= north &&
    bounds[3] >= south
  );
}

export function worldZone(
  layers: WorldLayer[],
  bounds: { west: number; south: number; east: number; north: number },
  limit: number,
) {
  const result = Object.fromEntries(
    layers.map((layer) => {
      const records = loadLayer(layer).filter((record) =>
        intersects(
          record,
          bounds.west,
          bounds.south,
          bounds.east,
          bounds.north,
        ),
      );
      return [
        layer,
        {
          records: records.slice(0, limit),
          total: records.length,
          truncated: records.length > limit,
        },
      ];
    }),
  ) as Record<
    WorldLayer,
    { records: WorldRecord[]; total: number; truncated: boolean }
  >;
  return { bounds, layers: result };
}
