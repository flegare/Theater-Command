import type { ContactCategory, ContactDomain } from "./contacts.js";
import type { TheaterLane } from "./trade.js";

export type LaneTrafficKind =
  "merchant" | "cruise" | "fishing" | "civilian_air";

export type LaneTrafficSpawn = {
  id: string;
  kind: LaneTrafficKind;
  domain: ContactDomain;
  category: ContactCategory;
  nationality: string;
  expectedDailyCount: number;
  disposition: "neutral" | "friendly";
  identificationRequired: boolean;
  flavor: string;
};

export type LaneEncounter = {
  id: string;
  title: string;
  objective: string;
  contactCategory: ContactCategory;
  contactNation?: string;
  hostile: boolean;
  engagementAuthorized: false;
  roe: "identify_before_engage";
};

export type LaneTrafficPicture = {
  laneId: string;
  traffic: LaneTrafficSpawn[];
  encounters: LaneEncounter[];
};

const regionFishingFlavor: Record<TheaterLane["region"], string> = {
  north_atlantic: "sturdy North Sea trawler",
  north_pacific: "small coastal longliner",
  indian_ocean: "wooden outrigger fishing boat",
  persian_gulf: "fast coastal dhow",
  south_china_sea: "wooden outrigger fishing boat",
};

const regionCruiseFlavor: Record<TheaterLane["region"], string> = {
  north_atlantic: "Northern European passenger liner",
  north_pacific: "Japanese coastal cruise ship",
  indian_ocean: "Indian Ocean resort cruise ship",
  persian_gulf: "Gulf passenger ferry",
  south_china_sea: "regional island cruise ship",
};

function stableRoll(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function coastalFishingNation(lane: TheaterLane): string {
  if (lane.region === "north_atlantic" && lane.countryIds.includes("norway"))
    return "norway";
  return lane.countryIds[0] ?? "coastal";
}

export function composeLaneTraffic(
  lane: TheaterLane,
  routeRisk: number,
  playerCountryId: string,
): LaneTrafficPicture {
  const risk = Math.max(0, Math.min(1, routeRisk));
  const traffic: LaneTrafficSpawn[] = [];
  if (lane.kind === "air") {
    const airCount =
      risk >= 0.65
        ? 0
        : Math.max(1, Math.round(lane.dailyCapacity * (1 - risk)));
    if (airCount > 0) {
      traffic.push({
        id: `${lane.id}-civil-air`,
        kind: "civilian_air",
        domain: "air",
        category: "civilian_aircraft",
        nationality: lane.countryIds[0] ?? "regional",
        expectedDailyCount: airCount,
        disposition: "neutral",
        identificationRequired: true,
        flavor:
          "Scheduled civilian air traffic remains present outside declared conflict airspace.",
      });
    }
  } else {
    const merchantCount = Math.max(
      1,
      Math.round((lane.dailyCapacity / 15) * (1 - risk * 0.7)),
    );
    traffic.push({
      id: `${lane.id}-merchant`,
      kind: "merchant",
      domain: "surface",
      category: "merchant_vessel",
      nationality: lane.countryIds[0] ?? "regional",
      expectedDailyCount: merchantCount,
      disposition: "friendly",
      identificationRequired: true,
      flavor: `Merchant traffic carrying ${lane.commodity} remains on the route.`,
    });
    if (lane.coastal) {
      traffic.push({
        id: `${lane.id}-fishing`,
        kind: "fishing",
        domain: "surface",
        category: "fishing_vessel",
        nationality: coastalFishingNation(lane),
        expectedDailyCount: Math.max(2, Math.round(12 * (1 - risk))),
        disposition: "neutral",
        identificationRequired: true,
        flavor: regionFishingFlavor[lane.region],
      });
    }
    if (lane.commodity === "passengers" || stableRoll(lane.id) > 0.35) {
      traffic.push({
        id: `${lane.id}-cruise`,
        kind: "cruise",
        domain: "surface",
        category: "merchant_vessel",
        nationality: lane.countryIds[1] ?? lane.countryIds[0] ?? "regional",
        expectedDailyCount: risk >= 0.6 ? 0 : 1,
        disposition: "neutral",
        identificationRequired: true,
        flavor: regionCruiseFlavor[lane.region],
      });
    }
    if (lane.region === "north_atlantic" && risk < 0.65) {
      traffic.push({
        id: `${lane.id}-civil-air`,
        kind: "civilian_air",
        domain: "air",
        category: "civilian_aircraft",
        nationality: lane.countryIds[0] ?? "norway",
        expectedDailyCount: 2,
        disposition: "neutral",
        identificationRequired: true,
        flavor: "Scheduled civilian airliner crossing the patrol sector.",
      });
    }
  }
  const encounters: LaneEncounter[] = [];
  if (risk >= 0.35 && lane.kind === "shipping") {
    encounters.push({
      id: `${lane.id}-military-contact`,
      title: "Investigate military contact near the lane",
      objective: "Classify the contact without firing on neutral shipping.",
      contactCategory: risk >= 0.65 ? "naval_combatant" : "auxiliary",
      ...(playerCountryId === "norway"
        ? { contactNation: "soviet-union" }
        : {}),
      hostile: true,
      engagementAuthorized: false,
      roe: "identify_before_engage",
    });
  }
  return { laneId: lane.id, traffic, encounters };
}
