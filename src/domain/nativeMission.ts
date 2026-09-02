import type { GeneratedLaneMission, GeneratedLaneUnit } from "./laneMission.js";
import { resolveMissionModules } from "./mission-mods/orchestrator.js";
import type { MissionGenerationConfig } from "./mission-mods/types.js";
import type {
  TemplateLandUnit,
  TemplateWaypoint,
  TemplateZone,
} from "./missionTemplate.js";

function unitType(unit: GeneratedLaneUnit): string {
  if (unit.nativeType) return unit.nativeType;
  if (unit.category === "fishing_vessel") {
    if (unit.countryId === "soviet-union") return "civ_fv_okean";
    if (unit.countryId === "norway") return "civ_fv_sterntrawler_a";
    return (
      (
        {
          Zone3: "civ_fv_sterntrawler_a",
          Zone4: "civ_fv_sidetrawler",
          Zone5: "civ_fv_fishingboat_b",
          Zone6: "civ_fv_sterntrawler_a",
          Zone7: "civ_fv_fishingboat_a",
          Zone8: "civ_fv_fishingboat_b",
        } as Record<string, string>
      )[unit.spawnZoneId ?? ""] ?? "civ_fv_fishingboat_b"
    );
  }
  if (unit.category === "merchant_vessel") {
    if (unit.id.includes("cruise")) return "civ_ms_roro_a";
    if (unit.id.includes("fuel")) return "civ_ms_super_p";
    return unit.role === "neutral" ? "civ_ms_mercur" : "civ_ms_freighter_a";
  }
  if (unit.category === "civilian_aircraft") return "civ_707";
  if (unit.category === "submarine") return "wp_ssn_victor1";
  if (unit.countryId === "soviet-union") return "wp_agi_okean_mod";
  return "usn_ffg_oliver_hazard_perry";
}

function variantReference(unit: GeneratedLaneUnit): string {
  if (unit.nativeVariant) return unit.nativeVariant;
  return unit.category === "fishing_vessel" && unit.countryId === "norway"
    ? "Default"
    : "Variant1";
}

function playerUnitType(countryId: string): string {
  if (countryId === "norway") return "knm_fs_sleipner";
  if (countryId === "denmark") return "knm_fs_sleipner";
  return countryId === "soviet-union"
    ? "wp_agi_okean_mod"
    : "usn_ffg_oliver_hazard_perry";
}

function playerVariantReference(countryId: string): string {
  if (countryId === "norway" || countryId === "denmark") return "Variant2";
  return countryId === "soviet-union" ? "Variant1" : "Variant1";
}

function playerGroupName(mission: GeneratedLaneMission): string {
  const lane = mission.laneName
    .replace(/\s+lane$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const country = nationCode(mission.playerCountryId).toUpperCase();
  return `TG ${country} ${lane}`.slice(0, 64);
}

function nationCode(countryId: string): string {
  return (
    (
      {
        "united-states": "us",
        "united-kingdom": "uk",
        norway: "norway",
        "soviet-union": "soviet",
        japan: "japan",
        china: "china",
        india: "india",
        pakistan: "pakistan",
        iran: "iran",
        iraq: "iraq",
        australia: "australia",
      } as Record<string, string>
    )[countryId] ?? countryId
  );
}

function relativePosition(
  unit: GeneratedLaneUnit,
  origin: [number, number],
): string {
  const latitude = (origin[0] + unit.position[0]) / 2;
  const eastNm =
    (unit.position[1] - origin[1]) * 60 * Math.cos((latitude * Math.PI) / 180);
  const northNm = (unit.position[0] - origin[0]) * 60;
  return `${eastNm.toFixed(2)},0,${northNm.toFixed(2)}`;
}

function nativePosition(
  unit: GeneratedLaneUnit,
  origin: [number, number],
): string {
  if (unit.nativePosition) return unit.nativePosition.join(",");
  return relativePosition(unit, origin);
}

function nativeHeading(unit: GeneratedLaneUnit): number {
  if (!unit.nativePosition || !unit.nativeWaypoints?.length)
    return unit.bearingDegrees;
  const waypoint = unit.nativeWaypoints.find(
    (point) =>
      Math.hypot(
        point[0] - unit.nativePosition![0],
        point[2] - unit.nativePosition![2],
      ) > 0.1,
  );
  if (!waypoint) return unit.bearingDegrees;
  const east = waypoint[0] - unit.nativePosition[0];
  const north = waypoint[2] - unit.nativePosition[2];
  return Number(
    (((Math.atan2(east, north) * 180) / Math.PI + 360) % 360).toFixed(1),
  );
}

function iniValue(value: string): string {
  return value.replace(/[\r\n=]/g, " ").trim();
}

function contactOverrideName(
  unit: GeneratedLaneUnit,
  prefix: "NV" | "NA",
  index: number,
): string {
  const category =
    unit.category === "fishing_vessel"
      ? (unit.contactTypeLabel ?? "Fishing")
      : unit.category === "civilian_aircraft"
        ? "Civil Air"
        : unit.category === "merchant_vessel"
          ? (unit.contactTypeLabel ?? "Cargo")
          : unit.id.includes("cruise")
            ? "Passenger"
            : unit.id.includes("fuel")
              ? "Tanker"
              : "Cargo";
  const zone = unit.spawnZoneId ? ` ${unit.spawnZoneId}` : "";
  const state = unit.telegraph === 0 ? " STOPPED" : "";
  const vesselName = unit.vesselName ? ` ${unit.vesselName} /` : "";
  return `${prefix}-${String(index).padStart(2, "0")}${vesselName} ${nationCode(unit.countryId).toUpperCase()} ${category}${zone}${state}`;
}

function waypointLine(
  waypoints: Array<[number, number]>,
  origin: [number, number],
  altitude: string,
): string {
  return waypoints
    .map(([latitude, longitude]) => {
      const eastNm =
        (longitude - origin[1]) *
        60 *
        Math.cos((((latitude + origin[0]) / 2) * Math.PI) / 180);
      const northNm = (latitude - origin[0]) * 60;
      return `${eastNm.toFixed(2)},${altitude},${northNm.toFixed(2)}`;
    })
    .join("|");
}

function nativeWaypointLine(
  waypoints: TemplateWaypoint[] | undefined,
  fallback: Array<[number, number]>,
  origin: [number, number],
  altitude: string,
): string {
  if (waypoints !== undefined)
    return waypoints.map((point) => point.join(",")).join("|");
  return waypointLine(fallback, origin, altitude);
}

function zoneLocalPoint(
  zone: TemplateZone,
  mapCenter: [number, number],
): [number, number] {
  return [
    (zone.geoPoint[1] - mapCenter[1]) * 60,
    (zone.geoPoint[0] - mapCenter[0]) * 60,
  ];
}

function patrolZonesForObjectives(zones: TemplateZone[]): TemplateZone[] {
  const patrolZones = zones.filter((zone) =>
    /patrol\s*zone/i.test(`${zone.label} ${zone.labelKey}`),
  );
  return patrolZones.sort((left, right) => {
    const leftOrder = Number(
      `${left.label} ${left.id}`.match(/(\d+)/)?.[1] ?? "999",
    );
    const rightOrder = Number(
      `${right.label} ${right.id}`.match(/(\d+)/)?.[1] ?? "999",
    );
    return leftOrder - rightOrder;
  });
}

function fishingZonesForIntel(zones: TemplateZone[]): TemplateZone[] {
  const matches = zones.filter((zone) => {
    const metadata = `${zone.id} ${zone.label} ${zone.labelKey}`.toLowerCase();
    return (
      /fish|trawl|seiner/.test(metadata) &&
      !/commercial.*fish|fish.*commercial/.test(metadata)
    );
  });
  if (matches.length) {
    return matches.sort((left, right) => {
      const leftOrder = Number(`${left.id}`.match(/(\d+)/)?.[1] ?? "999");
      const rightOrder = Number(`${right.id}`.match(/(\d+)/)?.[1] ?? "999");
      return leftOrder - rightOrder;
    });
  }
  return zones
    .filter((zone) => /^Zone[3-8]$/i.test(zone.id))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function fishingZoneNumber(zone: TemplateZone, index: number): number {
  return Number(zone.id.match(/(\d+)/)?.[1] ?? String(index + 1));
}

function hashNumber(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function distanceBetween(
  left: [number, number],
  right: [number, number],
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function landUnitFormationName(landUnits: TemplateLandUnit[]): string {
  const metadata = landUnits
    .map((unit) => unit.type)
    .join(" ")
    .toLowerCase();
  if (/refinery|fueltanks|oil|terminal/.test(metadata))
    return "Mongstad refinery";
  if (/hawk|mim-23|radar|aaa|fcr|launcher/.test(metadata))
    return "Radar and AA Emplacement";
  if (/factory|industrial|plant/.test(metadata)) return "Industrial site";
  return "Shore installation";
}

function isRefineryLandUnit(unit: TemplateLandUnit): boolean {
  return /refinery|fueltanks|oil|terminal/.test(unit.type.toLowerCase());
}

function isAirDefenseLandUnit(unit: TemplateLandUnit): boolean {
  return /hawk|mim-23|radar|aaa|fcr|launcher/.test(unit.type.toLowerCase());
}

function isTankerCandidate(unit: GeneratedLaneUnit): boolean {
  const metadata =
    `${unit.id} ${unit.nativeType ?? ""} ${unit.contactTypeLabel ?? ""}`.toLowerCase();
  return (
    unit.category === "merchant_vessel" &&
    /tanker|sealift|super_p|roro|cargo/.test(metadata)
  );
}

type MissionObjectiveProfile = {
  briefingBlufor: string;
  briefingRedfor: string;
  languageLines: string[];
  taskforce1Objectives: string[];
  taskforce2Objectives: string[];
  refineryTrigger?:
    | {
        tankerSection: string;
        positionNm: [number, number];
        radiusNm: number;
        completionObjective: string;
        blueIntelKey: string;
        redIntelKey: string;
      }
    | undefined;
  taskforce1FormationName?: string | undefined;
  neutralFormationName?: string | undefined;
};

function buildMissionObjectiveProfile(
  mission: GeneratedLaneMission,
  taskforce1LandUnits: TemplateLandUnit[],
  neutralLandUnits: TemplateLandUnit[],
  neutralVessels: GeneratedLaneUnit[],
): MissionObjectiveProfile {
  const refineryLandUnits = neutralLandUnits.filter(isRefineryLandUnit);
  const airDefenseLandUnits = taskforce1LandUnits.filter(isAirDefenseLandUnit);
  const tankerCandidates = neutralVessels.filter(isTankerCandidate);
  const originPoint = mission.nativeOriginPosition
    ? ([mission.nativeOriginPosition[0], mission.nativeOriginPosition[2]] as [
        number,
        number,
      ])
    : undefined;
  const refineryPoint = refineryLandUnits[0]
    ? ([refineryLandUnits[0].position[0], refineryLandUnits[0].position[2]] as [
        number,
        number,
      ])
    : undefined;
  const airDefensePoint = airDefenseLandUnits[0]
    ? ([
        airDefenseLandUnits[0].position[0],
        airDefenseLandUnits[0].position[2],
      ] as [number, number])
    : undefined;
  const nearestTanker = tankerCandidates
    .map((unit, index) => {
      const position = unit.nativePosition
        ? ([unit.nativePosition[0], unit.nativePosition[2]] as [number, number])
        : undefined;
      const distance =
        refineryPoint && position
          ? distanceBetween(refineryPoint, position)
          : originPoint && position
            ? distanceBetween(originPoint, position)
            : undefined;
      return { unit, index, position, distance };
    })
    .filter((candidate) => candidate.position !== undefined)
    .sort(
      (left, right) => (left.distance ?? 9999) - (right.distance ?? 9999),
    )[0];

  const feasibleThemes: Array<
    | "refinery_disruption"
    | "air_defense_recon"
    | "shipping_interdiction"
    | "industrial_recon"
    | "patrol"
  > = [];
  if (
    refineryPoint &&
    nearestTanker &&
    originPoint &&
    distanceBetween(originPoint, refineryPoint) <= 55
  ) {
    feasibleThemes.push("refinery_disruption");
  }
  if (
    airDefensePoint &&
    originPoint &&
    distanceBetween(originPoint, airDefensePoint) <= 45
  ) {
    feasibleThemes.push("air_defense_recon");
  }
  if (nearestTanker && originPoint && (nearestTanker.distance ?? 9999) <= 40) {
    feasibleThemes.push("shipping_interdiction");
  }
  if (refineryPoint) feasibleThemes.push("industrial_recon");
  if (!feasibleThemes.length) feasibleThemes.push("patrol");

  const theme =
    feasibleThemes[
      hashNumber(`${mission.seed}:${mission.laneId}:objective-theme`) %
        feasibleThemes.length
    ]!;
  const taskforce1FormationName = taskforce1LandUnits.length
    ? landUnitFormationName(taskforce1LandUnits)
    : undefined;
  const neutralFormationName = neutralLandUnits.length
    ? landUnitFormationName(neutralLandUnits)
    : undefined;

  switch (theme) {
    case "refinery_disruption": {
      const refineryName = neutralFormationName ?? "Mongstad refinery";
      return {
        briefingBlufor: `BLUFOR TASKING: Protect ${refineryName} and escort the tanker supply run into the complex.`,
        briefingRedfor: `REDFOR TASKING: Detect ${refineryName}, shadow the tanker, and disrupt the supply chain before it arrives.`,
        languageLines: [
          `Objective_Blufor_Primary=Protect ${refineryName} and escort the tanker supply run.`,
          `Objective_Blufor_DefendInfrastructure=Keep ${refineryName} operational and deny hostile reconnaissance.`,
          `Objective_Redfor_Primary=Disrupt ${refineryName} by intercepting the tanker supply run.`,
          `Objective_Redfor_Secondary=Identify the refinery complex and report target coordinates.`,
          `Taskforce1RefinerySupplyIntel=${refineryName} supply tanker is approaching. Hold the escort.`,
          `Taskforce2RefinerySupplyIntel=${refineryName} target is being approached. Continue disruption.`,
          `EndLogic_Blufor=BLUFOR SUCCESS: tanker reaches ${refineryName} and the installation remains operational. BLUFOR FAILURE: tanker is lost or the refinery is confirmed for hostile strike.`,
          `EndLogic_Redfor=REDFOR SUCCESS: tanker supply is disrupted or the refinery position is confirmed. REDFOR FAILURE: force fails to get a usable contact report.`,
        ],
        taskforce1Objectives: [
          `${refineryName}=100,0,Incomplete,Main`,
          "Escort tanker supply ship=100,0,Incomplete,Main",
          "Preserve shipping throughput=50,0,Incomplete,Secondary",
        ],
        taskforce2Objectives: [
          `${refineryName}=100,0,Incomplete,Main`,
          "Sink tanker before refinery=100,0,Incomplete,Main",
          "Identify shore target=50,0,Incomplete,Secondary",
        ],
        refineryTrigger:
          refineryPoint && nearestTanker
            ? {
                tankerSection: `NeutralVessel${nearestTanker.index + 1}`,
                positionNm: refineryPoint,
                radiusNm: Math.max(2, (nearestTanker.distance ?? 6) / 3),
                completionObjective: "Escort tanker supply ship",
                blueIntelKey: "Taskforce1RefinerySupplyIntel",
                redIntelKey: "Taskforce2RefinerySupplyIntel",
              }
            : undefined,
        taskforce1FormationName,
        neutralFormationName,
      };
    }
    case "air_defense_recon": {
      const airDefenseName =
        taskforce1FormationName ?? "Radar and AA Emplacement";
      return {
        briefingBlufor: `BLUFOR TASKING: Keep the ${airDefenseName} hidden and secure while the lane remains open.`,
        briefingRedfor: `REDFOR TASKING: Detect the defended air-defense site and report the radar and launcher layout.`,
        languageLines: [
          `Objective_Blufor_Primary=Defend the ${airDefenseName} and keep emissions discipline.`,
          `Objective_Redfor_Primary=Identify the ${airDefenseName} and confirm the site location.`,
          `Objective_Redfor_Secondary=Classify radar, launcher, and support units for follow-on targeting.`,
          `Taskforce1AirDefenseIntel=${airDefenseName} remains active. Hold your perimeter.`,
          `Taskforce2AirDefenseIntel=${airDefenseName} detected. Continue passive reconnaissance.`,
          "EndLogic_Blufor=BLUFOR SUCCESS: air-defense position remains concealed and mission traffic survives. BLUFOR FAILURE: the defended site is positively identified or destroyed.",
          "EndLogic_Redfor=REDFOR SUCCESS: the defended site is located and recorded. REDFOR FAILURE: mission force is neutralized before confirmation.",
        ],
        taskforce1Objectives: [
          `${airDefenseName}=100,0,Incomplete,Main`,
          "Preserve radar silence=50,0,Incomplete,Secondary",
        ],
        taskforce2Objectives: [
          `${airDefenseName}=100,0,Incomplete,Main`,
          "Confirm radar and launcher layout=50,0,Incomplete,Secondary",
        ],
        taskforce1FormationName,
        neutralFormationName,
      };
    }
    case "shipping_interdiction": {
      const tankerName = nearestTanker
        ? (nearestTanker.unit.contactTypeLabel ?? "tanker supply ship")
        : "tanker supply ship";
      return {
        briefingBlufor: `BLUFOR TASKING: Escort the ${tankerName} and keep the approach to Bergen secure.`,
        briefingRedfor: `REDFOR TASKING: Identify the ${tankerName} and interdict it before it reaches the refinery approach.`,
        languageLines: [
          `Objective_Blufor_Primary=Escort the ${tankerName} and keep the supply route open.`,
          `Objective_Redfor_Primary=Interdict the ${tankerName} before it reaches the refinery approach.`,
          `Objective_Redfor_Secondary=Shadow the vessel and report its route, speed, and escort pattern.`,
          `Taskforce1TankerIntel=${tankerName} is en route. Maintain escort.`,
          `Taskforce2TankerIntel=${tankerName} identified. Continue interdiction.`,
          "EndLogic_Blufor=BLUFOR SUCCESS: the tanker survives the transit and keeps the supply line open. BLUFOR FAILURE: the tanker is disrupted before arrival.",
          "EndLogic_Redfor=REDFOR SUCCESS: the tanker is interdicted or the route is fully classified. REDFOR FAILURE: hostile escorts prevent a usable strike opportunity.",
        ],
        taskforce1Objectives: [
          `${tankerName}=100,0,Incomplete,Main`,
          "Keep the tanker moving=100,0,Incomplete,Main",
          "Preserve shipping throughput=50,0,Incomplete,Secondary",
        ],
        taskforce2Objectives: [
          `${tankerName}=100,0,Incomplete,Main`,
          "Interdict the tanker supply run=100,0,Incomplete,Main",
          "Track the route for follow-on strike=50,0,Incomplete,Secondary",
        ],
        refineryTrigger:
          refineryPoint && nearestTanker
            ? {
                tankerSection: `NeutralVessel${nearestTanker.index + 1}`,
                positionNm: refineryPoint,
                radiusNm: Math.max(2, (nearestTanker.distance ?? 6) / 3),
                completionObjective: "Keep the tanker moving",
                blueIntelKey: "Taskforce1TankerIntel",
                redIntelKey: "Taskforce2TankerIntel",
              }
            : undefined,
        taskforce1FormationName,
        neutralFormationName,
      };
    }
    case "industrial_recon": {
      const refineryName = neutralFormationName ?? "industrial site";
      return {
        briefingBlufor: `BLUFOR TASKING: Protect the ${refineryName} and deny hostile identification.`,
        briefingRedfor: `REDFOR TASKING: Identify the ${refineryName} and report the shore assets.`,
        languageLines: [
          `Objective_Blufor_Primary=Protect the ${refineryName} from hostile reconnaissance.`,
          `Objective_Redfor_Primary=Identify the ${refineryName} and report the shore assets.`,
          `Objective_Redfor_Secondary=Gather follow-on target data for a future strike package.`,
          `Taskforce1IndustrialIntel=${refineryName} is under observation. Maintain defensive posture.`,
          `Taskforce2IndustrialIntel=${refineryName} detected. Continue target confirmation.`,
          "EndLogic_Blufor=BLUFOR SUCCESS: the industrial site remains unconfirmed to the attacker. BLUFOR FAILURE: the site is positively identified for strike.",
          "EndLogic_Redfor=REDFOR SUCCESS: the site is confirmed for targeting. REDFOR FAILURE: mission force is unable to gather usable imagery.",
        ],
        taskforce1Objectives: [
          `${refineryName}=100,0,Incomplete,Main`,
          "Deny hostile observation=50,0,Incomplete,Secondary",
        ],
        taskforce2Objectives: [
          `${refineryName}=100,0,Incomplete,Main`,
          "Identify industrial target=100,0,Incomplete,Main",
        ],
        taskforce1FormationName,
        neutralFormationName,
      };
    }
    default:
      return {
        briefingBlufor:
          "BLUFOR TASKING: Patrol the lane, classify contacts, and keep the traffic picture intact.",
        briefingRedfor:
          "REDFOR TASKING: Gather intelligence on the lane and keep your force survivable.",
        languageLines: [
          "Objective_Blufor_Primary=Maintain sea-lane security and classify suspicious contacts.",
          "Objective_Redfor_Primary=Gather actionable intelligence without exposing the force.",
          "EndLogic_Blufor=BLUFOR SUCCESS: patrol objectives are completed and protected assets survive.",
          "EndLogic_Redfor=REDFOR SUCCESS: target intelligence is confirmed. REDFOR FAILURE: mission force is neutralized before reporting.",
        ],
        taskforce1Objectives: [
          "Maintain sea-lane security=100,0,Incomplete,Main",
        ],
        taskforce2Objectives: ["Gather intelligence=100,0,Incomplete,Main"],
        taskforce1FormationName,
        neutralFormationName,
      };
  }
}

function surfaceDetectionRadiusScale(unitTypeId: string): number {
  const normalized = unitTypeId.toLowerCase();
  if (
    normalized.includes("pt_") ||
    normalized.includes("stenka") ||
    normalized.includes("tiger")
  ) {
    return 1.25;
  }
  if (normalized.includes("agi") || normalized.includes("okean")) {
    return 0.85;
  }
  return 1;
}

function primarySubmarineDetectionTargets(
  units: GeneratedLaneUnit[],
): string[] {
  if (!units.length) return [];
  const sorted = units
    .map((unit, index) => ({
      section: `Taskforce2Submarine${index + 1}`,
      chance: unit.spawnChance ?? 1,
    }))
    .sort((left, right) => right.chance - left.chance);
  return [sorted[0]!.section];
}

function primarySurfaceDetectionTargets(
  units: GeneratedLaneUnit[],
): Array<{ section: string; typeId: string }> {
  if (!units.length) return [];
  const sorted = units
    .map((unit, index) => ({
      section: `Taskforce2Vessel${index + 1}`,
      typeId: unitType(unit),
      chance: unit.spawnChance ?? 1,
    }))
    .sort((left, right) => right.chance - left.chance);
  return sorted.slice(0, 2).map(({ section, typeId }) => ({
    section,
    typeId,
  }));
}

function patrolZoneDisplayName(zone: TemplateZone, index: number): string {
  const fallback = zone.label || `Patrol Zone ${index + 1}`;
  if (!/patrol\s*zone/i.test(`${zone.label} ${zone.labelKey}`)) return fallback;
  return `Patrol Zone ${index + 1}`;
}

function neutralBiologicSection(
  unit: GeneratedLaneUnit,
  index: number,
  origin: [number, number],
): string[] {
  return [
    `[NeutralBiologic${index}]`,
    `Type=${unit.nativeType ?? "bio_fin_whale"}`,
    `VariantReference=${unit.nativeVariant ?? "Default"}`,
    "WeaponStatus=Free",
    "CrewSkill=Trained",
    `RelativePositionInNM=${nativePosition(unit, origin).replace(",0,", ",shallow,")}`,
    `Telegraph=${unit.telegraph ?? 2}`,
    "AutomateRoute=True",
    `Heading=${unit.bearingDegrees}`,
  ];
}

function neutralSection(
  unit: GeneratedLaneUnit,
  index: number,
  origin: [number, number],
  waypoints: Array<[number, number]>,
): string[] {
  const aircraft = unit.category === "civilian_aircraft";
  const section = `${aircraft ? "NeutralAircraft" : "NeutralVessel"}${index}`;
  return [
    `[${section}]`,
    `Type=${unitType(unit)}`,
    `VariantReference=${variantReference(unit)}`,
    ...(aircraft ? ["SquadronReference=Squadron4"] : []),
    "MissionType=NoMission",
    "UnlimitedFuel=False",
    "WeaponStatus=Tight",
    ...(unit.radarActive !== undefined
      ? [`RadarsActive=${unit.radarActive ? "True" : "False"}`]
      : []),
    "CrewSkill=Trained",
    "Morale=3",
    `RelativePositionInNM=${nativePosition(unit, origin)}`,
    `Heading=${nativeHeading(unit)}`,
    ...(unit.nativeWaypoints?.length === 0
      ? []
      : [
          `Waypoints=${nativeWaypointLine(unit.nativeWaypoints, waypoints, origin, aircraft ? "20000" : "0")}`,
        ]),
    ...(unit.nativeNation
      ? [`Nation=${unit.nativeNation}`]
      : [`Nation=${nationCode(unit.countryId)}`]),
    `Telegraph=${unit.telegraph ?? (unit.category === "fishing_vessel" ? 3 : 2)}`,
  ];
}

export function renderNativeMissionIni(
  mission: GeneratedLaneMission,
  generationConfig?: MissionGenerationConfig,
): string {
  const origin = mission.origin;
  const neutralUnits = mission.units.filter(
    (unit) => unit.role !== "possible_military",
  );
  const militaryUnits = mission.units.filter(
    (unit) => unit.role === "possible_military",
  );
  const neutralVessels = neutralUnits.filter(
    (unit) =>
      unit.category !== "civilian_aircraft" && unit.category !== "biological",
  );
  const neutralAircraft = neutralUnits.filter(
    (unit) => unit.category === "civilian_aircraft",
  );
  const neutralBiologics = neutralUnits.filter(
    (unit) => unit.category === "biological",
  );
  const militarySubmarines = militaryUnits.filter(
    (unit) => unit.category === "submarine",
  );
  const militaryVessels = militaryUnits.filter(
    (unit) => unit.category !== "submarine",
  );
  const taskforce1LandUnits =
    mission.nativeLandUnits?.filter(
      (landUnit) => landUnit.owner === "Taskforce1",
    ) ?? [];
  const neutralLandUnits =
    mission.nativeLandUnits?.filter(
      (landUnit) => landUnit.owner !== "Taskforce1",
    ) ?? [];
  const objectiveProfile = buildMissionObjectiveProfile(
    mission,
    taskforce1LandUnits,
    neutralLandUnits,
    neutralVessels,
  );
  const missionDate = new Date(mission.campaignTime ?? "1983-11-05T06:00:00Z");
  const year = missionDate.getUTCFullYear();
  const month = missionDate.getUTCMonth() + 1;
  const day = missionDate.getUTCDate();
  const hour = missionDate.getUTCHours();
  const minute = missionDate.getUTCMinutes();
  const mapCenter = mission.nativeMapCenter ?? origin;
  const patrolZones = patrolZonesForObjectives(mission.nativeZones ?? []);
  const patrolZoneNames = new Map(
    patrolZones.map((zone, index) => [
      zone.id,
      patrolZoneDisplayName(zone, index),
    ]),
  );
  const fishingZones = fishingZonesForIntel(mission.nativeZones ?? []);
  const missionModules = resolveMissionModules(mission, generationConfig, {
    hasFishingZones: fishingZones.length > 0,
    hasRefineryObjective: objectiveProfile.refineryTrigger !== undefined,
  });
  const submarineIntelTargets =
    primarySubmarineDetectionTargets(militarySubmarines);
  const surfaceIntelTargets = primarySurfaceDetectionTargets(militaryVessels);
  const fishermanIntelEnabled = missionModules.isEnabled(
    "fisherman_intel_reports",
  );
  const hasSubIntel = fishermanIntelEnabled && submarineIntelTargets.length > 0;
  const hasSurfaceIntel =
    fishermanIntelEnabled && surfaceIntelTargets.length > 0;
  const fishingIntelTriggerCount = fishermanIntelEnabled
    ? fishingZones.length *
      (submarineIntelTargets.length + surfaceIntelTargets.length)
    : 0;
  const effectiveRefineryTrigger = missionModules.isEnabled(
    "refinery_state_continuity",
  )
    ? objectiveProfile.refineryTrigger
    : undefined;
  const refineryTriggerCount = effectiveRefineryTrigger ? 1 : 0;
  const inboundAircraft = neutralAircraft
    .map((unit, index) => ({ unit, section: index + 1 }))
    .filter(({ unit }) => unit.airTrafficDirection === "inbound");
  const triggerCount =
    inboundAircraft.length +
    patrolZones.length +
    fishingIntelTriggerCount +
    refineryTriggerCount;
  const lines = [
    "; Generated by Sea Power Theater Command",
    `; Seed=${iniValue(mission.seed)}`,
    "[General]",
    "Type=Mission",
    "",
    "[Language_en]",
    `Name=${iniValue(mission.title)}`,
    `Description=Bergen coastal watch during the Northern Flank crisis. Patrol the ${iniValue(mission.laneName)}, maintain a clear picture of civilian traffic, and investigate the suspected Soviet intelligence contact without causing an international incident.`,
    `Briefing_Blufor=${objectiveProfile.briefingBlufor}`,
    `Briefing_Redfor=${objectiveProfile.briefingRedfor}`,
    ...objectiveProfile.languageLines,
    ...(mission.nativeMapSymbols ?? []).map(
      (symbol) => `${symbol.labelKey}_en=${iniValue(symbol.label)}`,
    ),
    ...(mission.nativeZones ?? []).map(
      (zone) =>
        `${zone.labelKey}_en=${iniValue(patrolZoneNames.get(zone.id) ?? zone.label)}`,
    ),
    ...neutralVessels.map(
      (unit, index) =>
        `NeutralVessel${index + 1}NameOverride=${contactOverrideName(unit, "NV", index + 1)}`,
    ),
    ...neutralAircraft.map(
      (unit, index) =>
        `NeutralAircraft${index + 1}NameOverride=${contactOverrideName(unit, "NA", index + 1)}`,
    ),
    ...militaryVessels.map(
      (_unit, index) =>
        `Taskforce2Vessel${index + 1}NameOverride=AGI-${String(index + 1).padStart(2, "0")}`,
    ),
    ...militarySubmarines.map(
      (_unit, index) =>
        `Taskforce2Submarine${index + 1}NameOverride=${index === 0 ? "K-38" : `RED-SUB-${String(index + 1).padStart(2, "0")}`}`,
    ),
    "Objective_IdentifyTraffic=Identify and classify civilian vessels and aircraft before engagement.",
    "Objective_InvestigateContact=Investigate the suspected Soviet intelligence vessel and report its activity.",
    "Objective_PreserveTraffic=Keep the Bergen approach open; do not fire on neutral traffic unless positively identified as hostile.",
    ...(fishermanIntelEnabled
      ? fishingZones.flatMap((zone, index) => {
          const zoneNumber = fishingZoneNumber(zone, index);
          return [
            ...(hasSubIntel
              ? [
                  `Taskforce1FishingZone${zoneNumber}SubIntel=Fishing vessels in Fishing Zone ${zoneNumber} report periscope wakes and unusual underwater activity.`,
                  `Taskforce2FishingZone${zoneNumber}SubIntel=SIGINT: Coastal guard channels report fishermen sighted a probable periscope in Fishing Zone ${zoneNumber}.`,
                ]
              : []),
            ...(hasSurfaceIntel
              ? [
                  `Taskforce1FishingZone${zoneNumber}SurfaceIntel=Fishing vessels in Fishing Zone ${zoneNumber} report an unidentified fast craft probing local traffic lanes.`,
                  `Taskforce2FishingZone${zoneNumber}SurfaceIntel=SIGINT: Fishing traffic reports visual contact with an unidentified military-like surface craft in Fishing Zone ${zoneNumber}.`,
                ]
              : []),
          ];
        })
      : []),
    ...patrolZones.flatMap((zone, index) => [
      `TriggerPatrolZone${index + 1}AreaLabel=${iniValue(patrolZoneNames.get(zone.id) ?? zone.label)}`,
      `Taskforce1PatrolZone${index + 1}Intel=${iniValue(patrolZoneNames.get(zone.id) ?? zone.label)} reached. Continue sector sweep.`,
      `Taskforce2PatrolZone${index + 1}Intel=BLUFOR patrol pattern observed near ${iniValue(patrolZoneNames.get(zone.id) ?? zone.label)}.`,
      `Objective_PatrolZone${index + 1}=Reach - ${iniValue(patrolZoneNames.get(zone.id) ?? zone.label)}`,
    ]),
    "",
    "[Environment]",
    `Date=${year},${month},${day}`,
    `Time=${hour},${minute}`,
    "ConvertTimeToLocal=False",
    "SeaState=4",
    "Clouds=Overcast",
    "WindDirection=SW",
    `MapCenterLatitude=${mapCenter[0].toFixed(4)}`,
    `MapCenterLongitude=${mapCenter[1].toFixed(4)}`,
    "LoadBackgroundData=False",
    "",
    "[Mission]",
    "Difficulty=1",
    "AllowMoraleToAffectAI=True",
    "PlayerTaskforce=Taskforce1",
    "NumberOfTaskforce1Vessels=1",
    ...(militaryVessels.length > 0 || militarySubmarines.length > 0
      ? [
          "EnemyTaskforce=Taskforce2",
          `NumberOfTaskforce2Vessels=${militaryVessels.length}`,
        ]
      : []),
    ...(militarySubmarines.length > 0
      ? [`NumberOfTaskforce2Submarines=${militarySubmarines.length}`]
      : []),
    `NumberOfNeutralVessels=${neutralVessels.length}`,
    `NumberOfNeutralAircraft=${neutralAircraft.length}`,
    `NumberOfNeutralBiologics=${neutralBiologics.length}`,
    "NumberOfNeutralHelicopters=0",
    ...(taskforce1LandUnits.length
      ? [`NumberOfTaskforce1LandUnits=${taskforce1LandUnits.length}`]
      : []),
    ...(neutralLandUnits.length
      ? [`NumberOfNeutralLandUnits=${neutralLandUnits.length}`]
      : []),
    ...(taskforce1LandUnits.length
      ? [
          "Taskforce1_NumberOfFormations=1",
          `Taskforce1_Formation1=${taskforce1LandUnits
            .map((_, index) => `Taskforce1LandUnit${index + 1}`)
            .join(
              ",",
            )}|${objectiveProfile.taskforce1FormationName ?? landUnitFormationName(taskforce1LandUnits)}|Loose|1.5`,
        ]
      : []),
    ...(neutralLandUnits.length
      ? [
          "Neutral_NumberOfFormations=1",
          `Neutral_Formation1=${neutralLandUnits
            .map((_, index) => `NeutralLandUnit${index + 1}`)
            .join(
              ",",
            )}|${objectiveProfile.neutralFormationName ?? landUnitFormationName(neutralLandUnits)}|Loose|1.5`,
        ]
      : []),
    ...(triggerCount > 0 ? [`NumberOfTriggers=${triggerCount}`] : []),
    "",
    "[Taskforce1Vessel1]",
    `Type=${playerUnitType(mission.playerCountryId)}`,
    `VariantReference=${playerVariantReference(mission.playerCountryId)}`,
    "SetSelected=True",
    `GroupName=${iniValue(playerGroupName(mission))}`,
    "StationRole=ASW",
    "MissionType=Patrol",
    "RadarsActive=True",
    "CrewSkill=Trained",
    "WeaponStatus=Tight",
    `RelativePositionInNM=${mission.nativeOriginPosition?.join(",") ?? "0,0,0"}`,
    `Heading=${mission.bearingDegrees}`,
    `Nation=${nationCode(mission.playerCountryId)}`,
    "Telegraph=0",
    `Waypoints=${mission.nativeWaypointTokens?.join("|") ?? mission.nativeWaypoints?.map((point) => point.join(",")).join("|") ?? waypointLine(mission.waypoints, origin, "0")}`,
  ];
  taskforce1LandUnits.forEach((landUnit, index) => {
    lines.push(
      "",
      `[Taskforce1LandUnit${index + 1}]`,
      `Type=${landUnit.type}`,
      "VariantReference=Default",
      "UnlimitedFuel=False",
      "WeaponStatus=Free",
      "CrewSkill=Trained",
      `RelativePositionInNM=${landUnit.position.join(",")}`,
      ...(landUnit.heading ? [`Heading=${landUnit.heading}`] : []),
    );
  });
  neutralLandUnits.forEach((landUnit, index) => {
    lines.push(
      "",
      `[NeutralLandUnit${index + 1}]`,
      `Type=${landUnit.type}`,
      "VariantReference=Default",
      "UnlimitedFuel=False",
      "WeaponStatus=Free",
      "CrewSkill=Trained",
      `RelativePositionInNM=${landUnit.position.join(",")}`,
      ...(landUnit.heading ? [`Heading=${landUnit.heading}`] : []),
    );
  });
  militaryVessels.forEach((unit, index) => {
    lines.push(
      "",
      `[Taskforce2Vessel${index + 1}]`,
      `Type=${unitType(unit)}`,
      `VariantReference=${variantReference(unit)}`,
      ...(unit.spawnChance !== undefined
        ? [`SpawnChance=${unit.spawnChance.toFixed(2)}`]
        : []),
      "StationRole=ASuW",
      "MissionType=Patrol",
      "CrewSkill=Trained",
      "WeaponStatus=Hold",
      `RelativePositionInNM=${nativePosition(unit, origin)}`,
      `Heading=${unit.bearingDegrees}`,
      `Nation=${nationCode(unit.countryId)}`,
      "Telegraph=2",
      `Waypoints=${nativeWaypointLine(unit.nativeWaypoints, mission.waypoints, origin, "0")}`,
    );
  });
  militarySubmarines.forEach((unit, index) => {
    lines.push(
      "",
      `[Taskforce2Submarine${index + 1}]`,
      `Type=${unitType(unit)}`,
      `VariantReference=${variantReference(unit)}`,
      ...(unit.spawnChance !== undefined
        ? [`SpawnChance=${unit.spawnChance.toFixed(2)}`]
        : []),
      "MissionType=Patrol",
      "CrewSkill=Trained",
      "WeaponStatus=Hold",
      `RelativePositionInNM=${nativePosition(unit, origin)}`,
      `Heading=${unit.bearingDegrees}`,
      `Nation=${nationCode(unit.countryId)}`,
      "Telegraph=2",
      `Waypoints=${nativeWaypointLine(unit.nativeWaypoints, mission.waypoints, origin, "shallow")}`,
    );
  });
  neutralVessels.forEach((unit, index) => {
    lines.push(
      "",
      ...neutralSection(unit, index + 1, origin, mission.waypoints),
    );
  });
  neutralAircraft.forEach((unit, index) => {
    lines.push(
      "",
      ...neutralSection(unit, index + 1, origin, mission.waypoints),
    );
  });
  neutralBiologics.forEach((unit, index) => {
    lines.push("", ...neutralBiologicSection(unit, index + 1, origin));
  });
  const airportSymbol = mission.nativeMapSymbols?.find((symbol) =>
    symbol.label.toLowerCase().includes("airport"),
  );
  if (airportSymbol) {
    const airportLocal = [
      (airportSymbol.geoPoint[1] - mapCenter[1]) * 60,
      (airportSymbol.geoPoint[0] - mapCenter[0]) * 60,
    ] as [number, number];
    inboundAircraft.forEach(({ section }, index) => {
      const triggerNumber = index + 1;
      const aircraftSection = `NeutralAircraft${section}`;
      lines.push(
        "",
        "; Trigger: clean up inbound civilian airframes once they reach Bergen airport",
        `[Trigger${triggerNumber}]`,
        `Name=Despawn inbound civilian aircraft ${section}`,
        "Description=Remove an inbound civilian flight after it reaches Bergen Airport.",
        "Condition_Condition1_Type=UnitsInTheArea",
        `Condition_Condition1_PositionNM=${airportLocal[0].toFixed(3)},0,${airportLocal[1].toFixed(3)}`,
        "Condition_Condition1_AreaRadiusNM=1",
        "Condition_Condition1_AreaDisplaySide=None",
        `Condition_Condition1_Units=${aircraftSection}`,
        "Condition_Condition1_MinimumUnits=1",
        "Condition_Condition1_UnitType=Aircraft",
        "ConditionsCompleted=<Condition1>",
        `Action_Units=${aircraftSection}`,
        "Action_DespawnUnits=True",
      );
    });
  }
  patrolZones.forEach((zone, index) => {
    const triggerNumber = inboundAircraft.length + index + 1;
    const local = zoneLocalPoint(zone, mapCenter);
    const radiusNm =
      zone.radiusNm ??
      Math.max(
        1,
        ((zone.widthNm ?? zone.heightNm ?? 2) +
          (zone.heightNm ?? zone.widthNm ?? 2)) /
          4,
      );
    const patrolName =
      patrolZoneNames.get(zone.id) ?? zone.label ?? `Patrol Zone ${index + 1}`;
    lines.push(
      "",
      "; Trigger: BLUFOR patrol-sector progression",
      `[Trigger${triggerNumber}]`,
      `Name=${iniValue(patrolName)}`,
      "Description=Reach this patrol zone and continue mission patrol.",
      `Condition_Condition1_Description=Patrol boat reached ${iniValue(patrolName)}.`,
      "Condition_Condition1_Type=UnitsInTheArea",
      `Condition_Condition1_PositionNM=${local[0].toFixed(3)},0,${local[1].toFixed(3)}`,
      `Condition_Condition1_AreaRadiusNM=${radiusNm.toFixed(2)}`,
      `Condition_Condition1_AreaLabel=TriggerPatrolZone${index + 1}AreaLabel`,
      "Condition_Condition1_AreaDisplaySide=Blue",
      "Condition_Condition1_Taskforce=Taskforce1",
      "Condition_Condition1_Units=Taskforce1Vessel1",
      "Condition_Condition1_MinimumUnits=1",
      "Condition_Condition1_UnitType=Vessel",
      "ConditionsCompleted=<Condition1>",
      `Action_ObjectivesCompleted=${iniValue(patrolName)}`,
      `Action_Taskforce1_Intel=Taskforce1PatrolZone${index + 1}Intel`,
      `Action_Taskforce2_Intel=Taskforce2PatrolZone${index + 1}Intel`,
    );
  });
  if (effectiveRefineryTrigger) {
    const triggerNumber = inboundAircraft.length + patrolZones.length + 1;
    lines.push(
      "",
      "; Trigger: refinery supply tanker arrival at the industrial complex",
      `[Trigger${triggerNumber}]`,
      `Name=Refinery supply tanker reaches ${objectiveProfile.neutralFormationName ?? "the refinery"}`,
      "Description=The supply tanker reaches the refinery approach and the strike window closes.",
      "Condition_Condition1_Type=UnitsInTheArea",
      `Condition_Condition1_PositionNM=${effectiveRefineryTrigger.positionNm[0].toFixed(3)},0,${effectiveRefineryTrigger.positionNm[1].toFixed(3)}`,
      `Condition_Condition1_AreaRadiusNM=${effectiveRefineryTrigger.radiusNm.toFixed(2)}`,
      "Condition_Condition1_AreaDisplaySide=None",
      `Condition_Condition1_Units=${effectiveRefineryTrigger.tankerSection}`,
      "Condition_Condition1_MinimumUnits=1",
      "Condition_Condition1_UnitType=Vessel",
      "ConditionsCompleted=<Condition1>",
      `Action_ObjectivesCompleted=${effectiveRefineryTrigger.completionObjective}`,
      `Action_Taskforce1_Intel=${effectiveRefineryTrigger.blueIntelKey}`,
      `Action_Taskforce2_Intel=${effectiveRefineryTrigger.redIntelKey}`,
    );
  }
  let fishingIntelTriggerOffset = inboundAircraft.length + patrolZones.length;
  if (fishermanIntelEnabled)
    fishingZones.forEach((zone, index) => {
      const local = zoneLocalPoint(zone, mapCenter);
      const baseRadiusNm =
        zone.radiusNm ??
        Math.max(
          2,
          ((zone.widthNm ?? zone.heightNm ?? 6) +
            (zone.heightNm ?? zone.widthNm ?? 6)) /
            4,
        );
      const zoneNumber = fishingZoneNumber(zone, index);
      submarineIntelTargets.forEach((subSection, targetIndex) => {
        fishingIntelTriggerOffset += 1;
        lines.push(
          "",
          "; Trigger: neutral traffic detects a specific RedFor submarine near active fishing grounds",
          `[Trigger${fishingIntelTriggerOffset}]`,
          `Name=Fishing report Zone ${zoneNumber} submarine ${targetIndex + 1}`,
          "Description=A fisherman spotted probable periscope activity and reported it to coastal authorities.",
          "Condition_Condition1_Type=UnitDetected",
          `Condition_Condition1_PositionNM=${local[0].toFixed(3)},0,${local[1].toFixed(3)}`,
          `Condition_Condition1_AreaRadiusNM=${baseRadiusNm.toFixed(2)}`,
          "Condition_Condition1_AreaDisplaySide=None",
          "Condition_Condition1_Taskforce=Neutral",
          `Condition_Condition1_Units=${subSection}`,
          "ConditionsCompleted=<Condition1>",
          `Action_Taskforce1_Intel=Taskforce1FishingZone${zoneNumber}SubIntel`,
          `Action_Taskforce2_Intel=Taskforce2FishingZone${zoneNumber}SubIntel`,
        );
      });
      surfaceIntelTargets.forEach((surfaceTarget, targetIndex) => {
        fishingIntelTriggerOffset += 1;
        const tunedRadiusNm =
          baseRadiusNm * surfaceDetectionRadiusScale(surfaceTarget.typeId);
        lines.push(
          "",
          "; Trigger: neutral traffic detects a specific RedFor surface craft near active fishing grounds",
          `[Trigger${fishingIntelTriggerOffset}]`,
          `Name=Fishing report Zone ${zoneNumber} surface ${targetIndex + 1}`,
          "Description=Fishermen reported an unusual surface contact to coastal authorities.",
          "Condition_Condition1_Type=UnitDetected",
          `Condition_Condition1_PositionNM=${local[0].toFixed(3)},0,${local[1].toFixed(3)}`,
          `Condition_Condition1_AreaRadiusNM=${tunedRadiusNm.toFixed(2)}`,
          "Condition_Condition1_AreaDisplaySide=None",
          "Condition_Condition1_Taskforce=Neutral",
          `Condition_Condition1_Units=${surfaceTarget.section}`,
          "ConditionsCompleted=<Condition1>",
          `Action_Taskforce1_Intel=Taskforce1FishingZone${zoneNumber}SurfaceIntel`,
          `Action_Taskforce2_Intel=Taskforce2FishingZone${zoneNumber}SurfaceIntel`,
        );
      });
    });
  lines.push(
    "",
    "; Objective board used when BLUFOR is the player taskforce",
    "[Taskforce1_Objectives]",
    "IdentifyTraffic=100,-100,Incomplete,Main",
    ...objectiveProfile.taskforce1Objectives,
    ...patrolZones.map(
      (zone) =>
        `${iniValue(patrolZoneNames.get(zone.id) ?? zone.label ?? "Patrol Zone")}=50,0,Incomplete,Main`,
    ),
    "",
    "; Objective board used when mission is side-flipped and REDFOR is the player taskforce",
    "[Taskforce2_Objectives]",
    ...objectiveProfile.taskforce2Objectives,
    "",
    "; End logic documentation for theater campaign scoring integration",
    "; BLUFOR success state: patrol and defense objectives complete with protected assets surviving.",
    "; REDFOR success state: defended targets detected and/or strategic shipping disrupted.",
    "; Final mission-end triggers are intentionally left for campaign-layer orchestration.",
    "",
  );
  if (mission.nativeMapSymbols?.length) {
    lines.push(
      "[MapSymbols]",
      `NumberOfSymbols=${mission.nativeMapSymbols.length}`,
      ...mission.nativeMapSymbols.map(
        (symbol, index) => `Symbol${index + 1}=${symbol.id}`,
      ),
    );
    mission.nativeMapSymbols.forEach((symbol) => {
      lines.push(
        `[${symbol.id}]`,
        `Kind=${symbol.kind}`,
        `LabelKey=${symbol.labelKey}`,
        `Color=${symbol.color}`,
        `GeoPoint=${symbol.geoPoint.join(",")}`,
        `Font=${symbol.font ?? "SansSerif"}`,
        `FontSize=${symbol.fontSize ?? 14}`,
        `SizeMode=${symbol.sizeMode ?? "Absolute"}`,
        `VSizeM=${symbol.vSizeM ?? 500}`,
        `VisibleIn=${symbol.visibleIn ?? "None"}`,
      );
    });
    lines.push("");
  }
  if (mission.nativeZones?.length) {
    lines.push(
      "[Zones]",
      `NumberOfZones=${mission.nativeZones.length}`,
      ...mission.nativeZones.map(
        (zone, index) => `Zone${index + 1}=${zone.id}`,
      ),
    );
    mission.nativeZones.forEach((zone) => {
      lines.push(
        `[${zone.id}]`,
        "Type=Deployment",
        `Shape=${zone.shape}`,
        `LabelKey=${zone.labelKey}`,
        `Side=${zone.side ?? "Blue"}`,
        `Color=${zone.color ?? "Green"}`,
        ...(zone.geoPoints?.length
          ? [
              `NumberOfGeoPoints=${zone.geoPoints.length}`,
              ...zone.geoPoints.map(
                (point, pointIndex) =>
                  `GeoPoint${pointIndex + 1}=${point.join(",")}`,
              ),
            ]
          : [`GeoPoint=${zone.geoPoint.join(",")}`]),
        ...(zone.radiusNm !== undefined ? [`RadiusNm=${zone.radiusNm}`] : []),
        ...(zone.widthNm !== undefined ? [`WidthNm=${zone.widthNm}`] : []),
        ...(zone.heightNm !== undefined ? [`HeightNm=${zone.heightNm}`] : []),
        ...(zone.bearing !== undefined ? [`Bearing=${zone.bearing}`] : []),
        `BorderColor=${zone.borderColor ?? zone.color ?? "Green"}`,
        `BorderWidth=${zone.borderWidth ?? 1.5}`,
        `FillOpacity=${zone.fillOpacity ?? 0.05}`,
        `BorderOpacity=${zone.borderOpacity ?? 0.15}`,
        `FillStyle=${zone.fillStyle ?? "Fill"}`,
        `AllowedUnitTypes=${zone.allowedUnitTypes ?? "Vessel,Submarine,Helicopter,Aircraft,Land"}`,
        `VisibleIn=${zone.visibleIn ?? "None"}`,
      );
    });
    lines.push("");
  }
  return lines.join("\r\n");
}
