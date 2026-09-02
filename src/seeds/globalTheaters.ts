export type Era = "1975" | "1983" | "1989";
export type PoliticalPosture =
  "allied" | "aligned" | "non-aligned" | "belligerent" | "conditional";
export type TheaterActor = {
  id: string;
  name: string;
  posture: Record<Era, PoliticalPosture>;
  playableFrom: Era[];
  commandScope: string;
};
export type StrategicRoute = {
  id: string;
  from: string;
  to: string;
  purpose: "reinforcement" | "oil" | "trade" | "military-transit";
  transitHours: number;
  accessRisk: "low" | "contested" | "conditional";
};
export type ForcePackage = {
  actorId: string;
  era: Era;
  packageName: string;
  readiness: "high" | "medium" | "limited";
  composition: string[];
  deploymentConstraint: string;
};

export type TheaterBriefing = {
  label: string;
  startDate: string;
  summary: string;
  situation: string;
  commandGuidance: string;
  capabilities: string[];
};

export type GlobalStrategicSite = {
  id: string;
  theaterId: string;
  countryId: string;
  name: string;
  kind:
    | "naval_base"
    | "air_base"
    | "factory"
    | "port"
    | "industrial_site"
    | "resource_site"
    | "fuel_terminal"
    | "aa_site"
    | "city_region";
  latitude: number;
  longitude: number;
  output: string;
  revenuePerDay?: number;
  researchPerDay?: number;
  defenseRating?: number;
};

export const globalTheaters = [
  {
    id: "north-pacific",
    name: "North Pacific",
    summary:
      "Pacific Fleet projection, Soviet Far East, Japanese sea-lane defense, and Chinese regional operations.",
    actors: [
      {
        id: "united-states",
        name: "United States",
        posture: { "1975": "allied", "1983": "allied", "1989": "allied" },
        playableFrom: ["1975", "1983", "1989"],
        commandScope: "Pacific Fleet and trans-oceanic reinforcement",
      },
      {
        id: "japan",
        name: "Japan",
        posture: { "1975": "allied", "1983": "allied", "1989": "allied" },
        playableFrom: ["1975", "1983", "1989"],
        commandScope: "Maritime self-defense and sea-lane protection",
      },
      {
        id: "australia",
        name: "Australia",
        posture: { "1975": "allied", "1983": "allied", "1989": "allied" },
        playableFrom: ["1975", "1983", "1989"],
        commandScope: "Indian and Pacific Ocean coalition support",
      },
      {
        id: "soviet-union",
        name: "Soviet Union",
        posture: { "1975": "aligned", "1983": "aligned", "1989": "aligned" },
        playableFrom: ["1975", "1983", "1989"],
        commandScope: "Pacific Fleet and Far Eastern bastions",
      },
      {
        id: "china",
        name: "People's Republic of China",
        posture: {
          "1975": "conditional",
          "1983": "conditional",
          "1989": "conditional",
        },
        playableFrom: [],
        commandScope: "Regional coastal defense and conditional diplomacy",
      },
    ] satisfies TheaterActor[],
  },
  {
    id: "persian-gulf",
    name: "Persian Gulf",
    summary:
      "Oil transit, the Iran-Iraq conflict, external intervention, and fragile Gulf access.",
    actors: [
      {
        id: "iran",
        name: "Iran",
        posture: {
          "1975": "aligned",
          "1983": "belligerent",
          "1989": "conditional",
        },
        playableFrom: ["1975", "1983", "1989"],
        commandScope: "Gulf territorial defense and sea-denial",
      },
      {
        id: "iraq",
        name: "Iraq",
        posture: {
          "1975": "aligned",
          "1983": "belligerent",
          "1989": "conditional",
        },
        playableFrom: ["1975", "1983", "1989"],
        commandScope: "Northern Gulf operations and wartime logistics",
      },
      {
        id: "united-states",
        name: "United States",
        posture: { "1975": "aligned", "1983": "conditional", "1989": "allied" },
        playableFrom: ["1983", "1989"],
        commandScope: "Freedom of navigation and coalition reinforcement",
      },
    ] satisfies TheaterActor[],
  },
  {
    id: "indian-ocean",
    name: "Indian Ocean",
    summary:
      "South Asian rivalry, Arabian Sea access, and the routes linking the Pacific with the Gulf.",
    actors: [
      {
        id: "india",
        name: "India",
        posture: {
          "1975": "aligned",
          "1983": "non-aligned",
          "1989": "non-aligned",
        },
        playableFrom: ["1975", "1983", "1989"],
        commandScope: "Indian Ocean sea control and regional deterrence",
      },
      {
        id: "pakistan",
        name: "Pakistan",
        posture: { "1975": "conditional", "1983": "allied", "1989": "allied" },
        playableFrom: ["1975", "1983", "1989"],
        commandScope: "Arabian Sea defense and regional access",
      },
      {
        id: "australia",
        name: "Australia",
        posture: { "1975": "allied", "1983": "allied", "1989": "allied" },
        playableFrom: ["1975", "1983", "1989"],
        commandScope: "Indian Ocean coalition support",
      },
    ] satisfies TheaterActor[],
  },
] as const;

export const globalStrategicRoutes: StrategicRoute[] = [
  {
    id: "pacific-to-indian",
    from: "Pearl Harbor",
    to: "Fremantle",
    purpose: "reinforcement",
    transitHours: 216,
    accessRisk: "low",
  },
  {
    id: "indian-to-gulf",
    from: "Fremantle",
    to: "Muscat",
    purpose: "military-transit",
    transitHours: 168,
    accessRisk: "conditional",
  },
  {
    id: "gulf-oil-route",
    from: "Hormuz",
    to: "Arabian Sea",
    purpose: "oil",
    transitHours: 18,
    accessRisk: "contested",
  },
  {
    id: "japan-sea-lanes",
    from: "Yokosuka",
    to: "Guam",
    purpose: "trade",
    transitHours: 84,
    accessRisk: "contested",
  },
];

export const initialForcePackages: ForcePackage[] = [
  {
    actorId: "japan",
    era: "1975",
    packageName: "JMSDF Home Waters",
    readiness: "high",
    composition: [
      "destroyer escorts",
      "diesel submarines",
      "maritime patrol aircraft",
    ],
    deploymentConstraint:
      "Self-defense mandate and national political approval",
  },
  {
    actorId: "australia",
    era: "1983",
    packageName: "RAN Indian Ocean Group",
    readiness: "medium",
    composition: [
      "surface combatants",
      "submarines",
      "maritime patrol aircraft",
    ],
    deploymentConstraint: "Alliance consultation and transit time",
  },
  {
    actorId: "iran",
    era: "1975",
    packageName: "Imperial Iranian Navy",
    readiness: "high",
    composition: ["frigates", "fast attack craft", "maritime patrol aircraft"],
    deploymentConstraint: "Shah-era political alignment",
  },
  {
    actorId: "iran",
    era: "1983",
    packageName: "Wartime Iranian Gulf Forces",
    readiness: "limited",
    composition: [
      "surviving surface combatants",
      "fast attack craft",
      "coastal defense",
    ],
    deploymentConstraint: "Iran-Iraq War attrition",
  },
  {
    actorId: "iraq",
    era: "1983",
    packageName: "Iraqi Gulf Forces",
    readiness: "limited",
    composition: [
      "missile craft",
      "coastal aviation",
      "merchant denial assets",
    ],
    deploymentConstraint: "Restricted Gulf access",
  },
  {
    actorId: "india",
    era: "1983",
    packageName: "Indian Ocean Fleet",
    readiness: "medium",
    composition: [
      "surface combatants",
      "submarines",
      "maritime patrol aircraft",
    ],
    deploymentConstraint: "Non-aligned political posture",
  },
  {
    actorId: "pakistan",
    era: "1983",
    packageName: "Pakistan Navy Arabian Sea",
    readiness: "medium",
    composition: ["submarines", "frigates", "maritime patrol aircraft"],
    deploymentConstraint: "Afghanistan-era alliance dependence",
  },
  {
    actorId: "china",
    era: "1983",
    packageName: "PLAN Luda Regional Force",
    readiness: "limited",
    composition: [
      "Type 051/Luda destroyers",
      "Fuqing replenishment ships",
      "coastal submarines",
    ],
    deploymentConstraint: "Regional mission and limited blue-water sustainment",
  },
];

export const globalTheaterBriefings: Record<
  string,
  Record<Era, TheaterBriefing>
> = {
  "north-pacific": {
    "1975": {
      label: "1975: Forward Defense",
      startDate: "1975-07-01T06:00:00Z",
      summary:
        "A post-Vietnam Pacific faces Soviet naval pressure, Japanese sea-lane concerns, and a cautious Chinese regional posture.",
      situation:
        "The United States is rebuilding forward credibility while Japan carries the burden of home-water defense. Soviet bastions in the Kurils and Kamchatka shape every movement.",
      commandGuidance:
        "Keep reinforcement routes open, protect maritime trade, and avoid forcing China into the Soviet camp.",
      capabilities: [
        "Early-warning gaps",
        "Diesel submarine threat",
        "Limited precision strike",
      ],
    },
    "1983": {
      label: "1983: Maritime Balance",
      startDate: "1983-07-01T06:00:00Z",
      summary:
        "Carrier aviation, long-range patrol aircraft, and Soviet Pacific Fleet sorties turn the North Pacific into a contested reinforcement theater.",
      situation:
        "The Korean peninsula, Japanese home islands, and Soviet Far East are linked by a fragile chain of bases and shipping lanes. A local incident can trigger alliance escalation.",
      commandGuidance:
        "Build a layered screen around the home islands and preserve a route for allied carrier and logistics forces.",
      capabilities: [
        "Mature anti-ship missiles",
        "Improved maritime patrol",
        "Carrier task-group operations",
      ],
    },
    "1989": {
      label: "1989: Endgame Pacific",
      startDate: "1989-07-01T06:00:00Z",
      summary:
        "Late Cold War surveillance and precision weapons meet Soviet retrenchment, Japanese economic reach, and China's growing independence.",
      situation:
        "The Soviet Pacific Fleet remains dangerous but politically constrained. Access, intelligence, and escalation management matter as much as fleet size.",
      commandGuidance:
        "Exploit information advantage without overcommitting scarce high-value units or closing diplomatic channels.",
      capabilities: [
        "Satellite-supported intelligence",
        "Long-range precision strike",
        "More capable air defense",
      ],
    },
  },
  "persian-gulf": {
    "1975": {
      label: "1975: Gulf Security",
      startDate: "1975-07-01T06:00:00Z",
      summary:
        "The Shah's Iran is the principal regional naval power while oil exports and external guarantees keep the Gulf open.",
      situation:
        "Iran can patrol the Gulf but depends on secure ports and imported technology. Iraq contests the northern approaches and outside powers monitor the Strait of Hormuz.",
      commandGuidance:
        "Protect energy infrastructure and shipping without creating a crisis that closes Hormuz.",
      capabilities: [
        "Fast attack craft",
        "Imported frigates",
        "Constrained external access",
      ],
    },
    "1983": {
      label: "1983: Tanker War",
      startDate: "1983-07-01T06:00:00Z",
      summary:
        "The Iran-Iraq War turns the Gulf into a mine, missile, and convoy problem with global economic consequences.",
      situation:
        "Both belligerents are absorbing attrition while neutral shipping becomes the strategic center of gravity. External escorts can stabilize routes but invite escalation.",
      commandGuidance:
        "Preserve port access, control the mine threat, and make every strike support the political objective.",
      capabilities: [
        "Missile-boat warfare",
        "Mines and coastal denial",
        "Convoy protection",
      ],
    },
    "1989": {
      label: "1989: Reopened Gulf",
      startDate: "1989-07-01T06:00:00Z",
      summary:
        "After the Iran-Iraq War, damaged infrastructure and uncertain alignments leave the Gulf open but unstable.",
      situation:
        "Repair capacity and political influence are decisive. A small number of capable ships can shape access if backed by intelligence and reliable logistics.",
      commandGuidance:
        "Rebuild the maritime network first, then use measured pressure to secure the energy corridor.",
      capabilities: [
        "Expeditionary escort",
        "Port repair under threat",
        "Regional intelligence",
      ],
    },
  },
  "indian-ocean": {
    "1975": {
      label: "1975: Regional Balance",
      startDate: "1975-07-01T06:00:00Z",
      summary:
        "India and Pakistan compete for Arabian Sea access while Diego Garcia and distant naval powers provide strategic depth.",
      situation:
        "The region is politically non-aligned but not insulated from superpower competition. Fuel, repair, and distance make logistics a strategic weapon.",
      commandGuidance:
        "Secure the nearest ports and preserve freedom to shift forces between the Arabian Sea and Bay of Bengal.",
      capabilities: [
        "Long transit distances",
        "Limited regional surveillance",
        "Port-dependent operations",
      ],
    },
    "1983": {
      label: "1983: Arabian Sea Pressure",
      startDate: "1983-07-01T06:00:00Z",
      summary:
        "The Afghan war, superpower access, and South Asian rivalry pull the Indian Ocean into the wider Cold War.",
      situation:
        "Pakistan benefits from external support while India guards its autonomy. Sea lanes from the Gulf to Southeast Asia are vulnerable to disruption and political coercion.",
      commandGuidance:
        "Protect sustainment routes and use patrol presence to shape access before committing to combat.",
      capabilities: [
        "Submarine deterrence",
        "Maritime patrol",
        "Coalition access politics",
      ],
    },
    "1989": {
      label: "1989: Littoral Reckoning",
      startDate: "1989-07-01T06:00:00Z",
      summary:
        "Regional navies expand their reach as Soviet influence recedes and unresolved South Asian disputes remain.",
      situation:
        "A dispersed force can dominate the theater only with dependable replenishment and repair. Intelligence on ports and shipping is more valuable than a single dramatic sortie.",
      commandGuidance:
        "Invest in readiness and access, then concentrate force only where the political payoff is clear.",
      capabilities: [
        "Long-range patrol",
        "Improved fleet air defense",
        "Distributed logistics",
      ],
    },
  },
};

export const globalStrategicSites: GlobalStrategicSite[] = [
  {
    id: "yokosuka",
    theaterId: "north-pacific",
    countryId: "japan",
    name: "Yokosuka Naval Base",
    kind: "naval_base",
    latitude: 35.29,
    longitude: 139.67,
    output: "Fleet support and repair",
  },
  {
    id: "sasebo",
    theaterId: "north-pacific",
    countryId: "japan",
    name: "Sasebo Naval Base",
    kind: "naval_base",
    latitude: 33.16,
    longitude: 129.72,
    output: "Western Pacific logistics",
  },
  {
    id: "misawa",
    theaterId: "north-pacific",
    countryId: "japan",
    name: "Misawa Air Base",
    kind: "air_base",
    latitude: 40.7,
    longitude: 141.37,
    output: "Maritime patrol and air defense",
  },
  {
    id: "pearl-harbor",
    theaterId: "north-pacific",
    countryId: "united-states",
    name: "Pearl Harbor",
    kind: "naval_base",
    latitude: 21.31,
    longitude: -157.86,
    output: "Pacific Fleet concentration",
  },
  {
    id: "guam",
    theaterId: "north-pacific",
    countryId: "united-states",
    name: "Apra Harbor",
    kind: "port",
    latitude: 13.44,
    longitude: 144.65,
    output: "Forward staging and replenishment",
  },
  {
    id: "yelizovo",
    theaterId: "north-pacific",
    countryId: "soviet-union",
    name: "Petropavlovsk-Kamchatsky",
    kind: "naval_base",
    latitude: 53.05,
    longitude: 158.65,
    output: "Pacific bastion support",
  },
  {
    id: "vladivostok",
    theaterId: "north-pacific",
    countryId: "soviet-union",
    name: "Vladivostok Naval Base",
    kind: "naval_base",
    latitude: 43.12,
    longitude: 131.9,
    output: "Fleet repair and sortie base",
  },
  {
    id: "qingdao",
    theaterId: "north-pacific",
    countryId: "china",
    name: "Qingdao Naval Base",
    kind: "naval_base",
    latitude: 36.07,
    longitude: 120.38,
    output: "PLAN North Sea Fleet support",
  },
  {
    id: "darwin",
    theaterId: "north-pacific",
    countryId: "australia",
    name: "Darwin Naval Support",
    kind: "port",
    latitude: -12.46,
    longitude: 130.84,
    output: "Northern approaches staging",
  },
  {
    id: "stirling",
    theaterId: "north-pacific",
    countryId: "australia",
    name: "HMAS Stirling",
    kind: "naval_base",
    latitude: -32.23,
    longitude: 115.69,
    output: "Submarine support and repair",
  },
  {
    id: "bandar-abbas",
    theaterId: "persian-gulf",
    countryId: "iran",
    name: "Bandar Abbas",
    kind: "naval_base",
    latitude: 27.18,
    longitude: 56.28,
    output: "Strait of Hormuz control",
  },
  {
    id: "kharg",
    theaterId: "persian-gulf",
    countryId: "iran",
    name: "Kharg Island Oil Terminal",
    kind: "port",
    latitude: 29.23,
    longitude: 50.32,
    output: "Oil export and strategic target",
  },
  {
    id: "basra",
    theaterId: "persian-gulf",
    countryId: "iraq",
    name: "Basra Port",
    kind: "port",
    latitude: 30.51,
    longitude: 47.81,
    output: "Northern Gulf logistics",
  },
  {
    id: "um-qasr",
    theaterId: "persian-gulf",
    countryId: "iraq",
    name: "Umm Qasr",
    kind: "naval_base",
    latitude: 29.9,
    longitude: 48.57,
    output: "Coastal defense and resupply",
  },
  {
    id: "bahrain",
    theaterId: "persian-gulf",
    countryId: "united-states",
    name: "Bahrain Support Facility",
    kind: "port",
    latitude: 26.23,
    longitude: 50.59,
    output: "Coalition escort and replenishment",
  },
  {
    id: "diego-garcia",
    theaterId: "indian-ocean",
    countryId: "australia",
    name: "Diego Garcia Support Hub",
    kind: "port",
    latitude: -7.32,
    longitude: 72.42,
    output: "Long-range logistics access",
  },
  {
    id: "mumbai",
    theaterId: "indian-ocean",
    countryId: "india",
    name: "Mumbai Naval Dockyard",
    kind: "naval_base",
    latitude: 18.92,
    longitude: 72.83,
    output: "Western Fleet repair and command",
  },
  {
    id: "visakhapatnam",
    theaterId: "indian-ocean",
    countryId: "india",
    name: "Visakhapatnam Naval Base",
    kind: "naval_base",
    latitude: 17.69,
    longitude: 83.22,
    output: "Eastern Fleet support",
  },
  {
    id: "karachi",
    theaterId: "indian-ocean",
    countryId: "pakistan",
    name: "Karachi Naval Base",
    kind: "naval_base",
    latitude: 24.84,
    longitude: 66.99,
    output: "Arabian Sea fleet support",
  },
  {
    id: "ormara",
    theaterId: "indian-ocean",
    countryId: "pakistan",
    name: "Ormara Naval Base",
    kind: "naval_base",
    latitude: 25.21,
    longitude: 64.64,
    output: "Forward Arabian Sea access",
  },
  {
    id: "yokohama-industry",
    theaterId: "north-pacific",
    countryId: "japan",
    name: "Yokohama Industrial Region",
    kind: "industrial_site",
    latitude: 35.44,
    longitude: 139.64,
    output: "Industrial income and ship systems research",
    revenuePerDay: 18,
    researchPerDay: 7,
    defenseRating: 3,
  },
  {
    id: "chiba-fuel",
    theaterId: "north-pacific",
    countryId: "japan",
    name: "Chiba Coastal Fuel Terminal",
    kind: "fuel_terminal",
    latitude: 35.57,
    longitude: 140.13,
    output: "Fuel income and fleet sustainment",
    revenuePerDay: 12,
    defenseRating: 2,
  },
  {
    id: "yokosuka-aa",
    theaterId: "north-pacific",
    countryId: "japan",
    name: "Yokosuka Air Defense Ring",
    kind: "aa_site",
    latitude: 35.29,
    longitude: 139.67,
    output: "Point defense for fleet headquarters",
    defenseRating: 5,
  },
  {
    id: "pearl-industrial",
    theaterId: "north-pacific",
    countryId: "united-states",
    name: "Hawaii Strategic Region",
    kind: "city_region",
    latitude: 21.31,
    longitude: -157.86,
    output: "Pacific income, research, and staging",
    revenuePerDay: 20,
    researchPerDay: 8,
    defenseRating: 5,
  },
  {
    id: "vladivostok-industry",
    theaterId: "north-pacific",
    countryId: "soviet-union",
    name: "Vladivostok Industrial Region",
    kind: "industrial_site",
    latitude: 43.12,
    longitude: 131.9,
    output: "Pacific Fleet production and regional income",
    revenuePerDay: 15,
    researchPerDay: 4,
    defenseRating: 4,
  },
  {
    id: "qingdao-industry",
    theaterId: "north-pacific",
    countryId: "china",
    name: "Qingdao Industrial Region",
    kind: "industrial_site",
    latitude: 36.07,
    longitude: 120.38,
    output: "Naval construction and industrial income",
    revenuePerDay: 13,
    researchPerDay: 4,
    defenseRating: 3,
  },
  {
    id: "abadan-refinery",
    theaterId: "persian-gulf",
    countryId: "iran",
    name: "Abadan Refinery",
    kind: "fuel_terminal",
    latitude: 30.34,
    longitude: 48.29,
    output: "Refined fuel and oil revenue",
    revenuePerDay: 20,
    defenseRating: 3,
  },
  {
    id: "bandar-aa",
    theaterId: "persian-gulf",
    countryId: "iran",
    name: "Bandar Abbas Air Defense",
    kind: "aa_site",
    latitude: 27.18,
    longitude: 56.28,
    output: "Hormuz and naval base air defense",
    defenseRating: 4,
  },
  {
    id: "basra-refinery",
    theaterId: "persian-gulf",
    countryId: "iraq",
    name: "Basra Refinery Region",
    kind: "industrial_site",
    latitude: 30.5,
    longitude: 47.82,
    output: "Oil revenue and wartime logistics",
    revenuePerDay: 18,
    researchPerDay: 2,
    defenseRating: 3,
  },
  {
    id: "kirkuk-resource",
    theaterId: "persian-gulf",
    countryId: "iraq",
    name: "Kirkuk Oil Region",
    kind: "resource_site",
    latitude: 35.47,
    longitude: 44.39,
    output: "Crude oil production",
    revenuePerDay: 22,
    defenseRating: 2,
  },
  {
    id: "mumbai-industry",
    theaterId: "indian-ocean",
    countryId: "india",
    name: "Mumbai Industrial Region",
    kind: "industrial_site",
    latitude: 19.08,
    longitude: 72.88,
    output: "Industrial income and naval research",
    revenuePerDay: 17,
    researchPerDay: 6,
    defenseRating: 3,
  },
  {
    id: "bombay-high",
    theaterId: "indian-ocean",
    countryId: "india",
    name: "Bombay High Offshore Fields",
    kind: "resource_site",
    latitude: 19.5,
    longitude: 71.5,
    output: "Offshore oil production",
    revenuePerDay: 18,
    defenseRating: 2,
  },
  {
    id: "mumbai-aa",
    theaterId: "indian-ocean",
    countryId: "india",
    name: "Mumbai Air Defense Network",
    kind: "aa_site",
    latitude: 18.92,
    longitude: 72.83,
    output: "Protection for dockyard and industry",
    defenseRating: 4,
  },
  {
    id: "karachi-industry",
    theaterId: "indian-ocean",
    countryId: "pakistan",
    name: "Karachi Industrial Region",
    kind: "industrial_site",
    latitude: 24.86,
    longitude: 67.01,
    output: "Industrial income and fleet maintenance",
    revenuePerDay: 15,
    researchPerDay: 4,
    defenseRating: 3,
  },
  {
    id: "karachi-fuel",
    theaterId: "indian-ocean",
    countryId: "pakistan",
    name: "Karachi Fuel Terminal",
    kind: "fuel_terminal",
    latitude: 24.83,
    longitude: 66.98,
    output: "Fuel storage and maritime sustainment",
    revenuePerDay: 10,
    defenseRating: 2,
  },
];
