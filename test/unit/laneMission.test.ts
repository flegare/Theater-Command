import { describe, expect, it } from "vitest";
import { generateLaneMission } from "../../src/domain/laneMission.js";
import { renderNativeMissionIni } from "../../src/domain/nativeMission.js";
import {
  geoToTemplateLocal,
  loadMissionTemplateMetadata,
  sampleTemplateZone,
  templateZoneContainsLocal,
} from "../../src/domain/missionTemplate.js";
import { resolve } from "node:path";
import type { LaneTrafficPicture } from "../../src/domain/laneTraffic.js";
import type { TheaterLane } from "../../src/domain/trade.js";

const lane: TheaterLane = {
  id: "civil-lane",
  routeId: "civil-lane",
  kind: "shipping",
  name: "Civilian test lane",
  commodity: "industrial",
  countryIds: ["norway", "united-kingdom"],
  coordinates: [
    [60, 5],
    [59, 1],
    [58, -3],
  ],
  dailyValue: 10,
  dailyCapacity: 40,
  disruption: 0,
  region: "north_atlantic",
  coastal: true,
};

const traffic: LaneTrafficPicture = {
  laneId: lane.id,
  traffic: [
    {
      id: "merchant",
      kind: "merchant",
      domain: "surface",
      category: "merchant_vessel",
      nationality: "norway",
      expectedDailyCount: 2,
      disposition: "friendly",
      identificationRequired: true,
      flavor: "test merchant",
    },
    {
      id: "fishing",
      kind: "fishing",
      domain: "surface",
      category: "fishing_vessel",
      nationality: "norway",
      expectedDailyCount: 2,
      disposition: "neutral",
      identificationRequired: true,
      flavor: "test fishing boat",
    },
  ],
  encounters: [],
};

const airLane: TheaterLane = {
  ...lane,
  id: "air-lane",
  routeId: "air-lane",
  kind: "air",
  name: "Bergen civilian air corridor",
  commodity: "passengers",
};

const templatePath = resolve(
  process.cwd(),
  "..",
  "Sea Power_Data",
  "StreamingAssets",
  "user",
  "missions",
  "_bergen_region_template.ini",
);

describe("lane mission generation", () => {
  it("extracts Bergen zones and samples inside the template coordinate frame", () => {
    const template = loadMissionTemplateMetadata(
      resolve(
        process.cwd(),
        "..",
        "Sea Power_Data",
        "StreamingAssets",
        "user",
        "missions",
        "_bergen_region_template.ini",
      ),
    );
    expect(template.mapCenter).toEqual([54.27, -26.28]);
    expect(template.mapSymbols).toHaveLength(2);
    expect(template.mapSymbols[0]).toMatchObject({
      id: "MapSymbol_New1",
      label: "Bergen Port",
      geoPoint: [60.403187, 5.312677],
    });
    expect(template.zones).toHaveLength(16);
    expect(template.routes.some((route) => route.kind === "air")).toBe(true);
    expect(
      template.routes.filter((route) => route.kind === "submarine"),
    ).toHaveLength(4);
    expect(
      template.routes
        .filter((route) => route.kind === "submarine")
        .every((route) => route.spawnPosition),
    ).toBe(true);
    const port = template.zones.find((zone) => zone.id === "Zone1");
    expect(port).toBeDefined();
    const sample = sampleTemplateZone(port!, template, "sample", 1);
    expect(templateZoneContainsLocal(port!, template, sample.local)).toBe(true);
    expect(sample.local[0]).toBeGreaterThan(1800);
    expect(sample.local[0]).toBeLessThan(2000);
    expect(sample.local[1]).toBeGreaterThan(300);
    expect(sample.local[1]).toBeLessThan(450);
  });

  it("is deterministic and keeps a low-risk civilian lane non-military", () => {
    const first = generateLaneMission(
      lane,
      traffic,
      "test-seed",
      "norway",
      0.2,
    );
    const second = generateLaneMission(
      lane,
      traffic,
      "test-seed",
      "norway",
      0.2,
    );
    expect(first).toEqual(second);
    expect(first.candidateCountries).toEqual(["norway", "united-kingdom"]);
    expect(first.units).toHaveLength(2);
    expect(first.origin).not.toEqual(lane.coordinates[0]);
    expect(first.origin[1]).not.toEqual(lane.coordinates[0]![1]);
    expect(first.units[0]?.position).not.toEqual(first.units[1]?.position);
    expect(first.units.every((unit) => unit.role !== "possible_military")).toBe(
      true,
    );
    expect(first.units[0]?.position).toEqual(
      expect.arrayContaining([expect.any(Number), expect.any(Number)]),
    );
  });

  it("anchors civilian air traffic to the template airport with inbound and outbound legs", () => {
    const mission = generateLaneMission(
      airLane,
      {
        traffic: [
          {
            id: "air",
            kind: "civilian_air",
            category: "civilian_aircraft",
            nationality: "norway",
            expectedDailyCount: 4,
            identificationRequired: true,
          },
        ],
      },
      "air-seed",
      "norway",
      0,
      undefined,
      undefined,
      loadMissionTemplateMetadata(templatePath),
    );
    const aircraft = mission.units.filter(
      (unit) => unit.category === "civilian_aircraft",
    );
    expect(aircraft).toHaveLength(2);
    expect(aircraft[0]?.nativePosition?.[1]).toBe("10000");
    expect(aircraft[0]?.nativeWaypoints?.at(-1)?.[1]).toBe("3000");
    expect(aircraft[1]?.nativePosition?.[1]).toBe("1000");
    expect(aircraft[1]?.nativeWaypoints?.[0]?.[1]).toBe("1000");
    expect(aircraft[0]?.airTrafficDirection).toBe("inbound");
    expect(aircraft[1]?.airTrafficDirection).toBe("outbound");
    expect(aircraft[0]?.nativePosition).not.toEqual(
      aircraft[1]?.nativePosition,
    );
    const ini = renderNativeMissionIni(mission);
    expect(ini).toContain("Name=Despawn inbound civilian aircraft 1");
    expect(ini).toContain("Condition_Condition1_Units=NeutralAircraft1");
    expect(ini).toContain("Action_Units=NeutralAircraft1");
    expect(ini).toContain("Action_DespawnUnits=True");
    expect(ini).not.toContain("Condition_Condition1_Units=NeutralAircraft2");
  });

  it("adds a possible military placeholder only as risk rises", () => {
    const mission = generateLaneMission(
      lane,
      traffic,
      "risk-seed",
      "norway",
      0.7,
    );
    expect(
      mission.units.find(
        (unit) =>
          unit.role === "possible_military" && unit.category !== "submarine",
      ),
    ).toMatchObject({
      role: "possible_military",
      countryId: "soviet-union",
      identificationRequired: true,
      placeholder: true,
    });
  });

  it("renders a native Sea Power ini mission", () => {
    const mission = generateLaneMission(
      lane,
      traffic,
      "ini-seed",
      "norway",
      0.2,
    );
    const ini = renderNativeMissionIni(mission);
    expect(ini).toContain("[Mission]");
    expect(ini).not.toContain("NumberOfTaskforce2Vessels=0");
    expect(ini).toContain("[NeutralVessel1]");
    expect(ini).toContain("NeutralVessel1NameOverride=NV-01");
    expect(ini).toContain("Type=civ_ms_freighter_a");
    expect(ini).toMatch(
      /Type=civ_fv_(fishingboat_[ab]|okean|sidetrawler|sterntrawler_a)/,
    );
    expect(ini).toContain("RelativePositionInNM=");
    expect(ini).toContain("[Taskforce1_Objectives]");
    expect(ini).toContain("GroupName=TG NORWAY Civilian test");
    expect(ini).toContain("Telegraph=0");
  });

  it("renders side-aware land formations and a refinery supply trigger", () => {
    const mission = generateLaneMission(
      lane,
      {
        traffic: [
          {
            id: "fuel-merchant",
            kind: "merchant",
            domain: "surface",
            category: "merchant_vessel",
            nationality: "united-kingdom",
            expectedDailyCount: 3,
            disposition: "neutral",
            identificationRequired: true,
            flavor: "product tanker",
          },
        ],
      },
      "refinery-1",
      "norway",
      0.2,
    );
    mission.nativeOriginPosition = [0, "0", 0];
    mission.nativeLandUnits = [
      {
        id: "taskforce1-shore",
        type: "wp_supply_truck",
        position: [40, "0", 40],
        owner: "Taskforce1",
      },
      {
        id: "refinery",
        type: "civ_refinery",
        position: [5, "0", 5],
        owner: "Neutral",
      },
    ];
    mission.units = [
      {
        id: "fuel-merchant",
        role: "neutral",
        category: "merchant_vessel",
        countryId: "united-kingdom",
        position: [60, 60],
        directionVector: [1, 0],
        bearingDegrees: 90,
        identificationRequired: true,
        placeholder: true,
        contactTypeLabel: "Product tanker",
        nativePosition: [60, "0", 60],
        nativeType: "civ_ms_super_p",
        nativeVariant: "Variant1",
      },
    ];

    const ini = renderNativeMissionIni(mission);
    expect(ini).toContain("[Taskforce1LandUnit1]");
    expect(ini).toContain("[NeutralLandUnit1]");
    expect(ini).toContain("Taskforce1_NumberOfFormations=1");
    expect(ini).toContain("Neutral_NumberOfFormations=1");
    expect(ini).toContain(
      "Taskforce1_Formation1=Taskforce1LandUnit1|Shore installation|Loose|1.5",
    );
    expect(ini).toContain(
      "Neutral_Formation1=NeutralLandUnit1|Mongstad refinery|Loose|1.5",
    );
    expect(ini).toContain(
      "Action_ObjectivesCompleted=Escort tanker supply ship",
    );
    expect(ini).toContain(
      "Action_Taskforce1_Intel=Taskforce1RefinerySupplyIntel",
    );
    expect(ini).toContain(
      "Action_Taskforce2_Intel=Taskforce2RefinerySupplyIntel",
    );
  });

  it("creates patrol-zone objective triggers for all patrol zones in template metadata", () => {
    const mission = generateLaneMission(
      lane,
      traffic,
      "patrol-zone-seed",
      "norway",
      0.2,
      undefined,
      undefined,
      loadMissionTemplateMetadata(templatePath),
    );
    mission.nativeZones = [
      {
        id: "Zone15",
        label: "Patrol Zone 2",
        labelKey: "Zone15Label",
        shape: "Circle",
        geoPoint: [60.067949, 4.944033],
        radiusNm: 6,
      },
      {
        id: "Zone16",
        label: "Patrol Zone 3",
        labelKey: "Zone16Label",
        shape: "Circle",
        geoPoint: [60.740369, 4.786928],
        radiusNm: 3,
      },
    ];
    const ini = renderNativeMissionIni(mission);
    expect(ini).toContain("NumberOfTriggers=2");
    expect(ini).toContain("[Trigger1]");
    expect(ini).toContain("[Trigger2]");
    expect(ini).toContain("Action_ObjectivesCompleted=Patrol Zone 1");
    expect(ini).toContain("Action_ObjectivesCompleted=Patrol Zone 2");
    expect(ini).toContain("Patrol Zone 1=50,0,Incomplete,Main");
    expect(ini).toContain("Patrol Zone 2=50,0,Incomplete,Main");
  });

  it("uses the partner nation for inbound cargo", () => {
    const mission = generateLaneMission(
      lane,
      {
        ...traffic,
        traffic: [
          {
            ...traffic.traffic[0]!,
            id: "fuel-merchant",
            expectedDailyCount: 100,
          },
        ],
      },
      "inbound-seed",
      "norway",
      0.2,
    );
    expect(mission.units).toHaveLength(2);
    expect(mission.units[1]?.countryId).toBe("united-kingdom");
  });

  it("spreads cargo traffic over template routes and slows or anchors near port approaches", () => {
    const mission = generateLaneMission(
      lane,
      {
        ...traffic,
        traffic: traffic.traffic.map((spawn) =>
          spawn.category === "merchant_vessel"
            ? { ...spawn, expectedDailyCount: 16 }
            : spawn,
        ),
      },
      "cargo-route-seed-1",
      "norway",
      0.2,
      undefined,
      undefined,
      loadMissionTemplateMetadata(templatePath),
    );
    const cargo = mission.units.filter(
      (unit) => unit.category === "merchant_vessel",
    );
    expect(cargo.length).toBeGreaterThan(1);
    expect(new Set(cargo.map((unit) => unit.nativeType)).size).toBeGreaterThan(
      1,
    );
    expect(new Set(cargo.map((unit) => unit.countryId)).size).toBeGreaterThan(
      1,
    );
    expect(cargo.every((unit) => unit.vesselName)).toBe(true);
    expect(
      new Set(cargo.map((unit) => unit.nativePosition?.join(","))).size,
    ).toBe(cargo.length);
    expect(
      cargo
        .filter((unit) => unit.telegraph !== 0)
        .every((unit) => (unit.nativeWaypoints?.length ?? 0) > 0),
    ).toBe(true);
    expect(
      cargo
        .filter((unit) => unit.telegraph !== 0 && unit.nativePosition)
        .every((unit) => {
          const firstWaypoint = unit.nativeWaypoints?.[0];
          if (!firstWaypoint || !unit.nativePosition) return false;
          return (
            Math.hypot(
              firstWaypoint[0] - unit.nativePosition[0],
              firstWaypoint[2] - unit.nativePosition[2],
            ) <= 1.25
          );
        }),
    ).toBe(true);
    expect(cargo.some((unit) => unit.nearPort)).toBe(true);
    expect(
      cargo
        .filter((unit) => unit.nearPort)
        .every((unit) => (unit.telegraph ?? 0) <= 1),
    ).toBe(true);
  });

  it("spawns 10-30 varied fishing contacts with independent patrols", () => {
    const template = loadMissionTemplateMetadata(
      resolve(
        process.cwd(),
        "..",
        "Sea Power_Data",
        "StreamingAssets",
        "user",
        "missions",
        "_bergen_region_template.ini",
      ),
    );
    const mission = generateLaneMission(
      lane,
      traffic,
      "fishing-zone-seed-1",
      "norway",
      0.2,
      undefined,
      undefined,
      template,
    );
    const fishing = mission.units.filter(
      (unit) => unit.category === "fishing_vessel",
    );
    const biologics = mission.units.filter(
      (unit) => unit.category === "biological",
    );
    expect(biologics.length).toBeGreaterThan(0);
    expect(biologics.every((unit) => unit.nativeType?.startsWith("bio_"))).toBe(
      true,
    );
    const biologicIni = renderNativeMissionIni(mission);
    expect(biologicIni).toContain(
      `NumberOfNeutralBiologics=${biologics.length}`,
    );
    expect(biologicIni).toContain("[NeutralBiologic1]");
    expect(fishing.length).toBeGreaterThanOrEqual(10);
    expect(fishing.length).toBeLessThanOrEqual(30);
    expect(new Set(fishing.map((unit) => unit.spawnZoneId))).toEqual(
      new Set(["Zone3", "Zone4", "Zone5", "Zone6", "Zone7", "Zone8"]),
    );
    expect(
      new Set(fishing.map((unit) => unit.nativePosition?.join(","))).size,
    ).toBe(fishing.length);
    const stopped = fishing.filter((unit) => unit.telegraph === 0);
    expect(stopped).toHaveLength(Math.ceil(fishing.length * 0.2));
    expect(stopped.every((unit) => unit.nativeWaypoints?.length === 0)).toBe(
      true,
    );
    expect(new Set(fishing.map((unit) => unit.nativeType))).toEqual(
      new Set([
        "civ_fv_sterntrawler_a",
        "civ_fv_fishingboat_b",
        "civ_fv_sidetrawler",
        "civ_fv_fishingboat_a",
      ]),
    );
    expect(fishing.every((unit) => unit.vesselName)).toBe(true);
    expect(new Set(fishing.map((unit) => unit.vesselName)).size).toBe(
      fishing.length,
    );
    expect(fishing.some((unit) => unit.countryId === "denmark")).toBe(true);
    expect(
      fishing.some(
        (unit) =>
          unit.nativeType === "civ_fv_fishingboat_b" &&
          unit.nativeVariant === "Variant2",
      ),
    ).toBe(true);
    expect(
      fishing.some(
        (unit) =>
          unit.nativeType === "civ_fv_sidetrawler" &&
          unit.nativeVariant === "Variant1",
      ),
    ).toBe(true);
    expect(
      fishing.some((unit) =>
        /dhow|sampan|fishingboat_[cd]|sterntrawler_d|okean/.test(
          unit.nativeType ?? "",
        ),
      ),
    ).toBe(false);
    expect(
      new Set(
        fishing
          .filter((unit) => unit.telegraph !== 0)
          .map((unit) => unit.telegraph),
      ).size,
    ).toBeGreaterThan(1);
    const moving = fishing.filter((unit) => unit.telegraph !== 0);
    expect(
      new Set(
        moving.map((unit) =>
          unit.nativeWaypoints?.map((waypoint) => waypoint.join(",")).join("|"),
        ),
      ).size,
    ).toBe(moving.length);
    expect(fishing.filter((unit) => unit.radarActive).length).toBe(
      Math.ceil(fishing.length / 2),
    );
    expect(fishing.filter((unit) => !unit.radarActive).length).toBe(
      Math.floor(fishing.length / 2),
    );
    for (let left = 0; left < fishing.length; left += 1) {
      for (let right = left + 1; right < fishing.length; right += 1) {
        const leftPosition = fishing[left]!.nativePosition!;
        const rightPosition = fishing[right]!.nativePosition!;
        expect(
          Math.hypot(
            leftPosition[0] - rightPosition[0],
            leftPosition[2] - rightPosition[2],
          ),
        ).toBeGreaterThanOrEqual(0.34);
      }
    }
    for (const unit of fishing) {
      const position = unit.nativePosition!;
      const zone = template.zones.find(
        (candidate) => candidate.id === unit.spawnZoneId,
      );
      expect(zone).toBeDefined();
      expect(
        templateZoneContainsLocal(zone!, template, [position[0], position[2]]),
      ).toBe(true);
      if (unit.telegraph === 0) continue;
      for (const waypoint of unit.nativeWaypoints ?? []) {
        expect(
          templateZoneContainsLocal(zone!, template, [
            waypoint[0],
            waypoint[2],
          ]),
        ).toBe(true);
      }
      const firstWaypoint = unit.nativeWaypoints?.[0];
      expect(firstWaypoint).toBeDefined();
      expect(
        Math.hypot(
          position[0] - firstWaypoint![0],
          position[2] - firstWaypoint![2],
        ),
      ).toBeLessThanOrEqual(10);
    }
    const normalizedPositions = fishing.map((unit) => {
      const zone = template.zones.find(
        (candidate) => candidate.id === unit.spawnZoneId,
      )!;
      const center = geoToTemplateLocal(zone.geoPoint, template.mapCenter);
      const position = unit.nativePosition!;
      const east = position[0] - center[0];
      const north = position[2] - center[1];
      const bearing = ((zone.bearing ?? 0) * Math.PI) / 180;
      return [
        (east * Math.cos(bearing) - north * Math.sin(bearing)) /
          ((zone.widthNm ?? 2) / 2),
        (east * Math.sin(bearing) + north * Math.cos(bearing)) /
          ((zone.heightNm ?? zone.widthNm ?? 2) / 2),
      ];
    });
    const meanAcross =
      normalizedPositions.reduce((sum, point) => sum + point[0]!, 0) /
      normalizedPositions.length;
    const meanAlong =
      normalizedPositions.reduce((sum, point) => sum + point[1]!, 0) /
      normalizedPositions.length;
    const covariance = normalizedPositions.reduce(
      (sum, point) => sum + (point[0]! - meanAcross) * (point[1]! - meanAlong),
      0,
    );
    const acrossVariance = normalizedPositions.reduce(
      (sum, point) => sum + (point[0]! - meanAcross) ** 2,
      0,
    );
    const alongVariance = normalizedPositions.reduce(
      (sum, point) => sum + (point[1]! - meanAlong) ** 2,
      0,
    );
    const axisCorrelation =
      covariance / Math.sqrt(acrossVariance * alongVariance);
    expect(Math.abs(axisCorrelation)).toBeLessThan(0.7);
    const ini = renderNativeMissionIni(mission);
    const stoppedAll = mission.units.filter((unit) => unit.telegraph === 0);
    expect(
      ini.match(/Type=civ_fv_sterntrawler_a\r\nVariantReference=Default/g),
    ).not.toBeNull();
    expect(
      ini.match(/Type=civ_fv_fishingboat_b\r\nVariantReference=Variant2/g),
    ).not.toBeNull();
    expect(
      ini.match(/Type=civ_fv_fishingboat_b\r\nVariantReference=Variant3/g),
    ).not.toBeNull();
    expect(
      ini.match(/Type=civ_fv_sidetrawler\r\nVariantReference=Variant1/g),
    ).not.toBeNull();
    expect(
      ini.match(/Type=civ_fv_fishingboat_a\r\nVariantReference=Variant2/g),
    ).not.toBeNull();
    expect(ini.match(/NameOverride=.*STOPPED/g)).toHaveLength(
      stoppedAll.length,
    );
    expect(ini).toMatch(/NameOverride=NV-\d+ .+ \/ DENMARK /);
    expect((ini.match(/Telegraph=0/g) ?? []).length).toBeGreaterThanOrEqual(
      stoppedAll.length,
    );
    expect(
      (ini.match(/RadarsActive=True/g) ?? []).length,
    ).toBeGreaterThanOrEqual(Math.ceil(fishing.length / 2));
    expect(
      (ini.match(/RadarsActive=False/g) ?? []).length,
    ).toBeGreaterThanOrEqual(Math.floor(fishing.length / 2));
    const fishingSections = [
      ...ini.matchAll(/\[NeutralVessel\d+\]\r?\n([\s\S]*?)(?=\r?\n\[|$)/g),
    ]
      .map((match) => match[1] ?? "")
      .filter((section) => /Type=civ_fv_/.test(section));
    const headings = fishingSections.map(
      (section) => section.match(/^Heading=(.+)$/m)?.[1],
    );
    expect(new Set(headings).size).toBeGreaterThanOrEqual(
      Math.floor(fishing.length * 0.75),
    );
    const stoppedSectionNumbers = [
      ...ini.matchAll(/NeutralVessel(\d+)NameOverride=.*STOPPED/g),
    ].map((match) => match[1]);
    for (const sectionNumber of stoppedSectionNumbers) {
      const section = ini.match(
        new RegExp(
          `\\[NeutralVessel${sectionNumber}\\]\\r?\\n([\\s\\S]*?)(?=\\r?\\n\\[|$)`,
        ),
      )?.[1];
      expect(section).toBeDefined();
      expect(section).not.toContain("Waypoints=");
    }
    expect(ini).toContain("MapSymbol_New1Label_en=Bergen Port");
    expect(ini).toContain("[MapSymbols]\r\nNumberOfSymbols=2");
    expect(ini).toContain("[Zones]\r\nNumberOfZones=16");
    expect(ini).toContain("GeoPoint=60.142716,5.514706");
    expect(ini).toContain("VisibleIn=CampaignMap,BriefingMap");
  });
});
