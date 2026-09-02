export type TradeNode = {
  id: string;
  countryId: string;
  name: string;
  commodity: "fuel" | "food" | "industrial" | "military";
  dailyCapacity: number;
  dailyDemand: number;
};

export type TradeRoute = {
  id: string;
  originNodeId: string;
  destinationNodeId: string;
  countryIds: string[];
  capacity: number;
  risk: number;
  disruption: number;
};

export type TheaterLane = {
  id: string;
  routeId: string;
  kind: "shipping" | "air";
  name: string;
  commodity: TradeNode["commodity"] | "passengers";
  countryIds: string[];
  coordinates: Array<[number, number]>;
  dailyValue: number;
  dailyCapacity: number;
  disruption: number;
  region:
    | "north_atlantic"
    | "north_pacific"
    | "indian_ocean"
    | "persian_gulf"
    | "south_china_sea";
  coastal: boolean;
};

export function projectLaneEconomy(lane: TheaterLane) {
  const disruption = Math.max(0, Math.min(1, lane.disruption));
  return {
    deliveredValue: Math.round(lane.dailyValue * (1 - disruption)),
    incomeAtRisk: Math.round(lane.dailyValue * disruption),
  };
}

export type TradeProjection = {
  delivered: number;
  shortfall: number;
  risk: number;
  missionHooks: Array<"escort" | "investigate" | "interdict" | "protect_node">;
};

export function projectTrade(
  route: TradeRoute,
  origin: TradeNode,
  destination: TradeNode,
): TradeProjection {
  const available = Math.min(route.capacity, origin.dailyCapacity);
  const delivered = Math.max(
    0,
    Math.round(available * (1 - Math.max(0, Math.min(1, route.disruption)))),
  );
  const shortfall = Math.max(0, destination.dailyDemand - delivered);
  const missionHooks: TradeProjection["missionHooks"] = [];
  if (route.risk >= 0.35) missionHooks.push("escort");
  if (route.risk >= 0.6) missionHooks.push("investigate");
  if (route.disruption >= 0.4) missionHooks.push("interdict");
  if (shortfall > 0) missionHooks.push("protect_node");
  return { delivered, shortfall, risk: route.risk, missionHooks };
}
