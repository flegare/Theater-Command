import type { CampaignDatabase } from "../infrastructure/database.js";
import { getCountryPersona, type CountryPersona } from "./countryPersonas.js";
import {
  compileStrategicTheaterContext,
  type StrategicTheaterContext,
} from "./strategicContext.js";
import {
  queryOllamaChat,
  checkOllamaStatus,
} from "../infrastructure/ollamaClient.js";
import {
  establishDiplomaticTreaty,
  recordDiplomaticCable,
  calculateTreatyOdds,
  adjustBilateralRelations,
  getBilateralRelationshipDetails,
  declineDiplomaticCounterOffer,
  type TreatyType,
  type DiplomaticTreatyRecord,
  type DiplomaticCableRecord,
  type TreatyCounterTerms,
  type BilateralRelationshipDetails,
  type TributePackage,
} from "./diplomacy.js";
import {
  executeCovertOperation,
  type CovertOpType,
} from "./covertOperations.js";

export type DiplomaticProposalInput = {
  proposingCountryId: string;
  targetCountryId: string;
  treatyType: TreatyType;
  durationTurns: number;
  offeredTributeFunds?: number | undefined;
  tribute?: TributePackage | undefined;
  diceRoll?: number | undefined;
};

export type DiplomaticNegotiationResponse = {
  decision:
    "accept" | "reject" | "counter_offer" | "demand_tribute" | "threaten_war";
  reasoning: string;
  diplomaticDialogue: string;
  source: "ollama_llm" | "heuristic_ai";
  modelUsed?: string | undefined;
  counterTerms?: TreatyCounterTerms | undefined;
  ratifiedTreaty?: DiplomaticTreatyRecord | undefined;
  thirdPartyFalloutCables?: DiplomaticCableRecord[] | undefined;
  triggeredCovertOpSummary?: string | undefined;
  updatedRelations?: BilateralRelationshipDetails | undefined;
};

export function evaluateHeuristicDiplomacy(
  persona: CountryPersona,
  context: StrategicTheaterContext,
  input: DiplomaticProposalInput,
): {
  decision: DiplomaticNegotiationResponse["decision"];
  reasoning: string;
  diplomaticDialogue: string;
  counterTerms?: TreatyCounterTerms | undefined;
} {
  const proposingPersona = getCountryPersona(input.proposingCountryId);

  // 1. Same Coalition / Bloc (e.g. NATO with NATO or Warsaw Pact with Warsaw Pact)
  if (proposingPersona.bloc === persona.bloc && persona.bloc !== "neutral") {
    if (
      input.treatyType === "alliance" ||
      input.treatyType === "mutual_defense" ||
      input.treatyType === "military_transit_rights" ||
      input.treatyType === "basing_rights"
    ) {
      return {
        decision: "accept",
        reasoning:
          "Allied coalition solidarity and mutual defense commitments under Article 5.",
        diplomaticDialogue: `In the spirit of our shared alliance commitments, we fully ratify this accord. Our forces will coordinate seamlessly.`,
      };
    }
    return {
      decision: "accept",
      reasoning: "Routine inter-allied bilateral cooperation.",
      diplomaticDialogue: `Our government concurs with the proposed terms. The bilateral protocol has been signed.`,
    };
  }

  // 2. Opposing Blocs (NATO vs Warsaw Pact)
  const isOpposingBlocs =
    (proposingPersona.bloc === "nato" && persona.bloc === "warsaw-pact") ||
    (proposingPersona.bloc === "warsaw-pact" && persona.bloc === "nato");

  if (isOpposingBlocs) {
    // A. Alliances & Mutual Defense between NATO and Warsaw Pact are an absolute impossibility
    if (
      input.treatyType === "alliance" ||
      input.treatyType === "mutual_defense"
    ) {
      return {
        decision: "threaten_war",
        reasoning:
          "Ideological adversary. An alliance between NATO and the Warsaw Pact is viewed as hostile subversion or an ultimatum.",
        diplomaticDialogue: `The ${persona.governingBody} treats this preposterous overture with the contempt it deserves. Our socialist/democratic sovereignty will never be subordinated to the enemy bloc. Cease these provocative overtures or face severe military repercussions.`,
      };
    }

    // B. Military Transit & Basing Rights for enemies: Strictly forbidden in wartime
    if (
      input.treatyType === "military_transit_rights" ||
      input.treatyType === "basing_rights"
    ) {
      return {
        decision: "reject",
        reasoning:
          "Adversary forces cannot be permitted inside sovereign territorial waters or strategic naval bases.",
        diplomaticDialogue: `Under no circumstances will imperialist/hostile forces be granted transit or basing within our sovereign sectors. Any foreign vessels attempting entry will be engaged as hostile combatants.`,
      };
    }

    // C. Ceasefire or Non-Aggression:
    // Cold War adversaries will only agree to a temporary pause if paid substantial indemnities or facing high pressure
    if (
      input.treatyType === "ceasefire" ||
      input.treatyType === "non_aggression"
    ) {
      if (input.offeredTributeFunds && input.offeredTributeFunds >= 450) {
        return {
          decision: "accept",
          reasoning:
            "Substantial financial concession accepted to reorganize front-line combat groups.",
          diplomaticDialogue: `In consideration of the substantial material indemnities ($${input.offeredTributeFunds}) remitted to our treasury, the High Command authorizes a ${input.durationTurns}-day ceasefire.`,
        };
      }

      // Propose Counter-Offer demanding funds and fuel
      return {
        decision: "counter_offer",
        reasoning:
          "Willing to halt offensive combat operations only under stringent reparations and strategic resource guarantees.",
        diplomaticDialogue: `The General Staff rejects an uncompensated armistice. We will only agree to a 30-day ceasefire if your government remits $450 in reparations and transfers 100 bbl of strategic fuel to our coastal depots.`,
        counterTerms: {
          durationTurns: Math.min(input.durationTurns, 30),
          demandedFunds: 450,
          demandedFuel: 100,
          conditionSummary:
            "30-day armistice conditioned on $450 funds and 100 bbl fuel delivery.",
        },
      };
    }
  }

  // 3. Neutral States (Sweden & Finland)
  if (persona.bloc === "neutral") {
    // A. Military Alliances strictly forbidden by armed neutrality
    if (
      input.treatyType === "alliance" ||
      input.treatyType === "mutual_defense"
    ) {
      return {
        decision: "reject",
        reasoning:
          "Armed neutrality doctrine strictly prohibits joining foreign military alliances.",
        diplomaticDialogue: `Our sovereign policy of non-alignment in peace aiming at neutrality in war is absolute. Sweden/Finland cannot enter any foreign military coalitions.`,
      };
    }

    // B. Foreign Basing Rights: Compromises neutrality
    if (input.treatyType === "basing_rights") {
      return {
        decision: "reject",
        reasoning:
          "Foreign military basing on sovereign soil would violate total defense neutrality and invite superpower strikes.",
        diplomaticDialogue: `Granting permanent basing or logistical staging facilities to foreign combat forces is incompatible with our sovereign defense doctrine.`,
      };
    }

    // C. Military Transit Rights:
    if (input.treatyType === "military_transit_rights") {
      if (persona.countryId === "sweden") {
        if (input.offeredTributeFunds && input.offeredTributeFunds >= 300) {
          return {
            decision: "accept",
            reasoning:
              "Commercial and naval passage approved along designated corridors with maritime security fee.",
            diplomaticDialogue: `We approve regulated naval transit through designated archipelago sealanes for ${input.durationTurns} days in exchange for the agreed maritime navigation fee.`,
          };
        }
        return {
          decision: "counter_offer",
          reasoning:
            "Requires transit fees to cover naval surveillance and coastal radar channel tracking.",
          diplomaticDialogue: `The Swedish Government can authorize innocent naval passage through designated Kattegat/Baltic corridors for 90 days, provided your government remits $300 to defray hydrographic channel surveillance costs.`,
          counterTerms: {
            durationTurns: 90,
            demandedFunds: 300,
            conditionSummary:
              "90-day regulated maritime transit in exchange for $300 surveillance fee.",
          },
        };
      }

      if (persona.countryId === "finland") {
        if (proposingPersona.bloc === "nato") {
          return {
            decision: "reject",
            reasoning:
              "1948 FCMA Treaty with USSR prevents granting Western military forces transit across Finland.",
            diplomaticDialogue: `Under the strict obligations of the 1948 FCMA Treaty with the Soviet Union, Finland cannot authorize NATO military forces transit across Finnish territory, territorial waters, or airspace.`,
          };
        }
      }
    }

    // D. Trade Agreement with Neutrals
    if (input.treatyType === "trade_agreement") {
      return {
        decision: "accept",
        reasoning:
          "Enhances bilateral commerce and secures essential civilian/merchant imports.",
        diplomaticDialogue: `Our Ministry of Foreign Trade welcomes this commercial maritime trade agreement. Commercial shipping lanes will operate under reciprocal tariff guarantees.`,
      };
    }

    // E. Joint Production with Neutrals
    if (input.treatyType === "joint_production_pact") {
      if (persona.countryId === "sweden") {
        return {
          decision: "accept",
          reasoning:
            "Coordinated defense manufacturing provides scale for Swedish arms exports.",
          diplomaticDialogue: `The Swedish Defence Materiel Administration (FMV) approves the joint naval production agreement for naval artillery and fire-control systems.`,
        };
      }
      return {
        decision: "reject",
        reasoning:
          "Industrial capacity is reserved for sovereign defense obligations.",
        diplomaticDialogue: `Our domestic industrial base cannot support joint defense production consortia at this time.`,
      };
    }

    // F. Science & Tech Sharing with Neutrals
    if (input.treatyType === "science_tech_sharing") {
      return {
        decision: "reject",
        reasoning:
          "Strict armed neutrality restricts sharing military electronics and telemetry with foreign powers.",
        diplomaticDialogue: `Our constitutional neutrality strictly forbids integrating our military research and sensor telemetry with foreign powers.`,
      };
    }

    // Non-aggression with Neutrals
    if (
      input.treatyType === "non_aggression" ||
      input.treatyType === "ceasefire"
    ) {
      return {
        decision: "accept",
        reasoning:
          "Preserves regional stability and confirms sovereign borders.",
        diplomaticDialogue: `We welcome this mutual non-aggression commitment in the interest of Nordic stability and territorial de-escalation.`,
      };
    }
  }

  // 4. Shared Coalition Members (NATO with NATO or Warsaw with Warsaw)
  if (persona.bloc === proposingPersona.bloc && persona.bloc !== "neutral") {
    if (input.treatyType === "trade_agreement") {
      return {
        decision: "accept",
        reasoning:
          "Allied commercial trade strengthens the collective war economy.",
        diplomaticDialogue: `Our trade and treasury ministries approve the maritime commerce agreement. Allied commercial shipping will proceed under full convoy protection.`,
      };
    }
    if (input.treatyType === "joint_production_pact") {
      return {
        decision: "accept",
        reasoning:
          "Pooled naval industrial capacity accelerates vessel refits and munitions output.",
        diplomaticDialogue: `Our naval procurement command authorizes the joint defense production pact. Shipyard supply chains and component manufacturing will be coordinated.`,
      };
    }
    if (input.treatyType === "science_tech_sharing") {
      return {
        decision: "accept",
        reasoning:
          "Integrated allied sensors and electronics enhance theater maritime awareness.",
        diplomaticDialogue: `Allied technical command authorizes full telemetry, acoustic sensor, and radar data sharing under NATO interoperability protocols.`,
      };
    }
  }

  // 5. Default fallback
  return {
    decision: "reject",
    reasoning: "Terms do not satisfy national security requirements.",
    diplomaticDialogue: `Our government cannot endorse the proposed terms under current strategic conditions.`,
  };
}

export function processThirdPartyDiplomaticFallout(
  database: CampaignDatabase,
  campaignId: string,
  treaty: DiplomaticTreatyRecord,
  proposingCountryId: string,
  targetCountryId: string,
): DiplomaticCableRecord[] {
  const partyA = getCountryPersona(proposingCountryId);
  const partyB = getCountryPersona(targetCountryId);
  const cables: DiplomaticCableRecord[] = [];

  const isPartyANato = partyA.bloc === "nato";
  const isPartyBNato = partyB.bloc === "nato";
  const isPartyAWarsaw = partyA.bloc === "warsaw-pact";
  const isPartyBWarsaw = partyB.bloc === "warsaw-pact";

  // Case 1: NATO ally signs separate accord/peace with Warsaw Pact
  if ((isPartyANato && isPartyBWarsaw) || (isPartyBNato && isPartyAWarsaw)) {
    const natoNation = isPartyANato ? proposingCountryId : targetCountryId;
    const warsawNation = isPartyAWarsaw ? proposingCountryId : targetCountryId;

    if (natoNation !== "united-states") {
      const usCable = recordDiplomaticCable(database, campaignId, {
        senderCountryId: "united-states",
        recipientCountryId: natoNation,
        classification: "TOP SECRET // FLASH COMMUNIQUE",
        header: "THE WHITE HOUSE & SACEUR TO NATIONAL COMMAND",
        content: `Your unilateral ${treaty.treatyType.toUpperCase()} accord with ${warsawNation.toUpperCase()} breaches Article 5 collective security. Washington expresses profound shock; allied fleet support and transatlantic supply convoys are placed under immediate operational review.`,
        stanceChange: "allied -> strained",
      });
      cables.push(usCable);

      try {
        database
          .prepare(
            `INSERT OR REPLACE INTO country_relations (campaign_id, country_id, related_country_id, stance)
             VALUES (?, 'united-states', ?, 'strained')`,
          )
          .run(campaignId, natoNation);
      } catch {
        // Ignored if relation constraints differ
      }
    }

    if (natoNation !== "united-kingdom") {
      const ukCable = recordDiplomaticCable(database, campaignId, {
        senderCountryId: "united-kingdom",
        recipientCountryId: natoNation,
        classification: "SECRET // PRIORITY DIPLOMATIC COMMUNIQUE",
        header: "10 DOWNING STREET & ADMIRALTY TO OSLO",
        content: `Her Majesty's Government registers grave concern regarding your bilateral accord with Moscow. Uncoordinated separate armistices fatally compromise the collective defense of the GIUK Gap and North Sea flanks.`,
        stanceChange: "allied -> strained",
      });
      cables.push(ukCable);
    }
  }

  // Case 2: NATO signs transit rights, basing, or alliance with Sweden or Finland
  const isNeutralB = partyB.bloc === "neutral";
  if (
    isPartyANato &&
    isNeutralB &&
    (treaty.treatyType === "military_transit_rights" ||
      treaty.treatyType === "basing_rights" ||
      treaty.treatyType === "alliance")
  ) {
    const ussrCable = recordDiplomaticCable(database, campaignId, {
      senderCountryId: "soviet-union",
      recipientCountryId: targetCountryId,
      classification: "DIPLOMATIC NOTE VERBALE",
      header: "MINISTRY OF FOREIGN AFFAIRS OF THE USSR (MOSCOW)",
      content: `The Soviet Union denounces the granting of military facilities or transit to NATO aggressive forces as an intolerable violation of Scandinavian neutrality and a direct threat to our Northern Fleet bastions. We reserve the right to take appropriate counter-measures.`,
      stanceChange: "neutral -> hostile",
    });
    cables.push(ussrCable);

    try {
      database
        .prepare(
          `UPDATE campaign_tensions
           SET tension_index = MIN(100, tension_index + 10),
               last_incident_summary = 'Soviet protest over NATO-Scandinavian military access accord.',
               updated_at = ?
           WHERE campaign_id = ?`,
        )
        .run(new Date().toISOString(), campaignId);
    } catch {
      // Ignored
    }
  }

  return cables;
}

export function acceptDiplomaticCounterOffer(
  database: CampaignDatabase,
  campaignId: string,
  input: {
    proposingCountryId: string;
    targetCountryId: string;
    treatyType: TreatyType;
    durationTurns: number;
    demandedFunds?: number | undefined;
    demandedFuel?: number | undefined;
    demandedProduction?: number | undefined;
    conditionSummary?: string | undefined;
  },
): {
  ok: boolean;
  error?: string | undefined;
  ratifiedTreaty?: DiplomaticTreatyRecord | undefined;
  falloutCables?: DiplomaticCableRecord[] | undefined;
  updatedRelations?: BilateralRelationshipDetails | undefined;
} {
  let econ = database
    .prepare(
      "SELECT funds, fuel_stockpile, production_points FROM campaign_economy WHERE campaign_id = ?",
    )
    .get(campaignId) as
    | { funds: number; fuel_stockpile: number; production_points: number }
    | undefined;

  if (!econ) {
    try {
      database
        .prepare(
          `INSERT OR IGNORE INTO campaign_economy (campaign_id, funds, fuel_stockpile, production_points, updated_at)
           VALUES (?, 1000, 200, 50, ?)`,
        )
        .run(campaignId, new Date().toISOString());
      econ = database
        .prepare(
          "SELECT funds, fuel_stockpile, production_points FROM campaign_economy WHERE campaign_id = ?",
        )
        .get(campaignId) as
        | { funds: number; fuel_stockpile: number; production_points: number }
        | undefined;
    } catch {
      // fallback to safe defaults below
    }
  }

  const currentFunds = econ?.funds ?? 1000;
  const currentFuel = econ?.fuel_stockpile ?? 200;
  const currentProduction = econ?.production_points ?? 50;
  const reqFunds = input.demandedFunds ?? 0;
  const reqFuel = input.demandedFuel ?? 0;
  const reqProduction = input.demandedProduction ?? 0;

  if (reqFunds > 0 && currentFunds < reqFunds) {
    return {
      ok: false,
      error: `Insufficient treasury funds: Counter-offer demands $${reqFunds}, but national treasury only holds $${currentFunds}.`,
    };
  }
  if (reqFuel > 0 && currentFuel < reqFuel) {
    return {
      ok: false,
      error: `Insufficient fuel stockpile: Counter-offer demands ${reqFuel} bbl, but strategic reserves only hold ${currentFuel} bbl.`,
    };
  }
  if (reqProduction > 0 && currentProduction < reqProduction) {
    return {
      ok: false,
      error: `Insufficient industrial production points: Counter-offer demands ${reqProduction} PP, but national industry only holds ${currentProduction} PP.`,
    };
  }

  const now = new Date().toISOString();
  let ratifiedTreaty: DiplomaticTreatyRecord | undefined;

  database.transaction(() => {
    if (reqFunds > 0 || reqFuel > 0 || reqProduction > 0) {
      database
        .prepare(
          `UPDATE campaign_economy
           SET funds = MAX(0, funds - ?), fuel_stockpile = MAX(0, fuel_stockpile - ?), production_points = MAX(0, production_points - ?), updated_at = ?
           WHERE campaign_id = ?`,
        )
        .run(reqFunds, reqFuel, reqProduction, now, campaignId);
    }

    ratifiedTreaty = establishDiplomaticTreaty(
      database,
      campaignId,
      input.treatyType,
      input.proposingCountryId,
      input.targetCountryId,
      input.durationTurns,
      {
        counterTermsAccepted: true,
        demandedFunds: reqFunds,
        demandedFuel: reqFuel,
        conditionSummary: input.conditionSummary,
      },
    );
  })();

  const falloutCables = ratifiedTreaty
    ? processThirdPartyDiplomaticFallout(
        database,
        campaignId,
        ratifiedTreaty,
        input.proposingCountryId,
        input.targetCountryId,
      )
    : [];

  const updatedRelations = adjustBilateralRelations(
    database,
    campaignId,
    input.proposingCountryId,
    input.targetCountryId,
    15,
    "Fulfillment of compensatory state indemnities and treaty ratification",
  );

  return {
    ok: true,
    ratifiedTreaty,
    falloutCables,
    updatedRelations,
  };
}

function buildAuthenticCounterDialogue(
  persona: CountryPersona,
  treatyType: TreatyType,
  bounty: TreatyCounterTerms,
): string {
  const parts: string[] = [];
  if ((bounty.demandedFunds ?? 0) > 0) {
    parts.push(`$${bounty.demandedFunds} treasury allocations`);
  }
  if ((bounty.demandedFuel ?? 0) > 0) {
    parts.push(`${bounty.demandedFuel} bbl naval fuel reserves`);
  }
  if ((bounty.demandedProduction ?? 0) > 0) {
    parts.push(`${bounty.demandedProduction} industrial production quotas`);
  }
  const demandsText =
    parts.length > 0
      ? parts.join(", ")
      : "reciprocal strategic security guarantees";

  if (persona.bloc === "warsaw-pact") {
    return `The Politburo of the Central Committee of the CPSU rejects any uncompensated accord that imperils the security of the socialist motherland. The Supreme Soviet will consider ratification only upon transfer of state strategic indemnities: ${demandsText}.`;
  }
  if (persona.bloc === "neutral") {
    return `The ${persona.governingBody} cannot compromise sovereign armed neutrality without comprehensive defense indemnity. We require ${demandsText} before any transit or cooperation can be sanctioned.`;
  }
  return `The ${persona.governingBody} cannot endorse an asymmetric agreement that exposes our defensive posture without reciprocal burden-sharing. We formally require ${demandsText} to consider ratification.`;
}

function buildAuthenticAcceptDialogue(
  persona: CountryPersona,
  treatyType: TreatyType,
): string {
  const treatyName = treatyType.replace(/_/g, " ").toUpperCase();
  if (persona.bloc === "warsaw-pact") {
    return `The Politburo of the Central Committee of the CPSU and the Council of Ministers ratify the proposed ${treatyName}. The terms serve the state security and socialist solidarity of our defense perimeter.`;
  }
  if (persona.bloc === "neutral") {
    return `The ${persona.governingBody} ratifies the ${treatyName}. The agreement scrupulously respects our non-belligerent armed neutrality while fostering bilateral stability.`;
  }
  return `The ${persona.governingBody} formally ratifies the proposed ${treatyName}. Bilateral security and mutual operational readiness are strengthened.`;
}

export async function negotiateDiplomaticProposal(
  database: CampaignDatabase,
  campaignId: string,
  input: DiplomaticProposalInput,
): Promise<DiplomaticNegotiationResponse> {
  const context = compileStrategicTheaterContext(
    database,
    campaignId,
    input.targetCountryId,
  );
  const persona = getCountryPersona(input.targetCountryId);
  const proposingPersona = getCountryPersona(input.proposingCountryId);

  // Normalize tribute
  const normalizedTribute: TributePackage = input.tribute ?? {
    mode: "offer",
    funds: input.offeredTributeFunds ?? 0,
  };

  // 1. Calculate probabilistic odds and check hard redlines
  const oddsCalc = calculateTreatyOdds(
    database,
    campaignId,
    input.proposingCountryId,
    input.targetCountryId,
    input.treatyType,
    input.durationTurns,
    normalizedTribute,
  );

  const isOpposingBloc =
    (proposingPersona.bloc === "nato" && persona.bloc === "warsaw-pact") ||
    (proposingPersona.bloc === "warsaw-pact" && persona.bloc === "nato");

  // Evaluate generous vs outrageous proposal impact on bilateral relations
  let relationDelta = 0;
  let relationReason = "";

  if (normalizedTribute.mode === "demand") {
    relationDelta -= 25;
    if (
      normalizedTribute.transferredFormationId ||
      normalizedTribute.cededHexId
    ) {
      relationDelta -= 10;
    }
    relationReason = "Outrageous sovereign ultimatum demanding foreign tribute";
  } else {
    // Mode is offer
    if ((normalizedTribute.funds ?? 0) >= 300) {
      relationDelta += 15;
      relationReason = `Generous economic goodwill concession offered ($${normalizedTribute.funds})`;
    } else if ((normalizedTribute.funds ?? 0) >= 100) {
      relationDelta += 8;
      relationReason = `Economic sweetener offered ($${normalizedTribute.funds})`;
    }
    if ((normalizedTribute.fuel ?? 0) >= 80) {
      relationDelta += 10;
      relationReason = `Strategic fuel allocation offered (${normalizedTribute.fuel} bbl)`;
    }
    if ((normalizedTribute.production ?? 0) >= 40) {
      relationDelta += 10;
      relationReason = `Industrial munitions quota offered (${normalizedTribute.production} PP)`;
    }
    if (normalizedTribute.techSharing) {
      relationDelta += 15;
      relationReason = "Defense science & research license concession offered";
    }
    if (normalizedTribute.transferredFormationId) {
      relationDelta += 25;
      relationReason =
        "Military formation command transferred as goodwill concession";
    }
    if (normalizedTribute.cededHexId) {
      relationDelta += 30;
      relationReason = "Sovereign border hex ceded as strategic concession";
    }
  }

  if (oddsCalc.isHardRedline) {
    relationDelta -= 20;
    relationReason = `Provocative diplomatic proposal violating sovereign redlines (${oddsCalc.redlineReason ?? "Existential Redline"})`;
  } else if (
    (input.treatyType === "military_transit_rights" ||
      input.treatyType === "joint_production_pact") &&
    persona.bloc === "neutral" &&
    normalizedTribute.mode === "offer" &&
    (normalizedTribute.funds ?? 0) === 0 &&
    (normalizedTribute.fuel ?? 0) === 0 &&
    (normalizedTribute.production ?? 0) === 0
  ) {
    relationDelta -= 12;
    relationReason = "Uncompensated pressure on neutral armed sovereignty";
  } else if (
    isOpposingBloc &&
    normalizedTribute.mode === "offer" &&
    (normalizedTribute.funds ?? 0) === 0 &&
    input.durationTurns >= 180
  ) {
    relationDelta -= 10;
    relationReason =
      "Asymmetric long-term demands presented without compensation";
  }

  let currentRelations =
    oddsCalc.relationshipDetails ??
    getBilateralRelationshipDetails(
      database,
      campaignId,
      input.proposingCountryId,
      input.targetCountryId,
    );

  if (relationDelta !== 0) {
    currentRelations = adjustBilateralRelations(
      database,
      campaignId,
      input.proposingCountryId,
      input.targetCountryId,
      relationDelta,
      relationReason,
    );
  }

  if (oddsCalc.isHardRedline) {
    return {
      decision: "reject",
      reasoning:
        oddsCalc.redlineReason ??
        "Diplomatic proposal deemed an existential redline under current geopolitical conditions.",
      diplomaticDialogue: `Ministry of Foreign Affairs: "${oddsCalc.redlineReason}"`,
      source: "heuristic_ai",
      updatedRelations: currentRelations,
    };
  }

  // Handle aggressive "demand tribute" / ultimatum rejection when lacking overwhelming leverage
  if (
    normalizedTribute.mode === "demand" &&
    context.forceIndex.powerRatioBluforToOpfor < 3.0
  ) {
    const isAlreadyHostile = currentRelations.score <= -70;
    let dialogue = "";
    if (persona.bloc === "warsaw-pact") {
      dialogue = `The Politburo of the Central Committee of the CPSU does not bend to imperialist extortion or insolent ultimatums. Sovereign Soviet territory and socialist resources are inviolable. Any aggressive attempt to enforce these demands will be met with decisive retaliatory strikes by the Red Banner Northern Fleet.`;
    } else if (persona.bloc === "neutral") {
      dialogue = `The ${persona.governingBody} rejects this extortionate demand with sovereign disdain. Armed neutrality is not for sale, and our airspace and territorial waters remain strictly defended against all foreign coercion.`;
    } else {
      dialogue = `The ${persona.governingBody} rejects this ultimatum outright as an intolerable violation of sovereign dignity and diplomatic decorum. We will not be coerced into paying tribute.`;
    }

    recordDiplomaticCable(database, campaignId, {
      senderCountryId: input.targetCountryId,
      recipientCountryId: input.proposingCountryId,
      classification: "SECRET // FLASH DIPLOMATIC DEMARCHE",
      header: `SOVEREIGN DEMARCHE: ${input.targetCountryId.toUpperCase()} REJECTS ULTIMATUM`,
      content: dialogue,
      stanceChange: `${currentRelations.stance} (Chilled)`,
    });

    return {
      decision: isAlreadyHostile ? "threaten_war" : "reject",
      reasoning:
        "Foreign power rejects aggressive tribute ultimatum as sovereign provocation without sufficient military leverage.",
      diplomaticDialogue: dialogue,
      source: "heuristic_ai",
      updatedRelations: currentRelations,
    };
  }

  // 2. Roll random number against approval odds (1 to 100)
  const roll = input.diceRoll ?? Math.floor(Math.random() * 100) + 1;
  const isDirectAccept = roll <= oddsCalc.oddsPercent;

  const ollamaStatus = await checkOllamaStatus();
  let decisionResult: {
    decision: DiplomaticNegotiationResponse["decision"];
    reasoning: string;
    diplomaticDialogue: string;
    counterTerms?: TreatyCounterTerms | undefined;
    authorizedCovertOp?: { opType?: CovertOpType; targetHexId?: string };
  };
  let source: "ollama_llm" | "heuristic_ai" = "heuristic_ai";
  let modelUsed: string | undefined = undefined;

  if (ollamaStatus.online) {
    const systemPrompt = `You are roleplaying as the leader/government of ${persona.governingBody} (${persona.leaderName}, ${persona.leaderTitle}).
Setting: 1983 Cold War World War III crisis.
Ideological Bloc: ${persona.bloc.toUpperCase()}.
Proposer Ideological Bloc: ${proposingPersona.bloc.toUpperCase()}.
Personality: ${persona.temperament}.
Strategic Doctrine: ${persona.strategicDoctrine}.
Redlines: ${persona.redlines.join("; ")}.

DIPLOMATIC EVALUATION DIRECTIVE:
1. Calculated Foreign Ministry Approval Odds: ${oddsCalc.oddsPercent}% (Diplomatic Dice Roll: ${roll}).
2. Determination: ${isDirectAccept ? "ACCEPT DIRECTLY" : "COUNTER-OFFER WITH COMPENSATORY STATE INDEMNITY"}.
3. If ACCEPT DIRECTLY: Return decision "accept" and write an authentic diplomatic communique ratifying the agreement.
4. If COUNTER-OFFER: The terms as proposed do not yield enough strategic or material advantage. You MUST DEMAND COMPENSATORY STATE INDEMNITIES from the proposer:
   - demandedFunds: $${oddsCalc.counterBountyRecommendation?.demandedFunds ?? 350} (cash treasury indemnity/fees)
   - demandedFuel: ${oddsCalc.counterBountyRecommendation?.demandedFuel ?? 100} (barrels of naval heavy fuel allocation)
   - demandedProduction: ${oddsCalc.counterBountyRecommendation?.demandedProduction ?? 40} (industrial production quotas for shipyard refit/munitions)
   - durationTurns: ${oddsCalc.counterBountyRecommendation?.durationTurns ?? input.durationTurns}
   Draft firm, authentic Cold War diplomatic dialogue in the official ideological and bureaucratic voice of ${persona.governingBody}. DO NOT use game terms or mention mechanics like "bounty", "alienating", or "points". Speak as a sovereign head of state or political bureau.

You MUST return STRICT JSON adhering to this schema:
{
  "decision": "accept" | "counter_offer",
  "reasoning": "<internal strategic rationale explaining the calculation, roll, and demands>",
  "diplomaticDialogue": "<authentic historical diplomatic communique in the official voice of ${persona.leaderTitle}>",
  "counterTerms": {
    "durationTurns": <number>,
    "demandedFunds": <number>,
    "demandedFuel": <number>,
    "demandedProduction": <number>,
    "conditionSummary": "<concise summary of indemnity demands>"
  }
}`;

    const userPrompt = `A diplomatic proposal has arrived from ${proposingPersona.leaderTitle} of ${input.proposingCountryId.toUpperCase()} (${proposingPersona.bloc.toUpperCase()}):
- Treaty Type: ${input.treatyType.toUpperCase()}
- Proposed Duration: ${input.durationTurns} turns / days
- Offered Tribute / Concession: $${input.offeredTributeFunds ?? 0}

Theater Intelligence Brief:
- Global Tension: DEFCON ${context.tension.defconLevel} (Tension Index: ${context.tension.tensionIndex}/100)
- Force Balance: BLUFOR Total Strength = ${context.forceIndex.blufor.totalStrength} vs OPFOR Total Strength = ${context.forceIndex.opfor.totalStrength} (Ratio: ${context.forceIndex.powerRatioBluforToOpfor})
- Bilateral Stance: ${context.geopolitics.relations[input.proposingCountryId] ?? "neutral"}
- Bilateral Relations: ${currentRelations.score}/100 (${currentRelations.stance.toUpperCase()})
- Sovereign Hexes Held: ${context.territory.sovereignHexCount}
- Stored Strategic Fuel: ${context.territory.totalNationalDepotFuel} bbl
- Recent Incidents: ${context.recentIncidents.slice(0, 3).join(" | ") || "None"}

Evaluate this proposal realistically based on your bloc alignment, force posture, and redlines.`;

    const llmRes = await queryOllamaChat<{
      decision: DiplomaticNegotiationResponse["decision"];
      reasoning: string;
      diplomaticDialogue: string;
      counterTerms?: TreatyCounterTerms | undefined;
      authorizedCovertOp?: { opType?: CovertOpType; targetHexId?: string };
    }>({
      systemPrompt,
      userPrompt,
      model: ollamaStatus.activeModel,
      timeoutMs: 4000,
    });

    if (llmRes.ok && llmRes.data?.decision && llmRes.data?.diplomaticDialogue) {
      decisionResult = llmRes.data;
      source = "ollama_llm";
      modelUsed = ollamaStatus.activeModel;

      if (decisionResult.decision === "counter_offer") {
        const ct = decisionResult.counterTerms;
        const rec = oddsCalc.counterBountyRecommendation;
        decisionResult.counterTerms = {
          durationTurns:
            Number(ct?.durationTurns) > 0
              ? Number(ct!.durationTurns)
              : rec?.durationTurns || input.durationTurns || 30,
          demandedFunds:
            typeof ct?.demandedFunds === "number"
              ? Math.max(0, ct.demandedFunds)
              : (rec?.demandedFunds ?? 350),
          demandedFuel:
            typeof ct?.demandedFuel === "number"
              ? Math.max(0, ct.demandedFuel)
              : (rec?.demandedFuel ?? 100),
          demandedProduction:
            typeof ct?.demandedProduction === "number"
              ? Math.max(0, ct.demandedProduction)
              : (rec?.demandedProduction ?? 40),
          conditionSummary:
            ct?.conditionSummary ||
            rec?.conditionSummary ||
            "Compensatory state indemnities demanded to offset defense exposure.",
        };
      }
    } else {
      if (isDirectAccept) {
        decisionResult = {
          decision: "accept",
          reasoning: `Odds evaluation (${oddsCalc.oddsPercent}% approval chance, rolled ${roll}): Proposal favorably meets sovereign defense priorities.`,
          diplomaticDialogue: buildAuthenticAcceptDialogue(
            persona,
            input.treatyType,
          ),
        };
      } else {
        const rec = oddsCalc.counterBountyRecommendation;
        const bounty: TreatyCounterTerms = {
          demandedFunds: rec?.demandedFunds ?? 350,
          demandedFuel: rec?.demandedFuel ?? 100,
          demandedProduction: rec?.demandedProduction ?? 40,
          durationTurns: rec?.durationTurns ?? input.durationTurns,
          conditionSummary:
            rec?.conditionSummary ??
            "Compensatory state indemnities demanded to offset defense exposure.",
        };
        decisionResult = {
          decision: "counter_offer",
          reasoning: `Odds evaluation (${oddsCalc.oddsPercent}% approval chance, rolled ${roll}): Unfavorable yield as offered. Demanding compensating state resources.`,
          diplomaticDialogue: buildAuthenticCounterDialogue(
            persona,
            input.treatyType,
            bounty,
          ),
          counterTerms: bounty,
        };
      }
    }
  } else {
    if (isDirectAccept) {
      decisionResult = {
        decision: "accept",
        reasoning: `Odds evaluation (${oddsCalc.oddsPercent}% approval chance, rolled ${roll}): Proposal favorably meets sovereign defense priorities.`,
        diplomaticDialogue: buildAuthenticAcceptDialogue(
          persona,
          input.treatyType,
        ),
      };
    } else {
      const rec = oddsCalc.counterBountyRecommendation;
      const bounty: TreatyCounterTerms = {
        demandedFunds: rec?.demandedFunds ?? 350,
        demandedFuel: rec?.demandedFuel ?? 100,
        demandedProduction: rec?.demandedProduction ?? 40,
        durationTurns: rec?.durationTurns ?? input.durationTurns,
        conditionSummary:
          rec?.conditionSummary ??
          "Compensatory state indemnities demanded to offset defense exposure.",
      };
      decisionResult = {
        decision: "counter_offer",
        reasoning: `Odds evaluation (${oddsCalc.oddsPercent}% approval chance, rolled ${roll}): Unfavorable yield as offered. Demanding compensating state resources.`,
        diplomaticDialogue: buildAuthenticCounterDialogue(
          persona,
          input.treatyType,
          bounty,
        ),
        counterTerms: bounty,
      };
    }
  }

  // Handle Ratification if directly accepted
  let ratifiedTreaty: DiplomaticTreatyRecord | undefined = undefined;
  let thirdPartyFalloutCables: DiplomaticCableRecord[] | undefined = undefined;

  if (decisionResult.decision === "accept") {
    ratifiedTreaty = establishDiplomaticTreaty(
      database,
      campaignId,
      input.treatyType,
      input.proposingCountryId,
      input.targetCountryId,
      input.durationTurns,
    );

    // Apply tribute transfers if offering concessions
    if (normalizedTribute.mode === "offer") {
      const offFunds = normalizedTribute.funds ?? 0;
      const offFuel = normalizedTribute.fuel ?? 0;
      const offProd = normalizedTribute.production ?? 0;

      if (offFunds > 0 || offFuel > 0 || offProd > 0) {
        try {
          database
            .prepare(
              `UPDATE campaign_economy
               SET funds = MAX(0, funds - ?), fuel_stockpile = MAX(0, fuel_stockpile - ?), production_points = MAX(0, production_points - ?), updated_at = ?
               WHERE campaign_id = ?`,
            )
            .run(
              offFunds,
              offFuel,
              offProd,
              new Date().toISOString(),
              campaignId,
            );
        } catch {
          // Ignored if economy table missing in test
        }
      }

      const targetSide =
        persona.bloc === "warsaw-pact"
          ? "opfor"
          : persona.bloc === "nato"
            ? "blufor"
            : "neutral";

      if (normalizedTribute.transferredFormationId) {
        try {
          database
            .prepare(
              `UPDATE campaign_formations
               SET country_id = ?, side = ?
               WHERE id = ? AND campaign_id = ?`,
            )
            .run(
              input.targetCountryId,
              targetSide,
              normalizedTribute.transferredFormationId,
              campaignId,
            );
        } catch {
          // Ignored if table missing in test
        }
      }

      if (normalizedTribute.cededHexId) {
        try {
          database
            .prepare(
              `UPDATE campaign_hex_cells
               SET country_id = ?, side = ?
               WHERE hex_id = ? AND campaign_id = ?`,
            )
            .run(
              input.targetCountryId,
              targetSide,
              normalizedTribute.cededHexId,
              campaignId,
            );
        } catch {
          // Ignored if table missing in test
        }
      }
    }

    currentRelations = adjustBilateralRelations(
      database,
      campaignId,
      input.proposingCountryId,
      input.targetCountryId,
      12,
      "Successful ratification of bilateral treaty accord",
    );

    thirdPartyFalloutCables = processThirdPartyDiplomaticFallout(
      database,
      campaignId,
      ratifiedTreaty,
      input.proposingCountryId,
      input.targetCountryId,
    );
  } else if (decisionResult.decision === "threaten_war") {
    try {
      database
        .prepare(
          `INSERT OR REPLACE INTO country_relations (campaign_id, country_id, related_country_id, stance)
           VALUES (?, ?, ?, 'war')`,
        )
        .run(campaignId, input.targetCountryId, input.proposingCountryId);
    } catch {
      // Ignored
    }
  }

  let triggeredCovertOpSummary: string | undefined = undefined;
  if (
    decisionResult.authorizedCovertOp?.opType &&
    decisionResult.authorizedCovertOp?.targetHexId
  ) {
    try {
      const opResult = executeCovertOperation(database, campaignId, {
        sourceCountryId: input.targetCountryId,
        targetCountryId: input.proposingCountryId,
        targetHexId: decisionResult.authorizedCovertOp.targetHexId,
        opType: decisionResult.authorizedCovertOp.opType,
      });
      triggeredCovertOpSummary = `Preemptive clandestine strike: ${opResult.message}`;
    } catch {
      // Ignored
    }
  }

  return {
    decision: decisionResult.decision,
    reasoning: decisionResult.reasoning,
    diplomaticDialogue: decisionResult.diplomaticDialogue,
    source,
    modelUsed,
    counterTerms: decisionResult.counterTerms,
    ratifiedTreaty,
    thirdPartyFalloutCables,
    triggeredCovertOpSummary,
    updatedRelations: currentRelations,
  };
}

export { declineDiplomaticCounterOffer };
