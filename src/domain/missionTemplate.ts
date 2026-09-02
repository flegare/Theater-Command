import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

export function resolveMissionTemplatePath(path: string): string {
  if (existsSync(path)) return path;
  const fileName = basename(path);
  const localTemplatePath = resolve(
    process.cwd(),
    "data",
    "templates",
    fileName,
  );
  if (existsSync(localTemplatePath)) return localTemplatePath;
  const fixturePath = resolve(process.cwd(), "test", "fixtures", fileName);
  if (existsSync(fixturePath)) return fixturePath;
  const parentTemplatePath = resolve(
    process.cwd(),
    "..",
    "Sea Power_Data",
    "StreamingAssets",
    "user",
    "missions",
    fileName,
  );
  if (existsSync(parentTemplatePath)) return parentTemplatePath;
  return path;
}

export type TemplateZone = {
  id: string;
  label: string;
  labelKey: string;
  shape: string;
  geoPoint: [number, number];
  geoPoints?: [number, number][];
  widthNm?: number;
  heightNm?: number;
  radiusNm?: number;
  bearing?: number;
  side?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  fillOpacity?: number;
  borderOpacity?: number;
  fillStyle?: string;
  allowedUnitTypes?: string;
  visibleIn?: string;
};

export type TemplateMapSymbol = {
  id: string;
  label: string;
  labelKey: string;
  kind: string;
  color: string;
  geoPoint: [number, number];
  font?: string;
  fontSize?: number;
  sizeMode?: string;
  vSizeM?: number;
  visibleIn?: string;
};

export type TemplateWaypoint = [number, string, number];
type ParsedWaypoints = {
  points: TemplateWaypoint[];
  rawPoints: string[];
};

export type TemplateRoute = {
  id: string;
  kind: "fishing" | "merchant" | "opfor" | "air" | "player" | "submarine";
  waypoints: TemplateWaypoint[];
  rawWaypoints?: string[];
  spawnPosition?: TemplateWaypoint;
};
export type TemplateLandUnit = {
  id: string;
  type: string;
  position: TemplateWaypoint;
  heading?: string;
  owner?: "Taskforce1" | "Neutral";
};
export type MissionTemplateMetadata = {
  mapCenter: [number, number];
  mapSymbols: TemplateMapSymbol[];
  zones: TemplateZone[];
  routes: TemplateRoute[];
  landUnits: TemplateLandUnit[];
};

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTemplate(path: string): {
  sections: Map<string, Record<string, string>>;
  language: Record<string, string>;
} {
  const resolvedPath = resolveMissionTemplatePath(path);
  const lines = readFileSync(resolvedPath, "utf8").split(/\r?\n/);
  const sections = new Map<string, Record<string, string>>();
  let section = "";
  for (const line of lines) {
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      section = header[1] ?? "";
      sections.set(section, {});
      continue;
    }
    const entry = line.match(/^([^=]+)=(.*)$/);
    if (entry && section)
      sections.get(section)![entry[1]!.trim()] = entry[2]!.trim();
  }
  return {
    sections,
    language: sections.get("Language_en") ?? {},
  };
}

function parseZones(
  sections: Map<string, Record<string, string>>,
  language: Record<string, string>,
): TemplateZone[] {
  return [...sections.entries()]
    .filter(([id]) => /^Zone\d+$/.test(id))
    .flatMap(([id, values]) => {
      const geoPoints: [number, number][] = [];
      if (values.GeoPoint) {
        const point = values.GeoPoint.split(",").map(Number);
        if (Number.isFinite(point[0]) && Number.isFinite(point[1])) {
          geoPoints.push([point[0]!, point[1]!]);
        }
      }
      const declaredPoints = Number(values.NumberOfGeoPoints ?? "0");
      for (let index = 1; index <= declaredPoints; index += 1) {
        const key = `GeoPoint${index}`;
        const point = values[key]?.split(",").map(Number);
        if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))
          continue;
        geoPoints.push([point[0]!, point[1]!]);
      }
      if (geoPoints.length === 0) return [];
      const latitude =
        geoPoints.reduce((sum, point) => sum + point[0], 0) / geoPoints.length;
      const longitude =
        geoPoints.reduce((sum, point) => sum + point[1], 0) / geoPoints.length;
      const zone: TemplateZone = {
        id,
        labelKey: values.LabelKey ?? `${id}Label`,
        label:
          (values.LabelKey ? language[`${values.LabelKey}_en`] : undefined) ??
          values.LabelKey ??
          id,
        shape: values.Shape ?? (values.RadiusNm ? "Circle" : "Rectangle"),
        geoPoint: [latitude, longitude],
      };
      if (geoPoints.length > 1) zone.geoPoints = geoPoints;
      const widthNm = parseNumber(values.WidthNm);
      const heightNm = parseNumber(values.HeightNm);
      const radiusNm = parseNumber(values.RadiusNm);
      const bearing = parseNumber(values.Bearing);
      const borderWidth = parseNumber(values.BorderWidth);
      const fillOpacity = parseNumber(values.FillOpacity);
      const borderOpacity = parseNumber(values.BorderOpacity);
      if (widthNm !== undefined) zone.widthNm = widthNm;
      if (heightNm !== undefined) zone.heightNm = heightNm;
      if (radiusNm !== undefined) zone.radiusNm = radiusNm;
      if (bearing !== undefined) zone.bearing = bearing;
      if (values.Side) zone.side = values.Side;
      if (values.Color) zone.color = values.Color;
      if (values.BorderColor) zone.borderColor = values.BorderColor;
      if (borderWidth !== undefined) zone.borderWidth = borderWidth;
      if (fillOpacity !== undefined) zone.fillOpacity = fillOpacity;
      if (borderOpacity !== undefined) zone.borderOpacity = borderOpacity;
      if (values.FillStyle) zone.fillStyle = values.FillStyle;
      if (values.AllowedUnitTypes)
        zone.allowedUnitTypes = values.AllowedUnitTypes;
      if (values.VisibleIn) zone.visibleIn = values.VisibleIn;
      return zone;
    });
}

function parseMapSymbols(
  sections: Map<string, Record<string, string>>,
  language: Record<string, string>,
): TemplateMapSymbol[] {
  return [...sections.entries()]
    .filter(([id, values]) => /^MapSymbol_/.test(id) && values.GeoPoint)
    .map(([id, values]) => {
      const point = values.GeoPoint!.split(",").map(Number);
      const labelKey = values.LabelKey ?? `${id}Label`;
      const symbol: TemplateMapSymbol = {
        id,
        labelKey,
        label: language[`${labelKey}_en`] ?? labelKey,
        kind: values.Kind ?? "Label",
        color: values.Color ?? "Green",
        geoPoint: [point[0] ?? 0, point[1] ?? 0],
      };
      const fontSize = parseNumber(values.FontSize);
      const vSizeM = parseNumber(values.VSizeM);
      if (values.Font) symbol.font = values.Font;
      if (fontSize !== undefined) symbol.fontSize = fontSize;
      if (values.SizeMode) symbol.sizeMode = values.SizeMode;
      if (vSizeM !== undefined) symbol.vSizeM = vSizeM;
      if (values.VisibleIn) symbol.visibleIn = values.VisibleIn;
      return symbol;
    });
}

function parseWaypoints(value: string | undefined): ParsedWaypoints {
  if (!value) return { points: [], rawPoints: [] };
  const points: TemplateWaypoint[] = [];
  const rawPoints: string[] = [];
  for (const token of value.split("|")) {
    const parts = token.split(",");
    if (parts.length < 3) continue;
    const east = Number(parts[0]);
    const altitude = parts[1];
    const northToken = parts.slice(2).join(",");
    const northMatch = northToken.match(/^-?\d+(?:\.\d+)?/);
    const north = northMatch ? Number(northMatch[0]) : Number.NaN;
    if (!Number.isFinite(east) || !Number.isFinite(north) || !altitude)
      continue;
    points.push([east, altitude, north]);
    rawPoints.push(token);
  }
  return { points, rawPoints };
}

export function loadMissionTemplateMetadata(
  path: string,
): MissionTemplateMetadata {
  const { sections, language } = parseTemplate(path);
  const environment = sections.get("Environment") ?? {};
  const mapCenter: [number, number] = [
    Number(environment.MapCenterLatitude ?? 0),
    Number(environment.MapCenterLongitude ?? 0),
  ];
  const routes: TemplateRoute[] = [];
  for (const [id, values] of sections) {
    const parsedWaypoints = parseWaypoints(values.Waypoints);
    const waypoints = parsedWaypoints.points;
    if (!waypoints.length) continue;
    const kind =
      id === "Taskforce1Vessel1"
        ? "player"
        : id.startsWith("Taskforce2Submarine")
          ? "submarine"
          : id.startsWith("Taskforce2Vessel")
            ? "opfor"
            : id.includes("Aircraft")
              ? "air"
              : values.Type?.startsWith("civ_fv")
                ? "fishing"
                : values.Type?.startsWith("civ_ms")
                  ? "merchant"
                  : undefined;
    if (kind) {
      const spawnParts = values.RelativePositionInNM?.split(",");
      const spawnPosition =
        spawnParts?.length === 3 &&
        Number.isFinite(Number(spawnParts[0])) &&
        spawnParts[1] &&
        Number.isFinite(Number(spawnParts[2]))
          ? ([
              Number(spawnParts[0]),
              spawnParts[1],
              Number(spawnParts[2]),
            ] as TemplateWaypoint)
          : undefined;
      routes.push({
        id,
        kind,
        waypoints,
        ...(parsedWaypoints.rawPoints.length
          ? { rawWaypoints: parsedWaypoints.rawPoints }
          : {}),
        ...(spawnPosition ? { spawnPosition } : {}),
      });
    }
  }
  const landUnits: TemplateLandUnit[] = [];
  for (const [id, values] of sections) {
    const owner = /^Taskforce1LandUnit\d+$/.test(id)
      ? ("Taskforce1" as const)
      : /^NeutralLandUnit\d+$/.test(id)
        ? ("Neutral" as const)
        : undefined;
    if (!owner || !values.RelativePositionInNM) continue;
    const parts = values.RelativePositionInNM.split(",");
    if (parts.length !== 3) continue;
    const east = Number(parts[0]);
    const north = Number(parts[2]);
    if (!Number.isFinite(east) || !Number.isFinite(north)) continue;
    landUnits.push({
      id,
      type: values.Type ?? "",
      position: [east, parts[1] ?? "low", north],
      owner,
      ...(values.Heading ? { heading: values.Heading } : {}),
    });
  }
  return {
    mapCenter,
    mapSymbols: parseMapSymbols(sections, language),
    zones: parseZones(sections, language),
    routes,
    landUnits,
  };
}

export function templatePlayerStart(
  metadata: MissionTemplateMetadata,
  seed: string,
): [number, number] | undefined {
  const zone = metadata.zones.find((entry) => entry.id === "Zone1");
  if (zone) return sampleTemplateZone(zone, metadata, seed, 0).geo;
  const first = metadata.routes.find((route) => route.kind === "player")
    ?.waypoints[0];
  return first
    ? templateLocalToGeo([first[0], first[2]], metadata.mapCenter)
    : undefined;
}

export function loadMissionTemplate(path: string): TemplateZone[] {
  return loadMissionTemplateMetadata(path).zones;
}

export function geoToTemplateLocal(
  point: [number, number],
  mapCenter: [number, number],
): [number, number] {
  return [
    // Sea Power's mission-local X axis uses 60 NM per longitude degree;
    // unlike the browser map projection it does not apply cos(latitude).
    (point[1] - mapCenter[1]) * 60,
    (point[0] - mapCenter[0]) * 60,
  ];
}

export function templateLocalToGeo(
  point: [number, number],
  mapCenter: [number, number],
): [number, number] {
  return [mapCenter[0] + point[1] / 60, mapCenter[1] + point[0] / 60];
}

function stableRandom(seed: string, index: number): number {
  let result = 2166136261;
  for (const character of `${seed}:${index}`) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  // Avalanche the sequential FNV result before using adjacent values as the
  // two rectangle axes. Without this, large traffic populations can exhibit
  // visible diagonal bands even though every point is technically in-zone.
  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  result ^= result >>> 13;
  result = Math.imul(result, 0xc2b2ae35);
  result ^= result >>> 16;
  return (result >>> 0) / 4_294_967_295;
}

export function sampleTemplateZone(
  zone: TemplateZone,
  metadata: MissionTemplateMetadata,
  seed: string,
  index: number,
): { local: [number, number]; geo: [number, number] } {
  const center = geoToTemplateLocal(zone.geoPoint, metadata.mapCenter);
  const a = stableRandom(seed, index * 2) - 0.5;
  const b = stableRandom(seed, index * 2 + 1) - 0.5;
  let east = center[0];
  let north = center[1];
  if (zone.radiusNm !== undefined) {
    const angle = stableRandom(seed, index * 2 + 2) * Math.PI * 2;
    const radius = Math.sqrt(stableRandom(seed, index * 2 + 3)) * zone.radiusNm;
    east += Math.cos(angle) * radius;
    north += Math.sin(angle) * radius;
  } else {
    const width = zone.widthNm ?? 2;
    const height = zone.heightNm ?? width;
    const bearing = ((zone.bearing ?? 0) * Math.PI) / 180;
    const localEast = a * width;
    const localNorth = b * height;
    // Sea Power stores rectangle Bearing as a compass heading measured
    // clockwise from north, rather than a mathematical angle from east.
    east += localEast * Math.cos(bearing) + localNorth * Math.sin(bearing);
    north += -localEast * Math.sin(bearing) + localNorth * Math.cos(bearing);
  }
  return {
    local: [Number(east.toFixed(2)), Number(north.toFixed(2))],
    geo: templateLocalToGeo([east, north], metadata.mapCenter),
  };
}

export function templateZoneContainsLocal(
  zone: TemplateZone,
  metadata: MissionTemplateMetadata,
  point: [number, number],
  toleranceNm = 0.01,
): boolean {
  const center = geoToTemplateLocal(zone.geoPoint, metadata.mapCenter);
  const east = point[0] - center[0];
  const north = point[1] - center[1];
  if (zone.radiusNm !== undefined)
    return Math.hypot(east, north) <= zone.radiusNm + toleranceNm;

  const bearing = ((zone.bearing ?? 0) * Math.PI) / 180;
  const localEast = east * Math.cos(bearing) - north * Math.sin(bearing);
  const localNorth = east * Math.sin(bearing) + north * Math.cos(bearing);
  const width = zone.widthNm ?? 2;
  const height = zone.heightNm ?? width;
  return (
    Math.abs(localEast) <= width / 2 + toleranceNm &&
    Math.abs(localNorth) <= height / 2 + toleranceNm
  );
}

export function sampleTemplatePortStart(
  zones: TemplateZone[],
  seed: string,
): [number, number] | undefined {
  const port = zones.find((zone) => zone.id === "Zone1");
  if (!port) return undefined;
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const angle = ((hash >>> 0) / 4_294_967_295) * Math.PI * 2;
  const distanceNm = 6 + ((hash >>> 8) % 30) / 10;
  return [
    Number((port.geoPoint[0] + (Math.cos(angle) * distanceNm) / 60).toFixed(4)),
    Number(
      (
        port.geoPoint[1] +
        (Math.sin(angle) * distanceNm) /
          (60 * Math.cos((port.geoPoint[0] * Math.PI) / 180))
      ).toFixed(4),
    ),
  ];
}
