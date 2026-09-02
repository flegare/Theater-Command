import type { ContactCategory } from "./contacts.js";

export type TrafficKind = "fishing" | "merchant" | "ferry" | "civilian_air";
export type TrafficState = "normal" | "rerouted" | "reduced" | "suspended";

export type TrafficProfile = {
  id: string;
  kind: TrafficKind;
  countryId: string;
  routeId: string;
  baseDailyCount: number;
  conflictSensitivity: number;
  contactCategory: ContactCategory;
};

export type TrafficConditions = {
  tension: number;
  routeRisk: number;
  exclusionZone: boolean;
};

export type TrafficProjection = {
  state: TrafficState;
  expectedDailyCount: number;
  contactCategory: ContactCategory;
};

export function projectTraffic(
  profile: TrafficProfile,
  conditions: TrafficConditions,
): TrafficProjection {
  const pressure = Math.max(
    0,
    Math.min(
      1,
      conditions.tension * profile.conflictSensitivity + conditions.routeRisk,
    ),
  );
  const state: TrafficState =
    conditions.exclusionZone || pressure >= 0.9
      ? "suspended"
      : pressure >= 0.65
        ? "reduced"
        : pressure >= 0.35
          ? "rerouted"
          : "normal";
  const multiplier =
    state === "suspended"
      ? 0
      : state === "reduced"
        ? 0.35
        : state === "rerouted"
          ? 0.7
          : 1;
  return {
    state,
    expectedDailyCount: Math.round(profile.baseDailyCount * multiplier),
    contactCategory: profile.contactCategory,
  };
}
