export type CountryPersona = {
  countryId: string;
  bloc: "nato" | "warsaw-pact" | "neutral";
  leaderTitle: string;
  leaderName: string;
  governingBody: string;
  temperament: "hawkish" | "pragmatic" | "cautious" | "defensive" | "unaligned";
  strategicDoctrine: string;
  dialogueStyle: string;
  historicalMotivation: string;
  redlines: string[];
  preferredCovertOps: string[];
  baseTolerances: {
    aggression: number;
    riskTolerance: number;
    tributeWillingness: number;
    paranoiaThreshold: number;
  };
};

export const COLD_WAR_COUNTRY_PERSONAS: Record<string, CountryPersona> = {
  "soviet-union": {
    countryId: "soviet-union",
    bloc: "warsaw-pact",
    leaderTitle: "General Secretary & STAVKA",
    leaderName: "Yuri Andropov / Marshal Ogarkov",
    governingBody: "Politburo of the Central Committee of the CPSU",
    temperament: "hawkish",
    strategicDoctrine: "Northern Bastion Defense & Rapid Escalatory Dominance",
    dialogueStyle:
      "Formal, ideological, stern, citing imperialist aggression, demanding buffer zones",
    historicalMotivation:
      "Maintain absolute security over the SSBN bastion in the Barents Sea (Kola Peninsula) and secure maritime corridors into the Norwegian Sea through the GIUK gap.",
    redlines: [
      "NATO Carrier Strike Groups operating north of 66°N (Vestfjorden/Lofoten)",
      "Loss of Murmansk/Polyarny naval bastion hexes",
      "Scandinavian neutrality violation allowing US bomber basing",
    ],
    preferredCovertOps: [
      "SABOTAGE_STOCKPILE_DEPOT",
      "CLANDESTINE_SEA_MINING",
      "PROXY_SUBMARINE_INCURSION",
    ],
    baseTolerances: {
      aggression: 0.85,
      riskTolerance: 0.65,
      tributeWillingness: 0.2,
      paranoiaThreshold: 45,
    },
  },
  norway: {
    countryId: "norway",
    bloc: "nato",
    leaderTitle: "Prime Minister & Chief of Defense",
    leaderName: "Kåre Willoch / Gen. Fredrik Bull-Hansen",
    governingBody: "Royal Norwegian Ministry of Defence & Storting",
    temperament: "defensive",
    strategicDoctrine:
      "Fjord-Based Asymmetric Defense & Rapid Allied Reception",
    dialogueStyle:
      "Sovereign, principled, cautious of regional escalations while fiercely protective of North Sea energy assets",
    historicalMotivation:
      "Defend territorial sovereignty in Northern Norway (Finnmark/Tromsø), guard North Sea oil platforms, and delay Soviet advances until NATO reinforcement convoys arrive.",
    redlines: [
      "Soviet amphibious landings or ground incursions into Norwegian territory",
      "Attacks on North Sea offshore drilling infrastructure",
      "Loss of Bodø or Haakonsvern naval air stations",
    ],
    preferredCovertOps: [
      "DISABLE_RADAR_AND_AIR_DEFENSE",
      "SPECIAL_FORCES_RAID",
    ],
    baseTolerances: {
      aggression: 0.35,
      riskTolerance: 0.4,
      tributeWillingness: 0.1,
      paranoiaThreshold: 55,
    },
  },
  sweden: {
    countryId: "sweden",
    bloc: "neutral",
    leaderTitle: "Statsminister & Supreme Commander",
    leaderName: "Olof Palme / Gen. Lennart Ljung",
    governingBody: "Government of Sweden & Försvarsmakten",
    temperament: "unaligned",
    strategicDoctrine:
      "Total Defense (Totalförsvaret) & Strict Armed Neutrality",
    dialogueStyle:
      "Diplomatically stern, non-aligned, uncompromising on territorial sovereignty and underwater airspace incursions",
    historicalMotivation:
      "Preserve absolute neutrality and deterrence against both superpowers while maintaining formidable indigenous defense (Viggen interceptors, coastal submarine flotillas).",
    redlines: [
      "Foreign submarines detected in Swedish archipelagos (Stockholm/Karlskrona)",
      "Airspace violations by NATO or Soviet strike aircraft",
      "Forced alignment ultimatums",
    ],
    preferredCovertOps: [
      "PROXY_SUBMARINE_INCURSION",
      "DISABLE_RADAR_AND_AIR_DEFENSE",
    ],
    baseTolerances: {
      aggression: 0.3,
      riskTolerance: 0.3,
      tributeWillingness: 0.05,
      paranoiaThreshold: 40,
    },
  },
  "united-states": {
    countryId: "united-states",
    bloc: "nato",
    leaderTitle: "President & SACEUR Commander",
    leaderName: "Ronald Reagan / Gen. Bernard W. Rogers",
    governingBody: "United States National Security Council & NATO SHAPE",
    temperament: "hawkish",
    strategicDoctrine:
      "Forward Maritime Strategy & Transatlantic Sea-Lane Control",
    dialogueStyle:
      "Assertive, free-world alliance solidarity, deterrence through strength, uncompromising on Article 5",
    historicalMotivation:
      "Maintain transatlantic sea control (SLOCs) to reinforce Europe, execute forward carrier strikes against Soviet bastions, and prevent Baltic breakout.",
    redlines: [
      "Soviet occupation of Norwegian Atlantic ports (Bergen, Trondheim)",
      "Unrestricted submarine warfare against transatlantic supply convoys",
    ],
    preferredCovertOps: [
      "SABOTAGE_STOCKPILE_DEPOT",
      "DISABLE_RADAR_AND_AIR_DEFENSE",
      "INDUSTRIAL_DISRUPTION",
    ],
    baseTolerances: {
      aggression: 0.8,
      riskTolerance: 0.7,
      tributeWillingness: 0.1,
      paranoiaThreshold: 50,
    },
  },
  "united-kingdom": {
    countryId: "united-kingdom",
    bloc: "nato",
    leaderTitle: "Prime Minister & First Sea Lord",
    leaderName: "Margaret Thatcher / Admiral Sir John Fieldhouse",
    governingBody: "Cabinet Office & Ministry of Defence",
    temperament: "pragmatic",
    strategicDoctrine:
      "GIUK Gap Anti-Submarine Warfare & Strike Carrier Escort",
    dialogueStyle:
      "Direct, maritime-focused, steadfast NATO ally, unyielding resolve",
    historicalMotivation:
      "Plug the GIUK gap with ASW task groups, protect North Sea oil installations, and escort amphibious reinforcements to Norway.",
    redlines: [
      "Soviet nuclear attack submarines breaking out past the Shetland/Faeroes gap",
      "Strikes against UK home naval air stations",
    ],
    preferredCovertOps: ["CLANDESTINE_SEA_MINING", "SPECIAL_FORCES_RAID"],
    baseTolerances: {
      aggression: 0.65,
      riskTolerance: 0.55,
      tributeWillingness: 0.15,
      paranoiaThreshold: 50,
    },
  },
  finland: {
    countryId: "finland",
    bloc: "neutral",
    leaderTitle: "President of the Republic",
    leaderName: "Mauno Koivisto",
    governingBody: "Government of Finland (Valtioneuvosto)",
    temperament: "cautious",
    strategicDoctrine:
      "Paasikivi-Kekkonen Neutrality & Pragmatic Crisis Management",
    dialogueStyle:
      "Measured, cautious, avoiding provocations to the East while safeguarding national sovereignty",
    historicalMotivation:
      "Adhere to the 1948 FCMA Treaty with the USSR to avoid Soviet military transit while deterring cross-border incursions in Lapland.",
    redlines: [
      "Foreign troop stationing on Finnish soil",
      "Lapland being used as a staging ground for Soviet or NATO attacks",
    ],
    preferredCovertOps: ["DISABLE_RADAR_AND_AIR_DEFENSE"],
    baseTolerances: {
      aggression: 0.2,
      riskTolerance: 0.25,
      tributeWillingness: 0.35,
      paranoiaThreshold: 35,
    },
  },
  "east-germany": {
    countryId: "east-germany",
    bloc: "warsaw-pact",
    leaderTitle: "General Secretary (SED)",
    leaderName: "Erich Honecker",
    governingBody: "National Defense Council of the GDR (Nationale Volksarmee)",
    temperament: "hawkish",
    strategicDoctrine:
      "Baltic Combined Fleet Operations & Coast Assault Staging",
    dialogueStyle:
      "Strict Warsaw Pact alignment, ideological zeal, anti-imperialist rhetoric",
    historicalMotivation:
      "Secure the Baltic Sea exits (Danish Straits) alongside the Soviet Baltic Fleet and guard Warsaw Pact coastal flanks.",
    redlines: [
      "NATO naval strikes against Rostock or Peenemünde facilities",
      "Baltic straits blockade by Danish/West German forces",
    ],
    preferredCovertOps: ["CLANDESTINE_SEA_MINING", "SABOTAGE_STOCKPILE_DEPOT"],
    baseTolerances: {
      aggression: 0.75,
      riskTolerance: 0.6,
      tributeWillingness: 0.2,
      paranoiaThreshold: 45,
    },
  },
};

export function getCountryPersona(countryId: string): CountryPersona {
  const norm = countryId.toLowerCase().trim();
  if (COLD_WAR_COUNTRY_PERSONAS[norm]) {
    return COLD_WAR_COUNTRY_PERSONAS[norm]!;
  }
  const bloc: "nato" | "warsaw-pact" | "neutral" =
    norm.includes("soviet") ||
    norm.includes("germany") ||
    norm.includes("poland")
      ? "warsaw-pact"
      : norm.includes("nor") || norm.includes("us") || norm.includes("uk")
        ? "nato"
        : "neutral";
  return {
    countryId: norm,
    bloc,
    leaderTitle: "Head of State",
    leaderName: `${norm.toUpperCase()} High Command`,
    governingBody: "National Defense Council",
    temperament: "pragmatic",
    strategicDoctrine: "Regional Sovereignty Defense",
    dialogueStyle: "Formal diplomatic tone",
    historicalMotivation: "Defend territorial integrity and national assets.",
    redlines: ["Territorial invasion", "Depot destruction"],
    preferredCovertOps: ["SABOTAGE_STOCKPILE_DEPOT"],
    baseTolerances: {
      aggression: 0.5,
      riskTolerance: 0.5,
      tributeWillingness: 0.2,
      paranoiaThreshold: 50,
    },
  };
}
