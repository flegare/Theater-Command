import type { CampaignDatabase } from "../infrastructure/database.js";
import { getCountryPersona } from "./countryPersonas.js";

function generateUUID(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `treaty-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export type TreatyType =
  | "ceasefire"
  | "non_aggression"
  | "tribute"
  | "alliance"
  | "mutual_defense"
  | "military_transit_rights"
  | "basing_rights"
  | "trade_agreement"
  | "joint_production_pact"
  | "science_tech_sharing";

export type TreatyCounterTerms = {
  durationTurns: number;
  demandedFunds?: number | undefined;
  demandedFuel?: number | undefined;
  demandedProduction?: number | undefined;
  conditionSummary?: string | undefined;
};

export type DiplomaticCableRecord = {
  id: string;
  campaignId: string;
  senderCountryId: string;
  recipientCountryId: string;
  classification: string;
  header: string;
  content: string;
  stanceChange?: string | undefined;
  isRead: boolean;
  createdAt: string;
};

export type WorldNewsDispatchRecord = {
  id: string;
  campaignId: string;
  agency: "REUTERS" | "TASS" | "AFP" | "BBC" | string;
  headline: string;
  body: string;
  category: "TRADE" | "MILITARY" | "TREATY" | "INCIDENT" | string;
  createdAt: string;
};

export type DiplomaticTreatyRecord = {
  id: string;
  campaignId: string;
  treatyType: TreatyType;
  partyACountryId: string;
  partyBCountryId: string;
  durationTurns: number;
  turnsRemaining: number;
  terms: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function establishDiplomaticTreaty(
  database: CampaignDatabase,
  campaignId: string,
  treatyType: TreatyType,
  partyACountryId: string,
  partyBCountryId: string,
  durationTurns: number,
  terms: Record<string, unknown> = {},
): DiplomaticTreatyRecord {
  const treatyId = generateUUID();
  const now = new Date().toISOString();
  const termsJson = JSON.stringify(terms);

  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO diplomatic_treaties (
          id, campaign_id, treaty_type, party_a_country_id, party_b_country_id, duration_turns, turns_remaining, terms_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        treatyId,
        campaignId,
        treatyType,
        partyACountryId,
        partyBCountryId,
        durationTurns,
        durationTurns,
        termsJson,
        now,
        now,
      );

    // Try updating country_relations if records exist in countries table
    const targetStance =
      treatyType === "alliance" || treatyType === "mutual_defense"
        ? "allied"
        : treatyType === "ceasefire" || treatyType === "non_aggression"
          ? "neutral"
          : undefined;

    if (targetStance) {
      try {
        database
          .prepare(
            `INSERT OR REPLACE INTO country_relations (campaign_id, country_id, related_country_id, stance)
             VALUES (?, ?, ?, ?)`,
          )
          .run(campaignId, partyACountryId, partyBCountryId, targetStance);

        database
          .prepare(
            `INSERT OR REPLACE INTO country_relations (campaign_id, country_id, related_country_id, stance)
             VALUES (?, ?, ?, ?)`,
          )
          .run(campaignId, partyBCountryId, partyACountryId, targetStance);
      } catch {
        // Ignored if country records are not in countries table
      }
    }
  })();

  return {
    id: treatyId,
    campaignId,
    treatyType,
    partyACountryId,
    partyBCountryId,
    durationTurns,
    turnsRemaining: durationTurns,
    terms,
    createdAt: now,
    updatedAt: now,
  };
}

export function getActiveDiplomaticTreaties(
  database: CampaignDatabase,
  campaignId: string,
): DiplomaticTreatyRecord[] {
  const rows = database
    .prepare(
      `SELECT id, campaign_id, treaty_type, party_a_country_id, party_b_country_id, duration_turns, turns_remaining, terms_json, created_at, updated_at
       FROM diplomatic_treaties
       WHERE campaign_id = ? AND turns_remaining > 0
       ORDER BY turns_remaining ASC`,
    )
    .all(campaignId) as Array<{
    id: string;
    campaign_id: string;
    treaty_type: TreatyType;
    party_a_country_id: string;
    party_b_country_id: string;
    duration_turns: number;
    turns_remaining: number;
    terms_json: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    treatyType: r.treaty_type,
    partyACountryId: r.party_a_country_id,
    partyBCountryId: r.party_b_country_id,
    durationTurns: r.duration_turns,
    turnsRemaining: r.turns_remaining,
    terms: JSON.parse(r.terms_json || "{}"),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function recordDiplomaticCable(
  database: CampaignDatabase,
  campaignId: string,
  input: {
    senderCountryId: string;
    recipientCountryId: string;
    classification?: string;
    header: string;
    content: string;
    stanceChange?: string | undefined;
  },
): DiplomaticCableRecord {
  const id = `cable-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const now = new Date().toISOString();
  const classification = input.classification ?? "TOP SECRET";

  database
    .prepare(
      `INSERT INTO diplomatic_cables (
        id, campaign_id, sender_country_id, recipient_country_id, classification, header, content, stance_change, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      id,
      campaignId,
      input.senderCountryId,
      input.recipientCountryId,
      classification,
      input.header,
      input.content,
      input.stanceChange ?? null,
      now,
    );

  return {
    id,
    campaignId,
    senderCountryId: input.senderCountryId,
    recipientCountryId: input.recipientCountryId,
    classification,
    header: input.header,
    content: input.content,
    stanceChange: input.stanceChange,
    isRead: false,
    createdAt: now,
  };
}

export function getDiplomaticCables(
  database: CampaignDatabase,
  campaignId: string,
  limit = 35,
): DiplomaticCableRecord[] {
  const rows = database
    .prepare(
      `SELECT id, campaign_id, sender_country_id, recipient_country_id, classification, header, content, stance_change, is_read, created_at
       FROM diplomatic_cables
       WHERE campaign_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(campaignId, limit) as Array<{
    id: string;
    campaign_id: string;
    sender_country_id: string;
    recipient_country_id: string;
    classification: string;
    header: string;
    content: string;
    stance_change: string | null;
    is_read: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    senderCountryId: r.sender_country_id,
    recipientCountryId: r.recipient_country_id,
    classification: r.classification,
    header: r.header,
    content: r.content,
    stanceChange: r.stance_change ?? undefined,
    isRead: Boolean(r.is_read),
    createdAt: r.created_at,
  }));
}

export function markDiplomaticCablesAsRead(
  database: CampaignDatabase,
  campaignId: string,
  cableIds?: string[],
): number {
  if (cableIds && cableIds.length > 0) {
    const placeholders = cableIds.map(() => "?").join(",");
    const result = database
      .prepare(
        `UPDATE diplomatic_cables SET is_read = 1 WHERE campaign_id = ? AND id IN (${placeholders})`,
      )
      .run(campaignId, ...cableIds);
    return result.changes;
  }
  const result = database
    .prepare(
      `UPDATE diplomatic_cables SET is_read = 1 WHERE campaign_id = ? AND is_read = 0`,
    )
    .run(campaignId);
  return result.changes;
}

export function recordWorldNewsDispatch(
  database: CampaignDatabase,
  campaignId: string,
  input: {
    agency: string;
    headline: string;
    body: string;
    category: string;
  },
): WorldNewsDispatchRecord {
  const id = `news-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO world_news_dispatches (
        id, campaign_id, agency, headline, body, category, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      campaignId,
      input.agency,
      input.headline,
      input.body,
      input.category,
      now,
    );

  return {
    id,
    campaignId,
    agency: input.agency,
    headline: input.headline,
    body: input.body,
    category: input.category,
    createdAt: now,
  };
}

export function getWorldNewsDispatches(
  database: CampaignDatabase,
  campaignId: string,
  limit = 25,
): WorldNewsDispatchRecord[] {
  const rows = database
    .prepare(
      `SELECT id, campaign_id, agency, headline, body, category, created_at
       FROM world_news_dispatches
       WHERE campaign_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(campaignId, limit) as Array<{
    id: string;
    campaign_id: string;
    agency: string;
    headline: string;
    body: string;
    category: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    agency: r.agency,
    headline: r.headline,
    body: r.body,
    category: r.category,
    createdAt: r.created_at,
  }));
}

export type CasusBelliPretext = {
  name: string;
  pretextSummary: string;
  historicalAnalog: string;
  legitimacyOdds: number; // 0 to 100%
  triggerThreshold: number; // relation score threshold, e.g. -75
  casusBelliType:
    | "border_provocation"
    | "surveillance_airspace_incident"
    | "maritime_harassment"
    | "sabotage_reprisal";
};

export type DiplomaticRelationEvent = {
  id: string;
  campaignId: string;
  countryId: string;
  relatedCountryId: string;
  deltaScore: number;
  reason: string;
  createdAt: string;
};

export type TributePackage = {
  mode: "offer" | "demand"; // "offer" sweetener vs "demand" tribute (sovereign ultimatum)
  funds?: number | undefined; // Treasury funds ($)
  fuel?: number | undefined; // Refined naval fuel (bbl)
  production?: number | undefined; // Munitions & industrial production (PP)
  techSharing?: boolean | undefined; // Grant/demand defense science research license
  transferredFormationId?: string | undefined; // Military formation transferred
  cededHexId?: string | undefined; // Sovereign border hex ceded
};

export type BilateralRelationshipDetails = {
  score: number; // -100 to +100
  stance: "allied" | "friendly" | "neutral" | "strained" | "hostile" | "war";
  sentimentLabel: string;
  baselineReason: string;
  events: DiplomaticRelationEvent[];
  activeCasusBelli?: CasusBelliPretext | undefined;
};

export type DiplomaticOddsCalculation = {
  oddsPercent: number;
  baseOdds: number;
  breakdown: Array<{ factor: string; delta: number }>;
  isHardRedline: boolean;
  redlineReason?: string | undefined;
  relationshipDetails?: BilateralRelationshipDetails | undefined;
  counterBountyRecommendation?:
    | {
        demandedFunds?: number | undefined;
        demandedFuel?: number | undefined;
        demandedProduction?: number | undefined;
        durationTurns: number;
        conditionSummary: string;
      }
    | undefined;
};

export function getBilateralRelationshipDetails(
  database: CampaignDatabase,
  campaignId: string,
  countryA: string,
  countryB: string,
): BilateralRelationshipDetails {
  const propPersona = getCountryPersona(countryA);
  const targetPersona = getCountryPersona(countryB);

  const row = database
    .prepare(
      `SELECT stance, relation_score, casus_belli_json FROM country_relations
       WHERE campaign_id = ?
         AND ((country_id = ? AND related_country_id = ?) OR (country_id = ? AND related_country_id = ?))
       LIMIT 1`,
    )
    .get(campaignId, countryA, countryB, countryB, countryA) as
    | {
        stance: string;
        relation_score: number;
        casus_belli_json?: string | null;
      }
    | undefined;

  let score = 0;
  let stance: BilateralRelationshipDetails["stance"] = "neutral";
  let sentimentLabel = "Neutral Diplomatic Accord";

  if (row) {
    score = row.relation_score ?? 0;
    stance =
      (row.stance as BilateralRelationshipDetails["stance"]) ?? "neutral";
  } else {
    // Determine baseline from Cold War geopolitical alignments
    const isOpposingBloc =
      (propPersona.bloc === "nato" && targetPersona.bloc === "warsaw-pact") ||
      (propPersona.bloc === "warsaw-pact" && targetPersona.bloc === "nato");
    const isSameBloc =
      propPersona.bloc === targetPersona.bloc && propPersona.bloc !== "neutral";

    if (isSameBloc) {
      score = 85;
      stance = "allied";
      sentimentLabel = "Stalwart NATO Coalition Solidarity";
    } else if (isOpposingBloc) {
      score = -70;
      stance = "hostile";
      sentimentLabel = "Deep Cold War Enmity & Brinkmanship";
    } else {
      // Neutrals (Sweden, Finland)
      if (targetPersona.bloc === "neutral" && propPersona.bloc === "nato") {
        score = 25;
        stance = "friendly";
        sentimentLabel = "Sympathetic Armed Neutrality";
      } else if (
        targetPersona.bloc === "neutral" &&
        propPersona.bloc === "warsaw-pact"
      ) {
        score = -30;
        stance = "strained";
        sentimentLabel = "Cautious Non-Belligerent Vigilance";
      } else {
        score = 0;
        stance = "neutral";
        sentimentLabel = "Non-Aligned Balance";
      }
    }
  }

  // Baseline reason calculation
  const isOpposingBloc =
    (propPersona.bloc === "nato" && targetPersona.bloc === "warsaw-pact") ||
    (propPersona.bloc === "warsaw-pact" && targetPersona.bloc === "nato");
  const isSameBloc =
    propPersona.bloc === targetPersona.bloc && propPersona.bloc !== "neutral";

  let baselineReason = "Standard Non-Aligned Diplomatic Accord";
  if (isSameBloc) {
    baselineReason =
      "Foundational NATO Alliance Treaty & Article 5 Mutual Defense Guarantee";
  } else if (isOpposingBloc) {
    baselineReason =
      "Cold War Warsaw Pact vs NATO Strategic Bastion Rivalry & Deep Ideological Enmity";
  } else if (targetPersona.bloc === "neutral" && propPersona.bloc === "nato") {
    baselineReason =
      "Sympathetic Scandinavian Armed Neutrality & Regional Baltic Stability";
  } else if (
    targetPersona.bloc === "neutral" &&
    propPersona.bloc === "warsaw-pact"
  ) {
    baselineReason =
      "Vigilant Non-Belligerent Armed Neutrality & Baltic Buffer Doctrine";
  }

  // Derive sentiment label if from row
  if (row) {
    if (score >= 75) sentimentLabel = "Stalwart Coalition Alliance";
    else if (score >= 25) sentimentLabel = "Cordial & Cooperative Relations";
    else if (score >= -15) sentimentLabel = "Formal Non-Aligned Balance";
    else if (score >= -49) sentimentLabel = "Strained Diplomatic Friction";
    else if (score >= -80)
      sentimentLabel = "Hostile Geopolitical Confrontation";
    else sentimentLabel = "Total State of War";
  }

  // Load relation event ledger from DB if table exists
  const events: DiplomaticRelationEvent[] = [];
  try {
    const rows = database
      .prepare(
        `SELECT id, campaign_id, country_id, related_country_id, delta_score, reason, created_at
         FROM country_relation_events
         WHERE campaign_id = ?
           AND country_id = ? AND related_country_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
      )
      .all(campaignId, countryA, countryB) as Array<{
      id: string;
      campaign_id: string;
      country_id: string;
      related_country_id: string;
      delta_score: number;
      reason: string;
      created_at: string;
    }>;

    for (const r of rows) {
      events.push({
        id: r.id,
        campaignId: r.campaign_id,
        countryId: r.country_id,
        relatedCountryId: r.related_country_id,
        deltaScore: r.delta_score,
        reason: r.reason,
        createdAt: r.created_at,
      });
    }
  } catch {
    // Migration might not have run yet in isolated test setups
  }

  // If no dynamic events logged yet, populate foundational baseline event
  if (events.length === 0) {
    const initialBaselineScore = isSameBloc ? 85 : isOpposingBloc ? -70 : 25;
    events.push({
      id: `baseline-${countryA}-${countryB}`,
      campaignId,
      countryId: countryA,
      relatedCountryId: countryB,
      deltaScore: initialBaselineScore,
      reason: baselineReason,
      createdAt: new Date().toISOString(),
    });
  }

  let activeCasusBelli: CasusBelliPretext | undefined = undefined;
  if (row?.casus_belli_json) {
    try {
      activeCasusBelli = JSON.parse(row.casus_belli_json);
    } catch {
      activeCasusBelli = undefined;
    }
  }

  // If relations are in critical hostile zone (<= -60) and no Casus Belli exists, incubate one!
  if (!activeCasusBelli && score <= -60) {
    const isUssrInvolved =
      countryA === "soviet-union" || countryB === "soviet-union";
    if (isUssrInvolved) {
      activeCasusBelli = {
        name: "Shelling of Mainila Protocol: Sovereign Border Provocation",
        pretextSummary:
          "Soviet KGB intelligence dossiers allege hostile artillery incursions and clandestine sabotage along the sovereign perimeter. Moscow defense leadership threatens decisive punitive strikes.",
        historicalAnalog:
          "Shelling of Mainila (1939 Russo-Finnish Winter War Pretext)",
        legitimacyOdds: Math.min(
          90,
          Math.round(50 + Math.abs(score + 60) * 1.5),
        ),
        triggerThreshold: -75,
        casusBelliType: "border_provocation",
      };
    } else {
      activeCasusBelli = {
        name: "Territorial Airspace & Electronic Surveillance Violation Pretext",
        pretextSummary:
          "Armed forces report repeated incursions by foreign reconnaissance assets into restricted defense exclusion zones.",
        historicalAnalog: "Gulf of Sidra Incidents / U-2 Overflight Crises",
        legitimacyOdds: Math.min(
          85,
          Math.round(45 + Math.abs(score + 60) * 1.5),
        ),
        triggerThreshold: -75,
        casusBelliType: "surveillance_airspace_incident",
      };
    }
  }

  return {
    score,
    stance,
    sentimentLabel,
    baselineReason,
    events,
    activeCasusBelli,
  };
}

function ensureCountryExists(
  database: CampaignDatabase,
  campaignId: string,
  countryId: string,
): void {
  try {
    const existing = database
      .prepare("SELECT id FROM countries WHERE campaign_id = ? AND id = ?")
      .get(campaignId, countryId);
    if (!existing) {
      const persona = getCountryPersona(countryId);
      const coalitionId =
        persona.bloc === "nato"
          ? "nato"
          : persona.bloc === "warsaw-pact"
            ? "warsaw-pact"
            : "non-aligned";
      database
        .prepare(
          "INSERT OR IGNORE INTO coalitions (campaign_id, id, name, side) VALUES (?, ?, ?, ?)",
        )
        .run(
          campaignId,
          coalitionId,
          coalitionId.toUpperCase(),
          coalitionId.toUpperCase(),
        );

      database
        .prepare(
          "INSERT OR IGNORE INTO countries (campaign_id, id, name, coalition_id, objectives_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          campaignId,
          countryId,
          persona.governingBody || countryId,
          coalitionId,
          "[]",
        );
    }
  } catch {
    // Graceful fallback
  }
}

export function adjustBilateralRelations(
  database: CampaignDatabase,
  campaignId: string,
  countryA: string,
  countryB: string,
  deltaScore: number,
  reason: string,
): BilateralRelationshipDetails {
  ensureCountryExists(database, campaignId, countryA);
  ensureCountryExists(database, campaignId, countryB);

  const current = getBilateralRelationshipDetails(
    database,
    campaignId,
    countryA,
    countryB,
  );
  const newScore = Math.max(-100, Math.min(100, current.score + deltaScore));

  let newStance: BilateralRelationshipDetails["stance"] = "neutral";
  if (newScore >= 75) newStance = "allied";
  else if (newScore >= 25) newStance = "friendly";
  else if (newScore >= -15) newStance = "neutral";
  else if (newScore >= -49) newStance = "strained";
  else if (newScore >= -80) newStance = "hostile";
  else newStance = "war";

  // Check Casus Belli incubation on drop
  let casusBelli = current.activeCasusBelli;
  if (!casusBelli && newScore <= -60) {
    const isUssrInvolved =
      countryA === "soviet-union" || countryB === "soviet-union";
    casusBelli = {
      name: isUssrInvolved
        ? "Shelling of Mainila Protocol: Sovereign Border Provocation"
        : "Territorial Airspace & Electronic Surveillance Violation Pretext",
      pretextSummary: isUssrInvolved
        ? "Soviet KGB intelligence dossiers allege hostile artillery incursions and clandestine sabotage along the sovereign perimeter. Moscow defense leadership threatens decisive punitive strikes."
        : "Armed forces report repeated incursions by foreign reconnaissance assets into restricted defense exclusion zones.",
      historicalAnalog: isUssrInvolved
        ? "Shelling of Mainila (1939 Russo-Finnish Winter War Pretext)"
        : "Gulf of Sidra Incidents / U-2 Overflight Crises",
      legitimacyOdds: Math.min(
        90,
        Math.round(50 + Math.abs(newScore + 60) * 1.5),
      ),
      triggerThreshold: -75,
      casusBelliType: isUssrInvolved
        ? "border_provocation"
        : "surveillance_airspace_incident",
    };
  } else if (casusBelli && newScore > -50) {
    // Defused if relations warm above -50!
    casusBelli = undefined;
  }

  const casusBelliJson = casusBelli ? JSON.stringify(casusBelli) : null;
  const now = new Date().toISOString();
  const eventId1 = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const eventId2 = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    database.transaction(() => {
      database
        .prepare(
          `INSERT INTO country_relations (campaign_id, country_id, related_country_id, stance, relation_score, casus_belli_json)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(campaign_id, country_id, related_country_id) DO UPDATE SET
             stance = excluded.stance,
             relation_score = excluded.relation_score,
             casus_belli_json = excluded.casus_belli_json`,
        )
        .run(
          campaignId,
          countryA,
          countryB,
          newStance,
          newScore,
          casusBelliJson,
        );

      database
        .prepare(
          `INSERT INTO country_relations (campaign_id, country_id, related_country_id, stance, relation_score, casus_belli_json)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(campaign_id, country_id, related_country_id) DO UPDATE SET
             stance = excluded.stance,
             relation_score = excluded.relation_score,
             casus_belli_json = excluded.casus_belli_json`,
        )
        .run(
          campaignId,
          countryB,
          countryA,
          newStance,
          newScore,
          casusBelliJson,
        );

      try {
        database
          .prepare(
            `INSERT INTO country_relation_events (id, campaign_id, country_id, related_country_id, delta_score, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            eventId1,
            campaignId,
            countryA,
            countryB,
            deltaScore,
            reason,
            now,
          );

        database
          .prepare(
            `INSERT INTO country_relation_events (id, campaign_id, country_id, related_country_id, delta_score, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            eventId2,
            campaignId,
            countryB,
            countryA,
            deltaScore,
            reason,
            now,
          );
      } catch {
        // Ignore if table not yet migrated in isolated unit tests
      }
    })();
  } catch (err) {
    console.warn(
      `[adjustBilateralRelations] Warning updating country_relations for ${countryA} and ${countryB}:`,
      err,
    );
  }

  // Log cable if major drop
  if (deltaScore <= -12) {
    const header = `DIPLOMATIC CHILL: RELATIONS DETERIORATE WITH ${countryB.toUpperCase()}`;
    const text =
      casusBelli && newScore <= casusBelli.triggerThreshold
        ? `Defense attachés confirm active preparation of ${casusBelli.name} (${casusBelli.legitimacyOdds}% legitimacy odds). Reason: ${reason}. Relations plunged to ${newScore}/100.`
        : `Bilateral ties between ${countryA} and ${countryB} have degraded (${deltaScore > 0 ? "+" : ""}${deltaScore} to ${newScore}/100). Reason: ${reason}.`;

    recordDiplomaticCable(database, campaignId, {
      senderCountryId: countryB,
      recipientCountryId: countryA,
      header,
      content: text,
      classification: "SECRET",
      stanceChange: `${current.stance} -> ${newStance}`,
    });
  }

  return getBilateralRelationshipDetails(
    database,
    campaignId,
    countryA,
    countryB,
  );
}

export function declineDiplomaticCounterOffer(
  database: CampaignDatabase,
  campaignId: string,
  input: {
    decliningCountryId: string;
    targetCountryId: string;
    treatyType: TreatyType;
    reason?: string | undefined;
  },
): {
  ok: boolean;
  cableRecorded: DiplomaticCableRecord;
  updatedRelations: BilateralRelationshipDetails;
} {
  const targetPersona = getCountryPersona(input.targetCountryId);
  const decliningPersona = getCountryPersona(input.decliningCountryId);

  // Diplomatic breakdown causes a small chill (-5 relations)
  const updatedRelations = adjustBilateralRelations(
    database,
    campaignId,
    input.decliningCountryId,
    input.targetCountryId,
    -5,
    "Formal rejection of compensatory treaty counter-demands",
  );

  const header = `TALKS COLLAPSE // REJECTION OF ${input.treatyType.toUpperCase()} DEMANDS`;
  const text = `The ${decliningPersona.governingBody} formally declines the strategic indemnity demands presented by ${targetPersona.governingBody}. Plenipotentiary envoy talks have been suspended. Bilateral relations chilled to ${updatedRelations.score}/100 (${updatedRelations.stance.toUpperCase()}).`;

  const cable = recordDiplomaticCable(database, campaignId, {
    senderCountryId: input.targetCountryId,
    recipientCountryId: input.decliningCountryId,
    header,
    content: text,
    classification: "CONFIDENTIAL",
    stanceChange: `Relations: ${updatedRelations.score}/100`,
  });

  return {
    ok: true,
    cableRecorded: cable,
    updatedRelations,
  };
}

export function calculateTreatyOdds(
  database: CampaignDatabase,
  campaignId: string,
  proposingCountryId: string,
  targetCountryId: string,
  treatyType: TreatyType,
  durationTurns: number = 90,
  tributeInput: number | TributePackage = 0,
): DiplomaticOddsCalculation {
  const tribute: TributePackage =
    typeof tributeInput === "number"
      ? { mode: "offer", funds: tributeInput }
      : tributeInput;

  if (proposingCountryId === targetCountryId) {
    return {
      oddsPercent: 0,
      baseOdds: 0,
      breakdown: [{ factor: "Self-proposal", delta: 0 }],
      isHardRedline: true,
      redlineReason: "Cannot establish a bilateral treaty with oneself.",
    };
  }

  const propPersona = getCountryPersona(proposingCountryId);
  const targetPersona = getCountryPersona(targetCountryId);

  const relDetails = getBilateralRelationshipDetails(
    database,
    campaignId,
    proposingCountryId,
    targetCountryId,
  );
  const currentStance = relDetails.stance;
  const isAtWar = currentStance === "war";
  const isHostile = currentStance === "hostile" || isAtWar;
  const isOpposingBloc =
    (propPersona.bloc === "nato" && targetPersona.bloc === "warsaw-pact") ||
    (propPersona.bloc === "warsaw-pact" && targetPersona.bloc === "nato");
  const isSameBloc =
    propPersona.bloc === targetPersona.bloc && propPersona.bloc !== "neutral";

  const activeTreaties = database
    .prepare(
      `SELECT treaty_type FROM diplomatic_treaties
       WHERE campaign_id = ?
         AND ((party_a_country_id = ? AND party_b_country_id = ?) OR (party_a_country_id = ? AND party_b_country_id = ?))
         AND turns_remaining > 0`,
    )
    .all(
      campaignId,
      proposingCountryId,
      targetCountryId,
      targetCountryId,
      proposingCountryId,
    ) as Array<{ treaty_type: string }>;
  const activeTypes = new Set(activeTreaties.map((t) => t.treaty_type));

  const breakdown: Array<{ factor: string; delta: number }> = [];

  // Check Hard Redlines first
  if (activeTypes.has(treatyType)) {
    return {
      oddsPercent: 0,
      baseOdds: 0,
      breakdown: [{ factor: "Already Active", delta: 0 }],
      isHardRedline: true,
      redlineReason: `A ${treatyType.replace(/_/g, " ")} accord is already active between these nations.`,
      relationshipDetails: relDetails,
    };
  }

  // Redline 1: Alliances / Mutual Defense between opposing superpower blocs
  if (
    isOpposingBloc &&
    (treatyType === "alliance" || treatyType === "mutual_defense")
  ) {
    return {
      oddsPercent: 0,
      baseOdds: 0,
      breakdown: [{ factor: "Opposing Nuclear Superpower Blocs", delta: -100 }],
      isHardRedline: true,
      redlineReason: `Ideological Adversaries: The ${propPersona.bloc.toUpperCase()} and ${targetPersona.bloc.toUpperCase()} are opposing nuclear coalitions. Forming a military alliance with the enemy is treason.`,
      relationshipDetails: relDetails,
    };
  }

  // Redline 2: Neutral armed non-alignment forbids military alliances
  if (
    targetPersona.bloc === "neutral" &&
    (treatyType === "alliance" || treatyType === "mutual_defense")
  ) {
    return {
      oddsPercent: 0,
      baseOdds: 0,
      breakdown: [
        { factor: "Armed Neutrality Non-Alignment Doctrine", delta: -100 },
      ],
      isHardRedline: true,
      redlineReason: `Armed Neutrality: ${targetPersona.countryId.toUpperCase()} follows a constitutional doctrine of strict non-alignment and rejects all foreign military alliances.`,
      relationshipDetails: relDetails,
    };
  }

  // Redline 3: Ceasefire during peacetime
  if (treatyType === "ceasefire" && !isAtWar && !isHostile) {
    const reason = isSameBloc
      ? `Both nations are stalwart allies in the ${propPersona.bloc.toUpperCase()} coalition. A ceasefire is completely inapplicable during peacetime solidarity.`
      : targetPersona.bloc === "neutral"
        ? `${targetPersona.countryId.toUpperCase()} is a non-belligerent neutral state. A ceasefire cannot be declared when no state of war exists.`
        : `Our nations are not engaged in an active state of war. A ceasefire can only be declared during active armed hostilities.`;
    return {
      oddsPercent: 0,
      baseOdds: 0,
      breakdown: [{ factor: "No Active State of War", delta: 0 }],
      isHardRedline: true,
      redlineReason: reason,
      relationshipDetails: relDetails,
    };
  }

  // Redline 4: Science & Tech Sharing with opposing superpower bloc or neutral
  if (treatyType === "science_tech_sharing") {
    if (isOpposingBloc) {
      return {
        oddsPercent: 0,
        baseOdds: 0,
        breakdown: [
          { factor: "Hostile Military Espionage Redline", delta: -100 },
        ],
        isHardRedline: true,
        redlineReason:
          "Strictly Prohibited: Advanced acoustic sonar, radar telemetry, and electronic warfare data cannot be shared with adversary nations.",
        relationshipDetails: relDetails,
      };
    }
    if (targetPersona.bloc === "neutral") {
      return {
        oddsPercent: 0,
        baseOdds: 0,
        breakdown: [
          { factor: "Neutral Non-Alignment Restriction", delta: -100 },
        ],
        isHardRedline: true,
        redlineReason:
          "Armed neutrality doctrine restricts foreign superpower military intelligence and sensor network integration.",
        relationshipDetails: relDetails,
      };
    }
  }

  // Redline 5: Joint defense production with opposing bloc
  if (treatyType === "joint_production_pact" && isOpposingBloc) {
    return {
      oddsPercent: 0,
      baseOdds: 0,
      breakdown: [{ factor: "Adversary Industrial Embargo", delta: -100 }],
      isHardRedline: true,
      redlineReason: `Military-industrial consortiums cannot share naval production technology with the opposing ${targetPersona.bloc.toUpperCase()} superpower bloc.`,
      relationshipDetails: relDetails,
    };
  }

  // -------------------------------------------------------------
  // PROBABILISTIC ODDS EVALUATION
  // -------------------------------------------------------------
  let baseOdds = 40;

  if (isSameBloc) {
    if (treatyType === "alliance" || treatyType === "mutual_defense") {
      baseOdds = 85;
      breakdown.push({
        factor: "Coalition Mutual Defense Alignment",
        delta: 45,
      });
    } else if (
      treatyType === "military_transit_rights" ||
      treatyType === "basing_rights"
    ) {
      baseOdds = 80;
      breakdown.push({ factor: "Allied Operational Coordination", delta: 40 });
    } else {
      baseOdds = 75;
      breakdown.push({
        factor: "Inter-Allied Bilateral Cooperation",
        delta: 35,
      });
    }
  } else if (targetPersona.bloc === "neutral") {
    if (treatyType === "trade_agreement") {
      baseOdds = 65;
      breakdown.push({
        factor: "Commercial Maritime Trade Reciprocity",
        delta: 25,
      });
    } else if (treatyType === "non_aggression") {
      baseOdds = 70;
      breakdown.push({ factor: "Neutral Non-Aggression Doctrine", delta: 30 });
    } else if (treatyType === "joint_production_pact") {
      baseOdds = targetPersona.countryId === "sweden" ? 45 : 25;
      breakdown.push({
        factor: "Arms Export & Defense Industrial Scale",
        delta: baseOdds - 40,
      });
    } else if (treatyType === "military_transit_rights") {
      baseOdds = targetPersona.countryId === "sweden" ? 30 : 15;
      breakdown.push({
        factor: "Sovereign Airspace/Water Sensitivity",
        delta: baseOdds - 40,
      });
    } else if (treatyType === "basing_rights") {
      baseOdds = 10;
      breakdown.push({
        factor: "Foreign Base Neutrality Skepticism",
        delta: -30,
      });
    } else if (treatyType === "ceasefire") {
      baseOdds = 30;
      breakdown.push({ factor: "Neutral Mediation Interest", delta: -10 });
    } else {
      baseOdds = 30;
      breakdown.push({ factor: "Neutral Foreign Policy Caution", delta: -10 });
    }
  } else if (isOpposingBloc) {
    if (treatyType === "ceasefire") {
      baseOdds = 30;
      breakdown.push({
        factor: "Adversary Armistice War Weariness",
        delta: -10,
      });
    } else if (treatyType === "non_aggression") {
      baseOdds = 25;
      breakdown.push({
        factor: "Hostile Non-Aggression Suspicion",
        delta: -15,
      });
    } else if (treatyType === "trade_agreement") {
      baseOdds = 15;
      breakdown.push({ factor: "Cold War Trade Embargo Friction", delta: -25 });
    } else {
      baseOdds = 10;
      breakdown.push({ factor: "Hostile Superpower Adversary", delta: -30 });
    }
  }

  // Modifiers
  // 1. Strategic Tribute Package (Offer Concession Sweetener vs Demand Tribute Ultimatum)
  if (tribute.mode === "demand") {
    let demandPenalty = -35;
    if ((tribute.funds ?? 0) > 0) {
      demandPenalty -= Math.min(
        20,
        Math.round(((tribute.funds ?? 0) / 100) * 3),
      );
    }
    if ((tribute.fuel ?? 0) > 0) {
      demandPenalty -= Math.min(20, Math.round(((tribute.fuel ?? 0) / 20) * 2));
    }
    if ((tribute.production ?? 0) > 0) {
      demandPenalty -= Math.min(
        20,
        Math.round(((tribute.production ?? 0) / 10) * 2),
      );
    }
    if (tribute.techSharing) {
      demandPenalty -= 20;
    }
    if (tribute.transferredFormationId || tribute.cededHexId) {
      demandPenalty -= 35;
    }
    baseOdds += demandPenalty;
    breakdown.push({
      factor: "Aggressive Sovereign Ultimatum / Demanded Tribute",
      delta: demandPenalty,
    });
  } else {
    // Mode is "offer"
    if ((tribute.funds ?? 0) > 0) {
      const fundsBonus = Math.min(
        30,
        Math.round(((tribute.funds ?? 0) / 100) * 5),
      );
      baseOdds += fundsBonus;
      breakdown.push({
        factor: `Offered Concession / Tribute Funds ($${tribute.funds})`,
        delta: fundsBonus,
      });
    }
    if ((tribute.fuel ?? 0) > 0) {
      const fuelBonus = Math.min(
        25,
        Math.round(((tribute.fuel ?? 0) / 20) * 3),
      );
      baseOdds += fuelBonus;
      breakdown.push({
        factor: `Strategic Fuel Allocation (${tribute.fuel} bbl)`,
        delta: fuelBonus,
      });
    }
    if ((tribute.production ?? 0) > 0) {
      const prodBonus = Math.min(
        25,
        Math.round(((tribute.production ?? 0) / 10) * 3),
      );
      baseOdds += prodBonus;
      breakdown.push({
        factor: `Industrial Munitions Quota (${tribute.production} PP)`,
        delta: prodBonus,
      });
    }
    if (tribute.techSharing) {
      baseOdds += 20;
      breakdown.push({
        factor: "Defense Science & Tech Sharing Concession",
        delta: 20,
      });
    }
    if (tribute.transferredFormationId) {
      baseOdds += 35;
      breakdown.push({
        factor: "Military Formation Fleet Transfer Concession",
        delta: 35,
      });
    }
    if (tribute.cededHexId) {
      baseOdds += 40;
      breakdown.push({
        factor: "Sovereign Border Hex Cession Concession",
        delta: 40,
      });
    }
  }

  // 2. Duration Penalty / Bonus
  if (durationTurns <= 30) {
    baseOdds += 10;
    breakdown.push({ factor: "Short Trial Duration (<= 30 Days)", delta: 10 });
  } else if (durationTurns >= 180) {
    baseOdds -= 10;
    breakdown.push({
      factor: "Extended Duration Commitment (>= 180 Days)",
      delta: -10,
    });
  }

  // 3. Bilateral Stance
  if (currentStance === "allied") {
    baseOdds += 15;
    breakdown.push({ factor: "Allied Bilateral Stance", delta: 15 });
  } else if (currentStance === "friendly") {
    baseOdds += 10;
    breakdown.push({ factor: "Friendly Bilateral Stance", delta: 10 });
  } else if (currentStance === "strained") {
    baseOdds -= 15;
    breakdown.push({ factor: "Strained Bilateral Relations", delta: -15 });
  } else if (currentStance === "hostile") {
    baseOdds -= 25;
    breakdown.push({ factor: "Hostile Diplomatic Tension", delta: -25 });
  } else if (currentStance === "war" && treatyType !== "ceasefire") {
    baseOdds -= 35;
    breakdown.push({ factor: "Active Belligerency (Open War)", delta: -35 });
  }

  const finalOdds = Math.max(0, Math.min(95, baseOdds));

  // Compute recommended compensatory state indemnity if odds < 60
  let counterBountyRecommendation:
    DiplomaticOddsCalculation["counterBountyRecommendation"] | undefined =
    undefined;

  if (finalOdds < 60) {
    const deficit = 60 - finalOdds;
    let demandedFunds = Math.round((200 + deficit * 7) / 25) * 25;
    let demandedFuel = Math.round((50 + deficit * 2.5) / 10) * 10;
    let demandedProduction = Math.round((20 + deficit * 1.2) / 5) * 5;
    let durationShorten =
      durationTurns > 90 ? Math.round(durationTurns * 0.5) : durationTurns;

    if (treatyType === "ceasefire") {
      demandedFunds = 450;
      demandedFuel = 100;
      demandedProduction = 50;
      durationShorten = 30;
    }

    let conditionSummary = `${targetPersona.governingBody} requires compensatory security indemnities of $${demandedFunds} treasury funds, ${demandedFuel} bbl strategic fuel allocations, and ${demandedProduction} industrial production quotas to offset sovereign defense exposure.`;
    if (treatyType === "ceasefire") {
      conditionSummary = isOpposingBloc
        ? `Armistice conditioned on $${demandedFunds} state war reparations, ${demandedFuel} bbl fleet fuel allocations, and ${demandedProduction} heavy industrial shipyard refit quotas.`
        : `Ceasefire agreement conditioned on $${demandedFunds} war damage reparations, ${demandedFuel} bbl fuel stockpile, and ${demandedProduction} production contributions.`;
    } else if (treatyType === "military_transit_rights") {
      conditionSummary =
        targetPersona.bloc === "neutral"
          ? `Armed neutrality transit authorized only with $${demandedFunds} sovereignty indemnity, ${demandedFuel} bbl coastal depot replenishment, and ${demandedProduction} radar grid maintenance quotas.`
          : `Transit corridor authorized conditioned on $${demandedFunds} security fee, ${demandedFuel} bbl naval fuel, and ${demandedProduction} maintenance quotas.`;
    }

    counterBountyRecommendation = {
      demandedFunds,
      demandedFuel,
      demandedProduction,
      durationTurns: durationShorten,
      conditionSummary,
    };
  }

  return {
    oddsPercent: finalOdds,
    baseOdds,
    breakdown,
    isHardRedline: false,
    relationshipDetails: relDetails,
    counterBountyRecommendation,
  };
}

export function validateTreatyEligibility(
  database: CampaignDatabase,
  campaignId: string,
  proposingCountryId: string,
  targetCountryId: string,
  treatyType: TreatyType,
): { eligible: boolean; reason?: string } {
  const odds = calculateTreatyOdds(
    database,
    campaignId,
    proposingCountryId,
    targetCountryId,
    treatyType,
    90,
    0,
  );
  if (odds.isHardRedline) {
    return {
      eligible: false,
      reason:
        odds.redlineReason ??
        "Diplomatic accord deemed inapplicable under current geopolitical conditions.",
    };
  }
  return { eligible: true };
}

export function processAutonomousAiDiplomacy(
  database: CampaignDatabase,
  campaignId: string,
): {
  establishedTreaties: DiplomaticTreatyRecord[];
  newsDispatches: WorldNewsDispatchRecord[];
} {
  const establishedTreaties: DiplomaticTreatyRecord[] = [];
  const newsDispatches: WorldNewsDispatchRecord[] = [];

  const potentialAccords: Array<{
    partyA: string;
    partyB: string;
    treatyType: TreatyType;
    durationTurns: number;
    agency: string;
    headline: string;
    body: string;
    category: string;
  }> = [
    {
      partyA: "united-states",
      partyB: "united-kingdom",
      treatyType: "science_tech_sharing",
      durationTurns: 180,
      agency: "REUTERS",
      headline:
        "London and Washington Finalize Atlantic Undersea Sensor & SOSUS Telemetry Accord",
      body: "The British Admiralty and the US Navy announce shared acoustic data processing across GIUK Gap underwater surveillance stations.",
      category: "TREATY",
    },
    {
      partyA: "sweden",
      partyB: "united-kingdom",
      treatyType: "trade_agreement",
      durationTurns: 120,
      agency: "REUTERS",
      headline:
        "Sweden and United Kingdom Ratify Bilateral Naval Ordnance Trade Pact",
      body: "Swedish industrial manufacturers and British shipbuilders agree to streamlined export protocols for 57mm Bofors naval gun mounts.",
      category: "TRADE",
    },
    {
      partyA: "soviet-union",
      partyB: "east-germany",
      treatyType: "joint_production_pact",
      durationTurns: 180,
      agency: "TASS",
      headline:
        "Warsaw Pact Establishes Joint Baltic Warship Shipbuilding Consortium",
      body: "Soviet naval designers and Peene-Werft Wolgast shipbuilders establish joint production lines for Parchim-class ASW corvettes.",
      category: "TRADE",
    },
    {
      partyA: "finland",
      partyB: "soviet-union",
      treatyType: "trade_agreement",
      durationTurns: 180,
      agency: "AFP",
      headline:
        "Helsinki and Moscow Sign Bilateral Commercial Barter Protocol under FCMA",
      body: "Finnish industrial conglomerates agree to supply icebreaker components and industrial machinery in exchange for crude deliveries.",
      category: "TRADE",
    },
  ];

  for (const accord of potentialAccords) {
    const countryCheck = database
      .prepare(
        `SELECT COUNT(*) as cnt FROM countries WHERE campaign_id = ? AND id IN (?, ?)`,
      )
      .get(campaignId, accord.partyA, accord.partyB) as
      { cnt: number } | undefined;
    if (!countryCheck || countryCheck.cnt < 2) {
      continue;
    }

    const active = database
      .prepare(
        `SELECT id FROM diplomatic_treaties
         WHERE campaign_id = ?
           AND ((party_a_country_id = ? AND party_b_country_id = ?) OR (party_a_country_id = ? AND party_b_country_id = ?))
           AND treaty_type = ?
           AND turns_remaining > 0
         LIMIT 1`,
      )
      .get(
        campaignId,
        accord.partyA,
        accord.partyB,
        accord.partyB,
        accord.partyA,
        accord.treatyType,
      );

    if (!active) {
      const treaty = establishDiplomaticTreaty(
        database,
        campaignId,
        accord.treatyType,
        accord.partyA,
        accord.partyB,
        accord.durationTurns,
        { autonomousAi: true },
      );
      establishedTreaties.push(treaty);

      const news = recordWorldNewsDispatch(database, campaignId, {
        agency: accord.agency,
        headline: accord.headline,
        body: accord.body,
        category: accord.category,
      });
      newsDispatches.push(news);
    }
  }

  return { establishedTreaties, newsDispatches };
}

export function hasMilitaryTransitRights(
  database: CampaignDatabase,
  campaignId: string,
  movingCountryId: string,
  targetHexCountryId: string,
): boolean {
  if (!targetHexCountryId || movingCountryId === targetHexCountryId) {
    return true;
  }
  const movingPersona = getCountryPersona(movingCountryId);
  const targetPersona = getCountryPersona(targetHexCountryId);
  // Shared coalition members (NATO / Warsaw Pact) have mutual transit rights
  if (
    movingPersona.bloc === targetPersona.bloc &&
    movingPersona.bloc !== "neutral"
  ) {
    return true;
  }

  // Check active treaties in database
  const activeTreaty = database
    .prepare(
      `SELECT treaty_type FROM diplomatic_treaties
       WHERE campaign_id = ?
         AND ((party_a_country_id = ? AND party_b_country_id = ?) OR (party_a_country_id = ? AND party_b_country_id = ?))
         AND turns_remaining > 0
         AND treaty_type IN ('military_transit_rights', 'basing_rights', 'alliance', 'mutual_defense')
       LIMIT 1`,
    )
    .get(
      campaignId,
      movingCountryId,
      targetHexCountryId,
      targetHexCountryId,
      movingCountryId,
    );

  return Boolean(activeTreaty);
}

export function hasBasingRights(
  database: CampaignDatabase,
  campaignId: string,
  unitCountryId: string,
  baseCountryId: string,
): boolean {
  if (!baseCountryId || unitCountryId === baseCountryId) {
    return true;
  }
  const unitPersona = getCountryPersona(unitCountryId);
  const basePersona = getCountryPersona(baseCountryId);
  if (unitPersona.bloc === basePersona.bloc && unitPersona.bloc !== "neutral") {
    return true;
  }

  const activeTreaty = database
    .prepare(
      `SELECT treaty_type FROM diplomatic_treaties
       WHERE campaign_id = ?
         AND ((party_a_country_id = ? AND party_b_country_id = ?) OR (party_a_country_id = ? AND party_b_country_id = ?))
         AND turns_remaining > 0
         AND treaty_type IN ('basing_rights', 'alliance', 'mutual_defense')
       LIMIT 1`,
    )
    .get(
      campaignId,
      unitCountryId,
      baseCountryId,
      baseCountryId,
      unitCountryId,
    );

  return Boolean(activeTreaty);
}
