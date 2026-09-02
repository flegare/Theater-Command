import {
  assessContact,
  canEngage,
  type Contact,
  type ContactEvidence,
} from "../domain/contacts.js";
import { projectTraffic } from "../domain/traffic.js";
import { composeLaneTraffic } from "../domain/laneTraffic.js";
import type { LaneTrafficPicture } from "../domain/laneTraffic.js";
import { projectTrade } from "../domain/trade.js";
import type { TheaterLane } from "../domain/trade.js";
import {
  northernFlankContacts,
  northernFlankTradeNodes,
  northernFlankTradeRoutes,
  northernFlankTraffic,
  northernFlankTheaterLanes,
} from "../seeds/northernFlankGameplay.js";

export type MissionBrief = {
  id: string;
  type:
    | "identify_contact"
    | "escort_trade"
    | "investigate_disruption"
    | "protect_trade_node";
  title: string;
  objective: string;
  contactIds: string[];
  tradeRouteId?: string;
  civilianTrafficExpected: number;
  engagementAuthorized: boolean;
};

export type PublicContact = {
  id: string;
  domain: Contact["domain"];
  stage: Contact["assessment"]["stage"];
  category: Contact["assessment"]["category"];
  confidence: number;
  disposition: Contact["assessment"]["disposition"];
};

export type NorthernFlankSituation = {
  tension: number;
  routeRisk: number;
  hoursSinceStart: number;
};

export type LaneAction = "escort" | "secure" | "investigate" | "interdict";

export function applyLaneAction(routeRisk: number, action: LaneAction): number {
  const adjustment = {
    escort: -0.2,
    secure: -0.35,
    investigate: -0.1,
    interdict: 0.4,
  }[action];
  return Number(Math.max(0, Math.min(1, routeRisk + adjustment)).toFixed(3));
}

export function northernFlankSituation(
  campaignTime: string,
  startTime: string,
): NorthernFlankSituation {
  const elapsed = Math.max(
    0,
    Math.floor((Date.parse(campaignTime) - Date.parse(startTime)) / 3_600_000),
  );
  const escalation = Math.min(1, elapsed / 168);
  return {
    hoursSinceStart: elapsed,
    tension: Number((0.25 + escalation * 0.45).toFixed(3)),
    routeRisk: Number((0.25 + escalation * 0.55).toFixed(3)),
  };
}

export function northernFlankBrief(
  tension: number,
  routeRisk: number,
  laneDisruption = routeRisk,
  playerCountryId = "norway",
): {
  contacts: PublicContact[];
  missions: MissionBrief[];
  traffic: ReturnType<typeof projectTraffic>[];
  trade: ReturnType<typeof projectTrade>;
  lanes: TheaterLane[];
  laneTraffic: LaneTrafficPicture[];
} {
  const conditions = { tension, routeRisk, exclusionZone: false };
  const traffic = northernFlankTraffic.map((profile) =>
    projectTraffic(profile, conditions),
  );
  const route = northernFlankTradeRoutes[0];
  if (!route) throw new Error("Northern Flank trade fixture is incomplete.");
  const origin = northernFlankTradeNodes.find(
    (node) => node.id === route.originNodeId,
  );
  const destination = northernFlankTradeNodes.find(
    (node) => node.id === route.destinationNodeId,
  );
  if (!origin || !destination)
    throw new Error("Northern Flank trade fixture is incomplete.");
  const trade = projectTrade(
    { ...route, risk: routeRisk, disruption: laneDisruption },
    origin,
    destination,
  );
  const truthContacts = northernFlankContacts.map((contact) => ({
    ...contact,
    assessment: { ...contact.assessment },
  }));
  const missions: MissionBrief[] = [];
  for (const contact of truthContacts) {
    if (contact.assessment.stage !== "identified") {
      missions.push({
        id: `identify-${contact.id}`,
        type: "identify_contact",
        title: `Identify ${contact.assessment.category === "unknown" ? "unknown contact" : contact.assessment.category.replaceAll("_", " ")}`,
        objective:
          "Classify and identify the contact before any engagement decision.",
        contactIds: [contact.id],
        civilianTrafficExpected: traffic.reduce(
          (sum, item) => sum + item.expectedDailyCount,
          0,
        ),
        engagementAuthorized: canEngage(contact),
      });
    }
  }
  if (trade.missionHooks.includes("escort"))
    missions.push({
      id: "escort-bergen-scapa",
      type: "escort_trade",
      title: "Escort the Bergen–Scapa fuel route",
      objective:
        "Protect merchant traffic while preserving identification discipline.",
      contactIds: ["nf-merchant-01"],
      tradeRouteId: route.id,
      civilianTrafficExpected: traffic[1]?.expectedDailyCount ?? 0,
      engagementAuthorized: false,
    });
  if (trade.missionHooks.includes("investigate"))
    missions.push({
      id: "investigate-trade-disruption",
      type: "investigate_disruption",
      title: "Investigate trade-route disruption",
      objective:
        "Determine why the fuel route is becoming unsafe without escalating against neutral traffic.",
      contactIds: ["nf-fishing-01", "nf-merchant-01"],
      tradeRouteId: route.id,
      civilianTrafficExpected: traffic[0]?.expectedDailyCount ?? 0,
      engagementAuthorized: false,
    });
  const contacts: PublicContact[] = truthContacts.map((contact) => ({
    id: contact.id,
    domain: contact.domain,
    stage: contact.assessment.stage,
    category: contact.assessment.category,
    confidence: contact.assessment.confidence,
    disposition: contact.assessment.disposition,
  }));
  const lanes = northernFlankTheaterLanes.map((lane) => ({
    ...lane,
    disruption: laneDisruption,
  }));
  const laneTraffic = lanes.map((lane) =>
    composeLaneTraffic(lane, laneDisruption, playerCountryId),
  );
  return { contacts, missions, traffic, trade, lanes, laneTraffic };
}

export function applyEvidence(
  contact: Contact,
  evidence: ContactEvidence,
): Contact {
  return assessContact(contact, evidence);
}
