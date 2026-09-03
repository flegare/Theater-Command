export type ScenarioVariant = {
  id: "nf-1975" | "nf-1983" | "nf-1989";
  label: string;
  startDate: string;
  summary: string;
  situation?: string;
  commandGuidance?: string;
  capabilities: string[];
};

export type ScenarioCountry = {
  id:
    | "norway"
    | "united-kingdom"
    | "united-states"
    | "soviet-union"
    | "china"
    | "sweden"
    | "finland"
    | "denmark"
    | "west-germany"
    | "iceland";
  name: string;
  coalitionId: "nato" | "warsaw-pact" | "non-aligned";
  commandScope: string;
  objectives: string[];
  playable?: boolean;
};

export type StrategicSite = {
  id: string;
  countryId: ScenarioCountry["id"];
  name: string;
  kind:
    | "naval_base"
    | "air_base"
    | "factory"
    | "port"
    | "industrial_site"
    | "resource_site"
    | "fuel_terminal"
    | "training_range"
    | "aa_site"
    | "city_region";
  latitude: number;
  longitude: number;
  output: string;
  revenuePerDay?: number;
  researchPerDay?: number;
  defenseRating?: number;
};

export const northernFlank = {
  id: "northern-flank",
  name: "Northern Flank",
  summary:
    "A Cold War contest for the Norwegian Sea, Arctic approaches, and NATO reinforcement routes.",
  variants: [
    {
      id: "nf-1975",
      label: "1975: Opening Watch",
      startDate: "1975-09-15T06:00:00Z",
      summary: "Early Soviet blue-water pressure meets a thinner NATO screen.",
      situation:
        "Soviet Northern Fleet patrols and submarine deployments threaten the reinforcement corridor while Norway relies on dispersed coastal infrastructure.",
      commandGuidance:
        "Keep the Norwegian Sea open and preserve early warning before committing scarce surface forces.",
      capabilities: ["Early warning gaps", "Limited precision strike"],
    },
    {
      id: "nf-1983",
      label: "1983: Able Archer",
      startDate: "1983-11-05T06:00:00Z",
      summary:
        "A crisis escalation tests maritime reinforcement and political resolve.",
      situation:
        "The 1983 crisis places NATO reinforcement routes, Norwegian bases, and Soviet bastions under simultaneous pressure.",
      commandGuidance:
        "Layer patrols and air defense around the reinforcement route; avoid an incident that outruns political control.",
      capabilities: ["Mature submarines", "Improved NATO maritime patrol"],
    },
    {
      id: "nf-1989",
      label: "1989: Fractured Ice",
      startDate: "1989-07-01T06:00:00Z",
      summary:
        "Advanced weapons face political uncertainty across a changing Europe.",
      situation:
        "Soviet capability remains credible as alliance cohesion becomes less certain and intelligence quality improves.",
      commandGuidance:
        "Use information advantage to concentrate force without assuming political access will remain stable.",
      capabilities: [
        "Late Cold War missiles",
        "Satellite-supported intelligence",
      ],
    },
  ] satisfies ScenarioVariant[],
  countries: [
    {
      id: "norway",
      name: "Norway",
      coalitionId: "nato",
      commandScope:
        "Coastal defense, Norwegian Sea surveillance, and allied access.",
      objectives: [
        "Keep sea approaches open",
        "Protect air and naval bases",
        "Maintain national sovereignty",
      ],
    },
    {
      id: "united-kingdom",
      name: "United Kingdom",
      coalitionId: "nato",
      commandScope: "North Atlantic task groups and reinforcement support.",
      objectives: [
        "Secure reinforcement routes",
        "Protect allied task groups",
        "Deter Soviet sortie operations",
      ],
    },
    {
      id: "united-states",
      name: "United States",
      coalitionId: "nato",
      commandScope:
        "Carrier forces, strategic reinforcement, and alliance coordination.",
      objectives: [
        "Sustain transatlantic lift",
        "Preserve sea control",
        "Support NATO allies",
      ],
    },
    {
      id: "soviet-union",
      name: "Soviet Union",
      coalitionId: "warsaw-pact",
      commandScope: "Northern Fleet operations and Atlantic disruption.",
      objectives: [
        "Threaten NATO sea lines",
        "Protect northern bastions",
        "Split allied political resolve",
      ],
    },
    {
      id: "china",
      name: "People's Republic of China",
      coalitionId: "non-aligned",
      commandScope:
        "Regional maritime defense and a limited, politically conditional Pacific presence.",
      objectives: [
        "Protect coastal approaches",
        "Preserve strategic autonomy",
        "Avoid direct superpower entanglement",
      ],
      playable: false,
    },
    {
      id: "sweden",
      name: "Sweden",
      coalitionId: "non-aligned",
      commandScope: "Armed neutrality and Baltic coastal surveillance.",
      objectives: [
        "Preserve territorial integrity",
        "Monitor Baltic approaches",
        "Keep the conflict away from Swedish waters",
      ],
      playable: false,
    },
    {
      id: "finland",
      name: "Republic of Finland",
      coalitionId: "non-aligned",
      commandScope:
        "Nordic armed neutrality, Paasikivi-Kekkonen line defense, and territorial surveillance.",
      objectives: [
        "Preserve neutral sovereignty",
        "Deter border escalation",
        "Maintain regional stability",
      ],
      playable: false,
    },
    {
      id: "denmark",
      name: "Kingdom of Denmark",
      coalitionId: "nato",
      commandScope:
        "Danish Straits defense, Baltic approach monitoring, and NATO allied coordination.",
      objectives: [
        "Control Danish Straits",
        "Deny Baltic exits to adversary",
        "Support allied reinforcements",
      ],
      playable: false,
    },
    {
      id: "west-germany",
      name: "Federal Republic of Germany",
      coalitionId: "nato",
      commandScope:
        "Bundesmarine Baltic operations, North Sea escort, and naval air patrol.",
      objectives: [
        "Secure southern Baltic flank",
        "Protect North Sea approaches",
        "Coordinate allied naval defense",
      ],
      playable: false,
    },
    {
      id: "iceland",
      name: "Republic of Iceland",
      coalitionId: "nato",
      commandScope:
        "GIUK Gap surveillance, Keflavík radar network, and allied maritime tracking.",
      objectives: [
        "Monitor GIUK Gap chokepoint",
        "Facilitate allied maritime patrol aircraft",
        "Preserve island sovereignty",
      ],
      playable: false,
    },
  ] satisfies ScenarioCountry[],
  coalitions: [
    { id: "nato", name: "NATO", side: "NATO" },
    { id: "warsaw-pact", name: "Warsaw Pact", side: "Warsaw Pact" },
    { id: "non-aligned", name: "Non-Aligned", side: "Non-Aligned" },
  ],
  strategicSites: [
    {
      id: "bergen-naval",
      countryId: "norway",
      name: "Bergen Naval Base",
      kind: "naval_base",
      latitude: 60.39,
      longitude: 5.32,
      output: "Repair and coastal logistics",
    },
    {
      id: "bodo-air",
      countryId: "norway",
      name: "Bodo Air Station",
      kind: "air_base",
      latitude: 67.27,
      longitude: 14.36,
      output: "Maritime patrol readiness",
    },
    {
      id: "kongsberg",
      countryId: "norway",
      name: "Kongsberg Works",
      kind: "factory",
      latitude: 59.67,
      longitude: 9.65,
      output: "Guided weapons production",
      revenuePerDay: 8,
      researchPerDay: 4,
      defenseRating: 2,
    },
    {
      id: "oslo-region",
      countryId: "norway",
      name: "Oslo Industrial Region",
      kind: "city_region",
      latitude: 59.91,
      longitude: 10.75,
      output: "National income, research, and mobilization",
      revenuePerDay: 14,
      researchPerDay: 3,
      defenseRating: 2,
    },
    {
      id: "bergen-aa",
      countryId: "norway",
      name: "Bergen Coastal Air Defense",
      kind: "aa_site",
      latitude: 60.39,
      longitude: 5.32,
      output: "Point defense for fleet support and port facilities",
      defenseRating: 4,
    },
    {
      id: "bergen-airport",
      countryId: "norway",
      name: "Bergen Flesland Airport",
      kind: "air_base",
      latitude: 60.2934,
      longitude: 5.2181,
      output: "Regional airlift and maritime patrol staging",
      defenseRating: 2,
    },
    {
      id: "bergen-port",
      countryId: "norway",
      name: "Port of Bergen",
      kind: "port",
      latitude: 60.3929,
      longitude: 5.3231,
      output: "Commercial throughput and convoy loading",
      revenuePerDay: 12,
      defenseRating: 2,
    },
    {
      id: "mongstad-refinery",
      countryId: "norway",
      name: "Mongstad Refinery",
      kind: "fuel_terminal",
      latitude: 60.8102,
      longitude: 5.0319,
      output: "Refined fuel production and fleet bunkering",
      revenuePerDay: 24,
      defenseRating: 3,
    },
    {
      id: "troll-a-platform",
      countryId: "norway",
      name: "Troll A Oil Platform",
      kind: "resource_site",
      latitude: 60.645,
      longitude: 3.724,
      output: "Offshore petroleum extraction",
      revenuePerDay: 20,
      defenseRating: 1,
    },
    {
      id: "vaddo-skjutfalt",
      countryId: "sweden",
      name: "Väddö skjutfält",
      kind: "training_range",
      latitude: 59.9667,
      longitude: 18.9,
      output: "Swedish coastal-defense firing range and exercise area",
      defenseRating: 2,
    },
    {
      id: "faslane",
      countryId: "united-kingdom",
      name: "Faslane Naval Base",
      kind: "naval_base",
      latitude: 56.07,
      longitude: -4.82,
      output: "Submarine support",
    },
    {
      id: "lossiemouth",
      countryId: "united-kingdom",
      name: "RAF Lossiemouth",
      kind: "air_base",
      latitude: 57.71,
      longitude: -3.34,
      output: "Maritime strike readiness",
    },
    {
      id: "rosyth",
      countryId: "united-kingdom",
      name: "Rosyth Dockyard",
      kind: "factory",
      latitude: 56.02,
      longitude: -3.45,
      output: "Major ship repair",
    },
    {
      id: "keflavik",
      countryId: "united-states",
      name: "Keflavik Air Station",
      kind: "air_base",
      latitude: 63.99,
      longitude: -22.61,
      output: "Atlantic surveillance",
    },
    {
      id: "norfolk",
      countryId: "united-states",
      name: "Norfolk Naval Station",
      kind: "naval_base",
      latitude: 36.94,
      longitude: -76.33,
      output: "Task force assembly",
    },
    {
      id: "newport-news",
      countryId: "united-states",
      name: "Newport News Shipbuilding",
      kind: "factory",
      latitude: 36.98,
      longitude: -76.43,
      output: "Capital ship construction",
    },
    {
      id: "san-diego",
      countryId: "united-states",
      name: "Naval Base San Diego",
      kind: "naval_base",
      latitude: 32.72,
      longitude: -117.17,
      output: "Pacific Fleet surface-force generation",
    },
    {
      id: "pearl-harbor",
      countryId: "united-states",
      name: "Pearl Harbor",
      kind: "naval_base",
      latitude: 21.31,
      longitude: -157.86,
      output: "Pacific Fleet headquarters and carrier logistics",
    },
    {
      id: "guam",
      countryId: "united-states",
      name: "Apra Harbor, Guam",
      kind: "port",
      latitude: 13.44,
      longitude: 144.65,
      output: "Western Pacific forward logistics",
    },
    {
      id: "bremerton",
      countryId: "united-states",
      name: "Puget Sound Naval Shipyard",
      kind: "factory",
      latitude: 47.56,
      longitude: -122.65,
      output: "Major refit and nuclear ship repair",
    },
    {
      id: "severomorsk",
      countryId: "soviet-union",
      name: "Severomorsk",
      kind: "naval_base",
      latitude: 69.07,
      longitude: 33.42,
      output: "Northern Fleet support",
    },
    {
      id: "olenya",
      countryId: "soviet-union",
      name: "Olenya Air Base",
      kind: "air_base",
      latitude: 68.14,
      longitude: 33.46,
      output: "Long-range aviation",
    },
    {
      id: "murmansk",
      countryId: "soviet-union",
      name: "Murmansk Industrial Complex",
      kind: "factory",
      latitude: 68.97,
      longitude: 33.07,
      output: "Arctic sustainment",
    },
    {
      id: "vladivostok",
      countryId: "soviet-union",
      name: "Vladivostok Naval Base",
      kind: "naval_base",
      latitude: 43.12,
      longitude: 131.9,
      output: "Pacific Fleet surface and submarine support",
    },
    {
      id: "petropavlovsk",
      countryId: "soviet-union",
      name: "Petropavlovsk-Kamchatsky",
      kind: "naval_base",
      latitude: 53.02,
      longitude: 158.65,
      output: "Pacific ballistic-missile submarine bastion support",
    },
    {
      id: "sovetskaya-gavan",
      countryId: "soviet-union",
      name: "Sovetskaya Gavan",
      kind: "port",
      latitude: 48.97,
      longitude: 140.29,
      output: "Pacific Fleet logistics and repair",
    },
    {
      id: "dalian",
      countryId: "china",
      name: "Dalian Naval Facilities",
      kind: "naval_base",
      latitude: 38.92,
      longitude: 121.64,
      output: "North Sea Fleet support; Luda-era regional operations",
    },
    {
      id: "shanghai-jiangnan",
      countryId: "china",
      name: "Jiangnan Shipyard, Shanghai",
      kind: "factory",
      latitude: 31.08,
      longitude: 121.74,
      output: "Type 051/Luda-era naval construction and refit",
    },
    {
      id: "zhanjiang",
      countryId: "china",
      name: "Zhanjiang Naval Base",
      kind: "naval_base",
      latitude: 21.2,
      longitude: 110.39,
      output: "South Sea Fleet regional support",
    },
  ] satisfies StrategicSite[],
} as const;
