export type ContactDomain = "surface" | "air" | "subsurface";
export type ContactCategory =
  | "unknown"
  | "civilian_aircraft"
  | "military_aircraft"
  | "merchant_vessel"
  | "fishing_vessel"
  | "naval_combatant"
  | "auxiliary"
  | "submarine";
export type ContactStage =
  "unknown" | "detected" | "categorized" | "likely_identity" | "identified";
export type ContactDisposition = "unknown" | "friendly" | "neutral" | "hostile";
export type RulesOfEngagement =
  "identify_before_engage" | "hostile_fire_authorized";

export type ContactAssessment = {
  stage: ContactStage;
  category: ContactCategory;
  confidence: number;
  identity?: string;
  disposition: ContactDisposition;
};

export type Contact = {
  id: string;
  domain: ContactDomain;
  nationHint?: string;
  truthCategory: ContactCategory;
  truthIdentity?: string;
  truthDisposition: ContactDisposition;
  assessment: ContactAssessment;
  rulesOfEngagement: RulesOfEngagement;
};

export type ContactEvidence = {
  category?: ContactCategory;
  identity?: string;
  disposition?: ContactDisposition;
  confidenceDelta: number;
  source: "visual" | "radar" | "sonar" | "iff" | "comint" | "intelligence";
};

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function assessContact(
  contact: Contact,
  evidence: ContactEvidence,
): Contact {
  const confidence = bounded(
    contact.assessment.confidence + evidence.confidenceDelta,
  );
  const category = evidence.category ?? contact.assessment.category;
  const identity = evidence.identity ?? contact.assessment.identity;
  const disposition = evidence.disposition ?? contact.assessment.disposition;
  const stage: ContactStage =
    identity && confidence >= 0.8
      ? "identified"
      : category !== "unknown" && confidence >= 0.45
        ? "categorized"
        : confidence > 0
          ? "detected"
          : "unknown";
  const assessment: ContactAssessment = {
    stage,
    category,
    confidence,
    disposition,
  };
  if (identity) assessment.identity = identity;
  return {
    ...contact,
    assessment,
  };
}

export function canEngage(contact: Contact): boolean {
  if (contact.rulesOfEngagement === "hostile_fire_authorized") return true;
  return (
    contact.assessment.stage === "identified" &&
    contact.assessment.disposition === "hostile"
  );
}

export function createUnknownContact(
  input: Pick<Contact, "id" | "domain" | "rulesOfEngagement">,
): Contact {
  return {
    ...input,
    truthCategory: "unknown",
    truthDisposition: "unknown",
    assessment: {
      stage: "unknown",
      category: "unknown",
      confidence: 0,
      disposition: "unknown",
    },
  };
}
