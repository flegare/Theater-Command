import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { renderNativeMissionIni } from "../../src/domain/nativeMission.js";
import {
  coordinatesToAxial,
  getAllBalticCoreHexCells,
  getHexCellDefinition,
  getHexIdForAxial,
  latLonToMercator,
  MERCATOR_SPACING_X,
  MERCATOR_SPACING_Y,
  type StrategicHexCell,
} from "../../src/domain/hexGrid.js";
import {
  FORMATION_ARCHETYPES,
  isWaterTerrain,
  type FormationUnitType,
  type CampaignFormation,
  type ActiveMovementRoute,
} from "../../src/domain/militaryFormations.js";
import {
  getFlotillaComposition,
  recalculateCompositionTotals,
  calculateCompositionCost,
  filterAssetsByTimeline,
  getAvailableModernizations,
  getUnitBaseStats,
  AVAILABLE_VANILLA_ASSETS,
  HIERARCHICAL_CATALOG_GROUPS,
  type FlotillaComposition,
  type FlotillaSubCategory,
  type FlotillaUnit,
  type AvailableAssetCatalogItem,
} from "../../src/domain/flotillaComposition.js";
import {
  findFormationHexPath,
  type HexPathResult,
} from "../../src/domain/hexPathfinding.js";
import {
  COLD_WAR_MARKET_CATALOG,
  type MilitaryMarketListing,
  type MarketOrderRecord,
} from "../../src/domain/militaryMarket.js";
import { type DiplomaticTreatyRecord } from "../../src/domain/diplomacy.js";
import { COVERT_OPS_CATALOG } from "../../src/domain/covertOperations.js";

type Catalog = {
  theaters: Array<{ id: string; name: string; summary: string }>;
  family: { id: string; name: string; summary: string };
  variants: Array<{
    id: string;
    label: string;
    startDate: string;
    summary: string;
    situation?: string;
    commandGuidance?: string;
    capabilities: string[];
  }>;
  countries: Array<{
    id: string;
    name: string;
    coalitionId: string;
    commandScope: string;
    objectives: string[];
  }>;
  coalitions: Array<{ id: string; name: string; side: string }>;
};
type StrategicSite = {
  id: string;
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
type TheaterLane = {
  id: string;
  routeId: string;
  kind: "shipping" | "air";
  name: string;
  commodity: string;
  countryIds: string[];
  coordinates: Array<[number, number]>;
  dailyValue: number;
  dailyCapacity: number;
  disruption: number;
};
type Session = {
  name: string;
  campaignTime: string;
  countryId: string;
  countryName: string;
  objectives: string[];
  difficulty: string;
  techMode: string;
  status: string;
  strategicSites: StrategicSite[];
  theaterLanes?: TheaterLane[];
  theaterName: string;
  theaterSummary: string;
  situation: string;
  commandGuidance: string;
  commandScope: string;
  scenarioFamilyId: string;
  variantStartDate: string;
};
type WorldRecord = {
  id: string;
  name: string;
  type?: string;
  latitude?: number;
  longitude?: number;
  geometry?: { type: string; coordinates: unknown };
};
type WorldZone = {
  layers: Record<
    string,
    { records: WorldRecord[]; total: number; truncated: boolean }
  >;
};
type MissionContact = {
  id: string;
  domain: string;
  stage: string;
  category: string;
  confidence: number;
  disposition: string;
};
type CampaignMission = {
  id: string;
  type: string;
  title: string;
  objective: string;
  contactIds: string[];
  tradeRouteId?: string;
  civilianTrafficExpected: number;
  engagementAuthorized: boolean;
};
type MissionBrief = {
  contacts: MissionContact[];
  missions: CampaignMission[];
  traffic: Array<{ state: string; expectedDailyCount: number }>;
  trade: {
    delivered: number;
    shortfall: number;
    risk: number;
    missionHooks: string[];
  };
  lanes: TheaterLane[];
  laneTraffic: LaneTrafficPicture[];
};
type LaneAction = "escort" | "secure" | "investigate" | "interdict";
type LaneTrafficSpawn = {
  id: string;
  kind: "merchant" | "cruise" | "fishing" | "civilian_air";
  domain: string;
  category: string;
  nationality: string;
  expectedDailyCount: number;
  disposition: string;
  identificationRequired: boolean;
  flavor: string;
};
type LaneEncounter = {
  id: string;
  title: string;
  objective: string;
  contactCategory: string;
  contactNation?: string;
  hostile: boolean;
  engagementAuthorized: false;
  roe: string;
};
type LaneTrafficPicture = {
  laneId: string;
  traffic: LaneTrafficSpawn[];
  encounters: LaneEncounter[];
};
type GeneratedLaneUnit = {
  id: string;
  role: "civilian" | "neutral" | "possible_military";
  category: string;
  countryId: string;
  position: [number, number];
  directionVector: [number, number];
  bearingDegrees: number;
  identificationRequired: boolean;
  placeholder: true;
  spawnZoneId?: string;
};
type GeneratedLaneMission = {
  id: string;
  title: string;
  laneId: string;
  laneName: string;
  seed: string;
  playerCountryId: string;
  origin: [number, number];
  candidateCountries: string[];
  directionVector: [number, number];
  bearingDegrees: number;
  waypoints: Array<[number, number]>;
  units: GeneratedLaneUnit[];
  guidance: string;
};
type InstalledMission = {
  fileName: string;
  installedPath: string;
  missionId: string;
};
type CampaignState = {
  economy: {
    funds: number;
    productionPoints?: number;
    fuelStockpile?: number;
    projectedDailyDelta: number;
  };
  entities: Array<{
    id: string;
    entityType: string;
    side: string;
    tag: string;
    displayName: string;
    status: string;
    quantity: number;
    metadata: Record<string, unknown>;
  }>;
};
type CampaignStateEntity = CampaignState["entities"][number];

type HexTurnEconomySummary = {
  grossFunds: number;
  grossProduction: number;
  grossFuel: number;
  upkeepFunds: number;
  fuelConsumption: number;
  netFundsDelta: number;
  netProductionDelta: number;
  netFuelDelta: number;
  controlledHexCount: number;
};

type HexGridStateSnapshot = {
  hexCells: StrategicHexCell[];
  formations: CampaignFormation[];
  economy: {
    funds: number;
    productionPoints: number;
    fuelStockpile: number;
    projectedDailyFundsDelta: number;
    projectedDailyProductionDelta: number;
    projectedDailyFuelDelta: number;
  };
  turnSummary: HexTurnEconomySummary;
};
type SectorSnapshot = {
  theaterId: string;
  playerSide: "blufor" | "opfor";
  sectors: Array<{
    id: string;
    name: string;
    summary: string;
    center: { latitude: number; longitude: number };
    polygon?: Array<[number, number]>;
    owner: {
      type: "country" | "alliance";
      id: string;
      label: string;
      side: "blufor" | "opfor";
    };
    laneRouteIds: string[];
    strategicSiteIds: string[];
    baseEconomicValue: number;
    pointValue: number;
    actions: string[];
    hooks: {
      unitCategories: string[];
      strategicCategories: string[];
    };
    assigned: {
      units: number;
      strategicAssets: number;
    };
    strategicSiteStatus: Array<{
      strategicSiteId: string;
      status: "active" | "damaged" | "destroyed" | "missing";
    }>;
  }>;
};
type MapBounds = { west: number; south: number; east: number; north: number };

const AA_SITE_PURCHASE_COST = 180;

function slugToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleToken(value: string): string {
  if (!value) return "Unknown";
  return value
    .split("-")
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function textMeta(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function numericMeta(
  metadata: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function theaterMapBounds(theaterId: string): MapBounds {
  switch (theaterId) {
    case "north-pacific":
      return { west: 125, south: 20, east: 175, north: 60 };
    case "persian-gulf":
      return { west: 40, south: 10, east: 65, north: 35 };
    case "indian-ocean":
      return { west: 40, south: -15, east: 120, north: 35 };
    default:
      return { west: -30, south: 50, east: 40, north: 75 };
  }
}

function coalitionLabel(value: string): string {
  const labels: Record<string, string> = {
    nato: "NATO",
    "warsaw-pact": "WARSAW PACT",
    allied: "ALLIED",
    aligned: "ALIGNED",
    conditional: "CONDITIONAL",
    belligerent: "BELLIGERENT",
    "non-aligned": "NON-ALIGNED",
  };
  return labels[value] ?? value.replaceAll("-", " ").toUpperCase();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      { error?: { message?: string } } | undefined;
    throw new Error(body?.error?.message ?? "Theater command request failed.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function exportLaneMission(mission: GeneratedLaneMission): void {
  const fileName = `${mission.laneId}-${mission.seed}`
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  const blob = new Blob([renderNativeMissionIni(mission)], {
    type: "text/plain",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName || "lane-mission"}.ini`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function App(): ReactElement {
  const queryClient = useQueryClient();
  const [theaterId, setTheaterId] = useState("northern-flank");
  const catalog = useQuery({
    queryKey: ["catalog", theaterId],
    queryFn: () => api<Catalog>(`/api/v1/setup/catalog?theaterId=${theaterId}`),
  });
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<Session>("/api/v1/session"),
    retry: false,
  });
  const [variantId, setVariantId] = useState("nf-1983");
  const [countryId, setCountryId] = useState("norway");
  const [seed, setSeed] = useState("northern-watch-83");
  const [difficulty, setDifficulty] = useState("standard");
  const [techMode, setTechMode] = useState("historical");
  const [returningToSetup, setReturningToSetup] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      api<{ campaignId: string }>("/api/v1/campaigns", {
        method: "POST",
        body: JSON.stringify({
          scenarioFamilyId: theaterId,
          variantId,
          countryId,
          seed,
          difficulty,
          techMode,
        }),
      }),
    onSuccess: () => {
      queryClient.clear();
      setReturningToSetup(false);
      session.refetch();
    },
  });

  const selectedVariant = useMemo(
    () => catalog.data?.variants.find((variant) => variant.id === variantId),
    [catalog.data, variantId],
  );
  const selectedCountry = useMemo(
    () => catalog.data?.countries.find((country) => country.id === countryId),
    [catalog.data, countryId],
  );

  useEffect(() => {
    if (
      catalog.data &&
      !catalog.data.variants.some((entry) => entry.id === variantId)
    )
      setVariantId(catalog.data.variants[0]?.id ?? "nf-1983");
  }, [catalog.data, variantId]);

  useEffect(() => {
    if (
      catalog.data &&
      !catalog.data.countries.some((entry) => entry.id === countryId)
    ) {
      setCountryId(catalog.data.countries[0]?.id ?? "");
    }
  }, [catalog.data, countryId]);

  if (session.data && !returningToSetup)
    return (
      <CommandCenter
        key={
          (session.data as Session & { campaignId?: string }).campaignId ??
          session.data.countryId + session.data.campaignTime + session.data.name
        }
        session={session.data}
        onLeave={async () => {
          await api<void>("/api/v1/session", { method: "DELETE" });
          queryClient.clear();
          setReturningToSetup(true);
        }}
      />
    );
  if (catalog.isLoading)
    return <main className="loading">Loading theater catalog...</main>;
  if (catalog.isError || !catalog.data)
    return (
      <main className="loading">
        Campaign catalog is unavailable. Start the local campaign server and
        reload.
      </main>
    );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate();
  }
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">THEATER COMMAND</p>
          <h1>Sea Power</h1>
        </div>
        <div className="header-status">
          <span className="status-dot" />
          Offline campaign foundation
        </div>
      </header>
      <section className="setup-layout" aria-labelledby="setup-title">
        <div className="setup-intro">
          <p className="eyebrow">NEW CAMPAIGN</p>
          <h2 id="setup-title">Assume national command</h2>
          <p>{catalog.data.family.summary}</p>
        </div>
        <form className="setup-form" onSubmit={submit}>
          <label>
            Theater
            <select
              aria-label="Theater"
              value={theaterId}
              onChange={(event) => {
                setTheaterId(event.target.value);
                setVariantId("");
                setCountryId("");
              }}
            >
              {catalog.data.theaters.map((theater) => (
                <option value={theater.id} key={theater.id}>
                  {theater.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Alternate date</legend>
            <div className="choice-grid">
              {catalog.data.variants.map((variant) => (
                <label
                  className={`choice ${variant.id === variantId ? "selected" : ""}`}
                  key={variant.id}
                >
                  <input
                    aria-label={`${variant.label} alternate date`}
                    type="radio"
                    name="variant"
                    value={variant.id}
                    checked={variant.id === variantId}
                    onChange={() => setVariantId(variant.id)}
                  />
                  <strong>{variant.label}</strong>
                  <span>{variant.summary}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>National perspective</legend>
            <div className="country-grid">
              {catalog.data.countries.map((country) => (
                <label
                  className={`country-choice ${country.id === countryId ? "selected" : ""}`}
                  key={country.id}
                >
                  <input
                    aria-label={`${country.name} ${coalitionLabel(country.coalitionId)}`}
                    type="radio"
                    name="country"
                    value={country.id}
                    checked={country.id === countryId}
                    onChange={() => setCountryId(country.id)}
                  />
                  <strong>{country.name}</strong>
                  <span>{coalitionLabel(country.coalitionId)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field-row">
            <label>
              Difficulty
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
              >
                <option value="standard">Standard</option>
                <option value="challenging">Challenging</option>
                <option value="hardcore">Hardcore</option>
              </select>
            </label>
            <label>
              Technology
              <select
                value={techMode}
                onChange={(event) => setTechMode(event.target.value)}
              >
                <option value="historical">Historical</option>
                <option value="what-if">What if</option>
              </select>
            </label>
            <label>
              Campaign seed
              <input
                value={seed}
                minLength={3}
                maxLength={64}
                onChange={(event) => setSeed(event.target.value)}
                required
              />
            </label>
          </div>
          <section className="briefing">
            <p className="eyebrow">COMMAND BRIEF</p>
            <h3>
              {selectedCountry?.name} / {selectedVariant?.label}
            </h3>
            <p className="briefing-context">
              {selectedVariant?.situation ?? selectedVariant?.summary}
            </p>
            <p>{selectedCountry?.commandScope}</p>
            <ul>
              {selectedCountry?.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
            <p className="briefing-guidance">
              {selectedVariant?.commandGuidance}
            </p>
            <div className="capabilities">
              {selectedVariant?.capabilities.map((capability) => (
                <span key={capability}>{capability}</span>
              ))}
            </div>
          </section>
          {create.isError && (
            <p className="form-error">{create.error.message}</p>
          )}
          <button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating campaign..." : "Begin campaign"}
          </button>
        </form>
      </section>
    </main>
  );
}

function CommandCenter({
  session,
  onLeave,
}: {
  session: Session;
  onLeave: () => Promise<void>;
}): ReactElement {
  const queryClient = useQueryClient();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const leave = useMutation({
    mutationFn: onLeave,
    onSuccess: () => setConfirmingLeave(false),
  });
  const initialMapBounds = useMemo(
    () => theaterMapBounds(session.scenarioFamilyId),
    [session.scenarioFamilyId],
  );
  const [mapBounds, setMapBounds] = useState<MapBounds>(initialMapBounds);
  const onViewportChange = useCallback((bounds: MapBounds) => {
    setMapBounds((previous) =>
      Math.abs(previous.west - bounds.west) < 0.1 &&
      Math.abs(previous.south - bounds.south) < 0.1 &&
      Math.abs(previous.east - bounds.east) < 0.1 &&
      Math.abs(previous.north - bounds.north) < 0.1
        ? previous
        : bounds,
    );
  }, []);
  const world = useQuery({
    queryKey: ["world-zone", mapBounds],
    queryFn: () =>
      api<WorldZone>(
        `/api/v1/world/zone?west=${mapBounds.west}&south=${mapBounds.south}&east=${mapBounds.east}&north=${mapBounds.north}&layers=countries,regions,places,ports,airports&limit=180`,
      ),
  });
  const campaignState = useQuery({
    queryKey: [
      "campaign-state",
      session.scenarioFamilyId,
      session.name,
      session.countryId,
    ],
    queryFn: () => api<CampaignState>("/api/v1/campaigns/current/state"),
  });
  const missionBrief = useQuery({
    queryKey: [
      "campaign-missions",
      session.scenarioFamilyId,
      session.name,
      session.countryId,
    ],
    queryFn: () =>
      api<MissionBrief & { tension: number; routeRisk: number }>(
        "/api/v1/campaigns/current/missions",
      ),
  });
  const sectors = useQuery({
    queryKey: [
      "campaign-sectors",
      session.scenarioFamilyId,
      session.name,
      session.countryId,
    ],
    queryFn: () => api<SectorSnapshot>("/api/v1/campaigns/current/sectors"),
  });
  const hexGrid = useQuery({
    queryKey: [
      "campaign-hex-grid",
      session.scenarioFamilyId,
      session.name,
      session.countryId,
    ],
    queryFn: () =>
      api<HexGridStateSnapshot>("/api/v1/campaigns/current/hex-grid"),
  });
  const [selectedLaneId, setSelectedLaneId] = useState<string | undefined>();
  const [generatedMission, setGeneratedMission] =
    useState<GeneratedLaneMission>();
  const [installedMission, setInstalledMission] = useState<InstalledMission>();
  const createMissionSeed = () =>
    `${session.name}:${Date.now().toString(36)}:${crypto.randomUUID().slice(0, 8)}`;
  const laneAction = useMutation({
    mutationFn: (input: { action: LaneAction; routeId: string }) =>
      api<{ disruption: number }>("/api/v1/campaigns/current/lane-actions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => missionBrief.refetch(),
  });
  const laneMission = useMutation({
    mutationFn: (input: { routeId: string; seed: string }) =>
      api<GeneratedLaneMission>("/api/v1/campaigns/current/lane-missions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: setGeneratedMission,
  });
  const installMission = useMutation({
    mutationFn: (input: { routeId: string; seed: string }) =>
      api<InstalledMission>("/api/v1/campaigns/current/lane-missions/install", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: setInstalledMission,
  });
  const aaPurchase = useMutation({
    mutationFn: (input: { regionKey: string }) =>
      api<{
        entityId: string;
        regionKey: string;
        purchaseCost: number;
        fundsRemaining: number;
      }>("/api/v1/campaigns/current/state/aa-sites/purchase", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => campaignState.refetch(),
  });
  const moveFormation = useMutation({
    mutationFn: (input: { formationId: string; targetHexId: string }) =>
      api<{ ok: boolean; contested?: boolean }>(
        `/api/v1/campaigns/current/formations/${input.formationId}/move`,
        {
          method: "POST",
          body: JSON.stringify({ targetHexId: input.targetHexId }),
        },
      ),
    onSuccess: () => hexGrid.refetch(),
  });
  const issueMovementOrder = useMutation({
    mutationFn: (input: { formationId: string; targetHexId: string }) =>
      api<{
        ok: boolean;
        route?: ActiveMovementRoute;
        formation?: CampaignFormation;
        contested?: boolean;
      }>(
        `/api/v1/campaigns/current/formations/${input.formationId}/movement-order`,
        {
          method: "POST",
          body: JSON.stringify({ targetHexId: input.targetHexId }),
        },
      ),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
    },
  });
  const cancelMovementOrder = useMutation({
    mutationFn: (input: { formationId: string }) =>
      api<{ ok: boolean; formation?: CampaignFormation }>(
        `/api/v1/campaigns/current/formations/${input.formationId}/movement-order`,
        {
          method: "DELETE",
        },
      ),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
    },
  });
  const embarkFormation = useMutation({
    mutationFn: (input: { formationId: string; sealiftFormationId: string }) =>
      api<{ ok: boolean }>(
        `/api/v1/campaigns/current/formations/${input.formationId}/embark`,
        {
          method: "POST",
          body: JSON.stringify({
            sealiftFormationId: input.sealiftFormationId,
          }),
        },
      ),
    onSuccess: () => hexGrid.refetch(),
  });
  const disembarkFormation = useMutation({
    mutationFn: (input: { formationId: string; targetHexId: string }) =>
      api<{ ok: boolean }>(
        `/api/v1/campaigns/current/formations/${input.formationId}/disembark`,
        {
          method: "POST",
          body: JSON.stringify({ targetHexId: input.targetHexId }),
        },
      ),
    onSuccess: () => hexGrid.refetch(),
  });
  const dismissMovementOrder = useMutation({
    mutationFn: (input: { formationId: string }) =>
      api<{ ok: boolean }>(
        `/api/v1/campaigns/current/formations/${input.formationId}/movement-order/dismiss`,
        {
          method: "DELETE",
        },
      ),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
    },
  });
  const refuelRearmFormation = useMutation({
    mutationFn: (input: { formationId: string }) =>
      api<{ ok: boolean; fundsCost?: number; fuelCost?: number }>(
        `/api/v1/campaigns/current/formations/${input.formationId}/refuel-rearm`,
        {
          method: "POST",
        },
      ),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
    },
  });
  const restRefitFormation = useMutation({
    mutationFn: (input: { formationId: string }) =>
      api<{ ok: boolean }>(
        `/api/v1/campaigns/current/formations/${input.formationId}/rest-refit`,
        {
          method: "POST",
        },
      ),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
    },
  });
  const trainFormation = useMutation({
    mutationFn: (input: { formationId: string; turns?: number }) =>
      api<{ ok: boolean }>(
        `/api/v1/campaigns/current/formations/${input.formationId}/train`,
        {
          method: "POST",
          body: JSON.stringify({ turns: input.turns ?? 1 }),
        },
      ),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
    },
  });
  const engageHex = useMutation({
    mutationFn: (input: { hexId: string; missionTitle?: string }) =>
      api<{
        ok: boolean;
        missionText: string;
        filePath?: string;
        unitsCount: number;
      }>(`/api/v1/campaigns/current/hex-cells/${input.hexId}/engage`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
    },
  });
  const advanceDay = useMutation({
    mutationFn: () =>
      api<{ campaignTime: string; fundsDelta: number; funds: number }>(
        "/api/v1/campaigns/current/state/advance-day",
        {
          method: "POST",
        },
      ),
    onSuccess: (data) => {
      console.log("advanceDay onSuccess data:", data);
      if (data?.campaignTime) {
        queryClient.setQueryData(["session"], (old: Session | undefined) =>
          old ? { ...old, campaignTime: data.campaignTime } : old,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["session"] });
      missionBrief.refetch();
      campaignState.refetch();
      sectors.refetch();
      hexGrid.refetch();
      queryClient.invalidateQueries({ queryKey: ["diplomacyCables"] });
      queryClient.invalidateQueries({ queryKey: ["diplomacyWorldNews"] });
      queryClient.invalidateQueries({ queryKey: ["diplomacyTreaties"] });
    },
  });
  const sectorPurchase = useMutation({
    mutationFn: (input: {
      sectorId: string;
      assetKind: "unit" | "strategic";
      category: string;
      displayName: string;
      cost: number;
      dailyFundsDelta?: number;
    }) =>
      api<{ entityId: string; fundsRemaining: number; cost: number }>(
        `/api/v1/campaigns/current/sectors/${input.sectorId}/assets/purchase`,
        {
          method: "POST",
          body: JSON.stringify({
            assetKind: input.assetKind,
            category: input.category,
            displayName: input.displayName,
            cost: input.cost,
            ...(input.dailyFundsDelta !== undefined
              ? { dailyFundsDelta: input.dailyFundsDelta }
              : {}),
          }),
        },
      ),
    onSuccess: () => {
      campaignState.refetch();
      sectors.refetch();
    },
  });
  const [isRecruiting, setIsRecruiting] = useState(false);
  const recruitFormationMutation = useMutation({
    mutationFn: (input: {
      unitType: FormationUnitType;
      hexId: string;
      customName?: string | undefined;
    }) =>
      api<{ ok: boolean; formation: CampaignFormation }>(
        "/api/v1/campaigns/current/formations/recruit",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
      setIsRecruiting(false);
    },
  });

  const [editingFormation, setEditingFormation] =
    useState<CampaignFormation | null>(null);

  const updateFormationMutation = useMutation({
    mutationFn: (input: {
      formationId: string;
      name?: string;
      customComposition?: FlotillaComposition;
    }) =>
      api<{ ok: boolean; formation: CampaignFormation }>(
        `/api/v1/campaigns/current/formations/${input.formationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: input.name,
            customComposition: input.customComposition,
          }),
        },
      ),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
      setEditingFormation(null);
    },
  });

  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [isTreatiesOpen, setIsTreatiesOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isCovertOpsOpen, setIsCovertOpsOpen] = useState(false);
  const [latestNegotiation, setLatestNegotiation] =
    useState<DiplomaticNegotiationResponse | null>(null);
  const [diplomacyError, setDiplomacyError] = useState<string | null>(null);

  const ollamaStatus = useQuery({
    queryKey: ["ollamaStatus"],
    queryFn: () =>
      api<{ ok: boolean; status: OllamaStatus }>(
        "/api/v1/campaigns/current/ai/ollama/status",
      ),
    refetchInterval: 10000,
  });

  const campaignTension = useQuery({
    queryKey: ["campaignTension"],
    queryFn: () =>
      api<{ ok: boolean; tension: CampaignTensionState }>(
        "/api/v1/campaigns/current/tensions",
      ),
  });

  const covertOps = useQuery({
    queryKey: ["covertOps"],
    queryFn: () =>
      api<{
        ok: boolean;
        catalog: CovertOpCatalogListing[];
        operations: CovertOperationRecord[];
      }>("/api/v1/campaigns/current/covert-ops"),
    enabled: isCovertOpsOpen,
  });

  const launchCovertOpMutation = useMutation({
    mutationFn: (input: {
      targetCountryId: string;
      targetHexId: string;
      opType: CovertOpType;
    }) =>
      api<{ ok: boolean; message: string }>(
        "/api/v1/campaigns/current/covert-ops/launch",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: (data) => {
      hexGrid.refetch();
      campaignState.refetch();
      campaignTension.refetch();
      covertOps.refetch();
      alert(`[CLANDESTINE OPERATION EXECUTED]\n${data.message}`);
    },
  });

  const marketCatalog = useQuery({
    queryKey: ["marketCatalog"],
    queryFn: () =>
      api<{
        ok: boolean;
        catalog: MilitaryMarketListing[];
        pendingOrders: MarketOrderRecord[];
      }>("/api/v1/campaigns/current/market/catalog"),
    enabled: isMarketOpen,
  });

  const purchaseSurplusMutation = useMutation({
    mutationFn: (input: {
      listingId: string;
      targetHexId: string;
      customName?: string | undefined;
    }) =>
      api<{ ok: boolean; order: unknown }>(
        "/api/v1/campaigns/current/market/purchase",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
      marketCatalog.refetch();
      setIsMarketOpen(false);
    },
  });

  const diplomacyTreaties = useQuery({
    queryKey: ["diplomacyTreaties"],
    queryFn: () =>
      api<{ ok: boolean; treaties: DiplomaticTreatyRecord[] }>(
        "/api/v1/campaigns/current/diplomacy/treaties",
      ),
    enabled: isTreatiesOpen,
  });

  const negotiateTreatyMutation = useMutation({
    mutationFn: (input: {
      treatyType: string;
      targetCountryId: string;
      durationTurns: number;
      offeredTributeFunds?: number | undefined;
      tribute?: TributePackage | undefined;
    }) =>
      api<{ ok: boolean; negotiation: DiplomaticNegotiationResponse }>(
        "/api/v1/campaigns/current/diplomacy/negotiate",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    onError: (err: unknown) => {
      setDiplomacyError(
        err instanceof Error ? err.message : "Diplomatic negotiation failed.",
      );
    },
    onSuccess: (data) => {
      setDiplomacyError(null);
      diplomacyTreaties.refetch();
      campaignTension.refetch();
      hexGrid.refetch();
      campaignState.refetch();
      setLatestNegotiation(data.negotiation);
    },
  });

  const diplomacyCables = useQuery({
    queryKey: ["diplomacyCables"],
    queryFn: () =>
      api<{
        ok: boolean;
        cables: DiplomaticCable[];
        unreadCount?: number;
      }>("/api/v1/campaigns/current/diplomacy/cables"),
    refetchInterval: 15000,
  });

  const diplomacyWorldNews = useQuery({
    queryKey: ["diplomacyWorldNews"],
    queryFn: () =>
      api<{ ok: boolean; dispatches: WorldNewsDispatch[] }>(
        "/api/v1/campaigns/current/diplomacy/world-news",
      ),
    refetchInterval: 15000,
  });

  const markCablesReadMutation = useMutation({
    mutationFn: (cableIds?: string[]) =>
      api<{ ok: boolean; updatedCount: number }>(
        "/api/v1/campaigns/current/diplomacy/cables/mark-read",
        {
          method: "POST",
          body: JSON.stringify({ cableIds }),
        },
      ),
    onSuccess: () => {
      diplomacyCables.refetch();
    },
  });

  const acceptCounterOfferMutation = useMutation({
    mutationFn: (input: {
      targetCountryId: string;
      treatyType: string;
      durationTurns: number;
      demandedFunds?: number | undefined;
      demandedFuel?: number | undefined;
      demandedProduction?: number | undefined;
      conditionSummary?: string | undefined;
    }) =>
      api<{
        ok: boolean;
        ratifiedTreaty?: DiplomaticTreatyRecord;
        falloutCables?: DiplomaticCable[];
      }>("/api/v1/campaigns/current/diplomacy/counter-offer/accept", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onError: (err: unknown) => {
      setDiplomacyError(
        err instanceof Error ? err.message : "Failed to accept counter-offer.",
      );
    },
    onSuccess: (data) => {
      setDiplomacyError(null);
      diplomacyTreaties.refetch();
      diplomacyCables.refetch();
      campaignTension.refetch();
      hexGrid.refetch();
      campaignState.refetch();
      if (latestNegotiation) {
        setLatestNegotiation({
          ...latestNegotiation,
          decision: "accept",
          reasoning: "Counter-offer terms accepted and funds/fuel delivered.",
          diplomaticDialogue:
            "Counter-terms ratified. Bilateral treaty is now in effect.",
          counterTerms: undefined,
          ratifiedTreaty: data.ratifiedTreaty,
          thirdPartyFalloutCables: data.falloutCables,
        });
      }
    },
  });

  const declineCounterOfferMutation = useMutation({
    mutationFn: (input: {
      targetCountryId: string;
      treatyType: string;
      reason?: string;
    }) =>
      api<{
        ok: boolean;
        cableRecorded?: DiplomaticCable;
        updatedRelations?: BilateralRelationshipDetails;
      }>("/api/v1/campaigns/current/diplomacy/counter-offer/decline", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      diplomacyCables.refetch();
      diplomacyTreaties.refetch();
      campaignState.refetch();
      if (latestNegotiation) {
        setLatestNegotiation({
          ...latestNegotiation,
          decision: "reject",
          reasoning:
            "Foreign compensatory indemnity demands formally declined by leadership.",
          diplomaticDialogue:
            "Plenipotentiary talks suspended. Indemnity demands refused.",
          counterTerms: undefined,
        });
      }
    },
  });

  const upgradeHexInvestmentMutation = useMutation({
    mutationFn: (hexId: string) =>
      api<{ ok: boolean }>(
        `/api/v1/campaigns/current/hex-cells/${encodeURIComponent(hexId)}/investment/upgrade`,
        {
          method: "POST",
        },
      ),
    onSuccess: () => {
      hexGrid.refetch();
      campaignState.refetch();
    },
  });

  const currentDefcon = campaignTension.data?.tension.defconLevel ?? 5;
  const currentTensionIndex = campaignTension.data?.tension.tensionIndex ?? 20;

  const defconColors = {
    5: {
      bg: "#166534",
      border: "#22c55e",
      text: "DEFCON 5: NORMAL PEACETIME WATCH",
    },
    4: {
      bg: "#155e75",
      border: "#06b6d4",
      text: "DEFCON 4: INCREASED INTELLIGENCE WATCH",
    },
    3: {
      bg: "#854d0e",
      border: "#eab308",
      text: "DEFCON 3: AIR FORCE READY IN 15 MIN",
    },
    2: {
      bg: "#9a3412",
      border: "#f97316",
      text: "DEFCON 2: FORCES READY TO DEPLOY IN 6 HOURS",
    },
    1: {
      bg: "#991b1b",
      border: "#ef4444",
      text: "DEFCON 1: MAXIMUM ALERT / IMMINENT WAR",
    },
  };

  const activeDefconConfig = defconColors[currentDefcon] || defconColors[5];

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">THEATER COMMAND / ACTIVE CAMPAIGN</p>
          <h1>{session.countryName}</h1>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {ollamaStatus.data?.status.online ? (
            <div
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                borderRadius: "4px",
                background: "rgba(34, 197, 94, 0.2)",
                border: "1px solid #22c55e",
                color: "#4ade80",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span className="status-dot" style={{ background: "#22c55e" }} />
              <strong>LLM: {ollamaStatus.data.status.activeModel}</strong>{" "}
              (Online)
            </div>
          ) : (
            <div
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                borderRadius: "4px",
                background: "rgba(234, 179, 8, 0.2)",
                border: "1px solid #eab308",
                color: "#fde047",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span className="status-dot" style={{ background: "#eab308" }} />
              <strong>Strategic AI: Heuristic Fallback</strong>
            </div>
          )}
          <div className="header-status">
            <span className="status-dot" />
            {session.status}
          </div>
        </div>
      </header>

      {/* DEFCON Brinkmanship & Escalation Meter */}
      <section
        style={{
          background: activeDefconConfig.bg,
          border: `1px solid ${activeDefconConfig.border}`,
          borderRadius: "6px",
          padding: "8px 14px",
          margin: "8px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <strong
            style={{
              fontSize: "14px",
              letterSpacing: "1px",
              background: "rgba(0,0,0,0.4)",
              padding: "4px 8px",
              borderRadius: "4px",
              border: `1px solid ${activeDefconConfig.border}`,
            }}
          >
            {activeDefconConfig.text}
          </strong>
          <span style={{ fontSize: "12px", opacity: 0.9 }}>
            {campaignTension.data?.tension.lastIncidentSummary ??
              "Cold War baseline deterrence."}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: "bold" }}>
            Tension Index: {currentTensionIndex}/100
          </span>
          <div
            style={{
              width: "120px",
              height: "10px",
              background: "rgba(0,0,0,0.5)",
              borderRadius: "5px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${currentTensionIndex}%`,
                height: "100%",
                background: activeDefconConfig.border,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      </section>

      {/* Civilization-Style Multi-Resource National Economy Bar */}
      <section
        className="national-economy-bar"
        aria-label="National Strategic Economy"
      >
        <div className="economy-metric-item">
          <span className="economy-label">💰 National Treasury</span>
          <strong className="economy-value">
            $
            {campaignState.data?.economy.funds ??
              hexGrid.data?.economy.funds ??
              0}
          </strong>
          <span className="economy-delta">
            {(hexGrid.data?.economy.projectedDailyFundsDelta ?? 0) >= 0
              ? "+"
              : ""}
            {hexGrid.data?.economy.projectedDailyFundsDelta ?? 0}/day
          </span>
        </div>
        <div className="economy-metric-item">
          <span className="economy-label">⚙️ Industrial Capacity</span>
          <strong className="economy-value">
            {campaignState.data?.economy.productionPoints ??
              hexGrid.data?.economy.productionPoints ??
              50}{" "}
            P
          </strong>
          <span className="economy-delta">
            +{hexGrid.data?.economy.projectedDailyProductionDelta ?? 0}/day
          </span>
        </div>
        <div className="economy-metric-item">
          <span className="economy-label">🛢️ Strategic Fuel</span>
          <strong className="economy-value">
            {campaignState.data?.economy.fuelStockpile ??
              hexGrid.data?.economy.fuelStockpile ??
              200}{" "}
            bbl
          </strong>
          <span className="economy-delta">
            {(hexGrid.data?.economy.projectedDailyFuelDelta ?? 0) >= 0
              ? "+"
              : ""}
            {hexGrid.data?.economy.projectedDailyFuelDelta ?? 0}/day
          </span>
        </div>
        <div className="economy-metric-item">
          <span className="economy-label">🗺️ Controlled Sectors</span>
          <strong className="economy-value">
            {hexGrid.data?.turnSummary.controlledHexCount ?? 0} Hexes
          </strong>
          <span className="economy-subtext">
            {session.countryName} Sovereign Territory
          </span>
        </div>
        <div className="economy-metric-item">
          <span className="economy-label">⚔️ National Formations</span>
          <strong className="economy-value">
            {hexGrid.data?.formations.filter(
              (f) =>
                f.countryId === session.countryId && f.status !== "depleted",
            ).length ?? 0}
          </strong>
          <span className="economy-subtext">Sovereign Forces</span>
        </div>
        <div className="economy-metric-item">
          <span className="economy-label">🤝 Allied Formations</span>
          <strong className="economy-value">
            {hexGrid.data?.formations.filter(
              (f) =>
                f.side === "blufor" &&
                f.countryId !== session.countryId &&
                f.status !== "depleted",
            ).length ?? 0}
          </strong>
          <span className="economy-subtext">Coalition Support</span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            className="recruitment-catalog-button"
            onClick={() => setIsRecruiting(true)}
          >
            📋 Recruit Forces
          </button>
          <button
            type="button"
            className="recruitment-catalog-button"
            style={{ background: "#0284c7" }}
            onClick={() => setIsMarketOpen(true)}
          >
            🛒 Surplus Market
          </button>
          <button
            type="button"
            className="recruitment-catalog-button"
            style={{ background: "#475569" }}
            onClick={() => setIsTreatiesOpen(true)}
          >
            📜 Treaties
          </button>
          <button
            type="button"
            className="recruitment-catalog-button"
            style={{
              background:
                (diplomacyCables.data?.unreadCount ?? 0) > 0
                  ? "#991b1b"
                  : "#1e293b",
              border:
                (diplomacyCables.data?.unreadCount ?? 0) > 0
                  ? "1px solid #ef4444"
                  : "1px solid #475569",
              position: "relative",
            }}
            onClick={() => setIsInboxOpen(true)}
          >
            📨 Cables ({diplomacyCables.data?.unreadCount ?? 0})
          </button>
          <button
            type="button"
            className="recruitment-catalog-button"
            style={{ background: "#dc2626" }}
            onClick={() => setIsCovertOpsOpen(true)}
          >
            🗡️ Black Ops
          </button>
          <button
            type="button"
            className="advance-turn-button"
            onClick={() => advanceDay.mutate()}
            disabled={advanceDay.isPending}
          >
            {advanceDay.isPending
              ? "Advancing Turn..."
              : "Advance Strategic Turn (+1 Day)"}
          </button>
        </div>
      </section>

      <RecruitmentCatalogModal
        isOpen={isRecruiting}
        onClose={() => setIsRecruiting(false)}
        hexGrid={hexGrid.data}
        funds={
          campaignState.data?.economy.funds ?? hexGrid.data?.economy.funds ?? 0
        }
        productionPoints={
          campaignState.data?.economy.productionPoints ??
          hexGrid.data?.economy.productionPoints ??
          50
        }
        onRecruit={(input) => recruitFormationMutation.mutate(input)}
        isRecruiting={recruitFormationMutation.isPending}
      />

      <MilitarySurplusMarketModal
        isOpen={isMarketOpen}
        onClose={() => setIsMarketOpen(false)}
        hexGrid={hexGrid.data}
        funds={
          campaignState.data?.economy.funds ?? hexGrid.data?.economy.funds ?? 0
        }
        catalog={marketCatalog.data?.catalog ?? COLD_WAR_MARKET_CATALOG}
        pendingOrders={marketCatalog.data?.pendingOrders ?? []}
        onPurchase={(input) => purchaseSurplusMutation.mutate(input)}
        isPurchasing={purchaseSurplusMutation.isPending}
      />

      <DiplomaticTreatiesModal
        isOpen={isTreatiesOpen}
        onClose={() => setIsTreatiesOpen(false)}
        treaties={diplomacyTreaties.data?.treaties ?? []}
        cables={diplomacyCables.data?.cables ?? []}
        onNegotiate={(input) => negotiateTreatyMutation.mutate(input)}
        isNegotiating={negotiateTreatyMutation.isPending}
        latestNegotiation={latestNegotiation}
        onAcceptCounterOffer={(input) =>
          acceptCounterOfferMutation.mutate(input)
        }
        isAcceptingCounter={acceptCounterOfferMutation.isPending}
        onDeclineCounterOffer={(input) =>
          declineCounterOfferMutation.mutate(input)
        }
        isDecliningCounter={declineCounterOfferMutation.isPending}
        onClearNegotiation={() => setLatestNegotiation(null)}
        diplomacyError={diplomacyError}
        onClearDiplomacyError={() => setDiplomacyError(null)}
        playerFunds={
          campaignState.data?.economy.funds ?? hexGrid.data?.economy.funds ?? 0
        }
        playerFuel={
          campaignState.data?.economy.fuelStockpile ??
          hexGrid.data?.economy.fuelStockpile ??
          0
        }
        playerProduction={
          campaignState.data?.economy.productionPoints ??
          hexGrid.data?.economy.productionPoints ??
          0
        }
        playerFormations={hexGrid.data?.formations ?? []}
        playerHexes={hexGrid.data?.hexCells ?? []}
      />

      <DiplomaticInboxModal
        isOpen={isInboxOpen}
        onClose={() => setIsInboxOpen(false)}
        cables={diplomacyCables.data?.cables ?? []}
        worldNews={diplomacyWorldNews.data?.dispatches ?? []}
        onMarkRead={(cableIds) => markCablesReadMutation.mutate(cableIds)}
        isMarkingRead={markCablesReadMutation.isPending}
      />

      <CovertOperationsModal
        isOpen={isCovertOpsOpen}
        onClose={() => setIsCovertOpsOpen(false)}
        hexGrid={hexGrid.data}
        funds={
          campaignState.data?.economy.funds ?? hexGrid.data?.economy.funds ?? 0
        }
        catalog={covertOps.data?.catalog ?? COVERT_OPS_CATALOG}
        operations={covertOps.data?.operations ?? []}
        onLaunch={(input) => launchCovertOpMutation.mutate(input)}
        isLaunching={launchCovertOpMutation.isPending}
      />

      <FormationCompositionEditorModal
        isOpen={editingFormation !== null}
        formation={editingFormation}
        currentFunds={
          campaignState.data?.economy.funds ?? hexGrid.data?.economy.funds ?? 0
        }
        campaignYear={
          session.campaignTime
            ? new Date(session.campaignTime).getUTCFullYear()
            : 1983
        }
        onClose={() => setEditingFormation(null)}
        onSave={(updates) => updateFormationMutation.mutate(updates)}
        isSaving={updateFormationMutation.isPending}
      />

      <section className="command-grid">
        <section>
          <p className="eyebrow">CAMPAIGN</p>
          <p className="theater-name">{session.theaterName} Theater</p>
          <h2>{session.name}</h2>
          <p className="campaign-time" data-testid="campaign-date-display">
            {new Date(session.campaignTime).toUTCString()}
          </p>
          <p className="command-context">{session.situation}</p>
          <p className="command-scope">{session.commandScope}</p>
          <StrategicMap
            sites={session.strategicSites}
            entities={campaignState.data?.entities}
            hexGrid={hexGrid.data}
            funds={campaignState.data?.economy.funds ?? 0}
            playerCountryId={session.countryId}
            playerCountryName={session.countryName}
            lanes={missionBrief.data?.lanes ?? session.theaterLanes ?? []}
            selectedLaneId={selectedLaneId}
            onLaneSelect={(laneId) => {
              setSelectedLaneId(laneId);
              setGeneratedMission(undefined);
            }}
            onGenerateMissionForRoute={(routeId) => {
              laneMission.mutate({ routeId, seed: createMissionSeed() });
            }}
            onLaneActionForRoute={(action, routeId) =>
              laneAction.mutate({ action, routeId })
            }
            onMoveFormation={(formationId, targetHexId) =>
              moveFormation.mutate({ formationId, targetHexId })
            }
            onIssueMovementOrder={(formationId, targetHexId) =>
              issueMovementOrder.mutate({ formationId, targetHexId })
            }
            onCancelMovementOrder={(formationId) =>
              cancelMovementOrder.mutate({ formationId })
            }
            onDismissMovementOrder={(formationId) =>
              dismissMovementOrder.mutate({ formationId })
            }
            onEmbarkFormation={(formationId, sealiftFormationId) =>
              embarkFormation.mutate({ formationId, sealiftFormationId })
            }
            onDisembarkFormation={(formationId, targetHexId) =>
              disembarkFormation.mutate({ formationId, targetHexId })
            }
            onRefuelRearm={(formationId) =>
              refuelRearmFormation.mutate({ formationId })
            }
            onRestRefit={(formationId) =>
              restRefitFormation.mutate({ formationId })
            }
            onTrainFormation={(formationId, turns) =>
              trainFormation.mutate({
                formationId,
                ...(turns !== undefined ? { turns } : {}),
              })
            }
            onEngageHex={(hexId) => engageHex.mutate({ hexId })}
            onOpenFormationEditor={(form) => setEditingFormation(form)}
            onUpgradeInvestment={(hexId) =>
              upgradeHexInvestmentMutation.mutate(hexId)
            }
            actionPending={
              laneAction.isPending ||
              laneMission.isPending ||
              sectorPurchase.isPending ||
              moveFormation.isPending ||
              issueMovementOrder.isPending ||
              cancelMovementOrder.isPending ||
              dismissMovementOrder.isPending ||
              embarkFormation.isPending ||
              disembarkFormation.isPending ||
              refuelRearmFormation.isPending ||
              restRefitFormation.isPending ||
              trainFormation.isPending ||
              engageHex.isPending
            }
            world={world.data}
            onViewportChange={onViewportChange}
            initialBounds={initialMapBounds}
          />
          {generatedMission && (
            <section
              className="generated-mission"
              aria-label="Generated lane mission"
            >
              <p className="eyebrow">GENERATED MISSION</p>
              <h4>{generatedMission.title}</h4>
              <button
                type="button"
                className="inline-action"
                onClick={() => exportLaneMission(generatedMission)}
              >
                Export Sea Power mission (.ini)
              </button>
              <button
                type="button"
                className="inline-action"
                onClick={() => {
                  const routeId =
                    (
                      missionBrief.data?.lanes ??
                      session.theaterLanes ??
                      []
                    ).find((lane) => lane.id === generatedMission.laneId)
                      ?.routeId ?? "";
                  if (!routeId) return;
                  installMission.mutate({
                    routeId,
                    seed: generatedMission.seed,
                  });
                }}
                disabled={installMission.isPending}
              >
                {installMission.isPending
                  ? "Installing..."
                  : "Install mission to Sea Power"}
              </button>
              {installedMission?.missionId === generatedMission.id && (
                <p className="air-roe-note">
                  Installed as <strong>{installedMission.fileName}</strong> in
                  the Sea Power user missions folder.
                </p>
              )}
            </section>
          )}
          {laneMission.isSuccess && (
            <p className="action-feedback success" role="status">
              Mission generated successfully.
            </p>
          )}
          {laneAction.isSuccess && (
            <p className="action-feedback success" role="status">
              Lane posture set to {laneAction.variables?.action} successfully.
            </p>
          )}
          {sectorPurchase.isSuccess && (
            <p className="action-feedback success" role="status">
              Sector asset deployed successfully.
            </p>
          )}
          {(laneMission.isError ||
            laneAction.isError ||
            sectorPurchase.isError) && (
            <p className="action-feedback error" role="alert">
              {laneMission.error?.message ??
                laneAction.error?.message ??
                sectorPurchase.error?.message}
            </p>
          )}
          <MissionTray
            brief={missionBrief.data}
            onAction={(action, routeId) =>
              laneAction.mutate({ action, routeId })
            }
            actionPending={laneAction.isPending}
          />
        </section>
        <aside className="command-sidebar">
          <p className="eyebrow">NATIONAL OBJECTIVES</p>
          <ul>
            {session.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
          <dl>
            <div>
              <dt>Difficulty</dt>
              <dd>{session.difficulty}</dd>
            </div>
            <div>
              <dt>Technology</dt>
              <dd>{session.techMode}</dd>
            </div>
            <div>
              <dt>Intelligence</dt>
              <dd>Initial strategic picture</dd>
            </div>
          </dl>
          <button
            onClick={() => advanceDay.mutate()}
            disabled={advanceDay.isPending}
          >
            {advanceDay.isPending ? "Advancing..." : "Advance campaign clock"}
          </button>
          <section
            className="aa-procurement"
            aria-labelledby="aa-procurement-title"
          >
            <p className="eyebrow">AIR DEFENSE PROCUREMENT</p>
            <h3 id="aa-procurement-title">Deploy replacement AA sites</h3>
            <p className="aa-procurement-copy">
              Regions have fixed AA slots. If a site is destroyed, deploy a
              replacement.
            </p>
            <div className="aa-procurement-stats">
              <span>
                Funds: <strong>{campaignState.data?.economy.funds ?? 0}</strong>
              </span>
              <span>
                Daily:{" "}
                <strong>
                  {campaignState.data?.economy.projectedDailyDelta ?? 0}
                </strong>
              </span>
            </div>
            {(() => {
              const capacities = new Map<string, number>();
              for (const site of session.strategicSites) {
                if (
                  site.kind !== "aa_site" ||
                  site.countryId !== session.countryId
                )
                  continue;
                const region = slugToken(site.id.split("-")[0] ?? site.id);
                capacities.set(region, (capacities.get(region) ?? 0) + 1);
              }
              const active = new Map<string, number>();
              for (const entity of campaignState.data?.entities ?? []) {
                if (entity.tag !== "hawk_site" || entity.side !== "blufor")
                  continue;
                if (entity.status === "destroyed" || entity.status === "sunk")
                  continue;
                const region =
                  slugToken(
                    textMeta(entity.metadata, "regionKey") ??
                      textMeta(entity.metadata, "strategicSiteId")?.split(
                        "-",
                      )[0] ??
                      "",
                  ) || "unknown";
                active.set(region, (active.get(region) ?? 0) + 1);
              }
              const rows = [...capacities.entries()].map(
                ([regionKey, capacity]) => {
                  const activeCount = active.get(regionKey) ?? 0;
                  return {
                    regionKey,
                    capacity,
                    activeCount,
                    available: Math.max(0, capacity - activeCount),
                  };
                },
              );
              if (rows.length === 0) {
                return (
                  <p className="aa-procurement-empty">
                    No AA regions available for this command.
                  </p>
                );
              }
              return (
                <div className="aa-region-list">
                  {rows.map((row) => (
                    <div className="aa-region-row" key={row.regionKey}>
                      <span>
                        <strong>{titleToken(row.regionKey)}</strong>
                        <small>
                          Active {row.activeCount}/{row.capacity}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="inline-action"
                        disabled={
                          aaPurchase.isPending ||
                          row.available <= 0 ||
                          (campaignState.data?.economy.funds ?? 0) <
                            AA_SITE_PURCHASE_COST
                        }
                        onClick={() =>
                          aaPurchase.mutate({ regionKey: row.regionKey })
                        }
                      >
                        Deploy ({AA_SITE_PURCHASE_COST})
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
            {aaPurchase.isError && (
              <p className="aa-procurement-error">{aaPurchase.error.message}</p>
            )}
            {aaPurchase.isSuccess && (
              <p className="aa-procurement-success">
                AA site deployed to {titleToken(aaPurchase.data.regionKey)}.
              </p>
            )}
          </section>
          <button
            className="secondary-action"
            onClick={() => setConfirmingLeave(true)}
          >
            Change campaign
          </button>
        </aside>
      </section>
      {confirmingLeave && (
        <section
          className="confirm-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-campaign-title"
        >
          <p className="eyebrow">CAMPAIGN SESSION</p>
          <h2 id="change-campaign-title">Choose another campaign?</h2>
          <p>
            This returns to setup and keeps this campaign saved locally for
            future resume support.
          </p>
          <div className="confirm-actions">
            <button
              className="secondary-action"
              onClick={() => setConfirmingLeave(false)}
              disabled={leave.isPending}
            >
              Stay in command
            </button>
            <button onClick={() => leave.mutate()} disabled={leave.isPending}>
              {leave.isPending ? "Returning..." : "Return to setup"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function MissionTray({
  brief,
  onAction,
  actionPending,
}: {
  brief?: MissionBrief | undefined;
  onAction: (action: LaneAction, routeId: string) => void;
  actionPending: boolean;
}): ReactElement {
  if (!brief)
    return <section className="briefing">Loading mission picture...</section>;
  return (
    <section
      className="briefing mission-tray"
      aria-labelledby="mission-tray-title"
    >
      <p className="eyebrow">COMMANDER'S IDENTIFICATION RULES</p>
      <h3 id="mission-tray-title">Identify before engagement</h3>
      <p className="roe-guidance">
        Treat unconfirmed air and surface contacts as non-hostile until they are
        classified and identified. Civilian traffic can mask or delay hostile
        action, so preserve identification discipline around the coast and trade
        routes.
      </p>
      <div className="mission-summary" aria-label="Traffic summary">
        <div className="summary-item">
          <span>Expected civilian traffic</span>
          <strong>
            {brief.traffic.reduce(
              (sum, item) => sum + item.expectedDailyCount,
              0,
            )}{" "}
            / day
          </strong>
        </div>
        <div className="summary-item">
          <span>Fuel route delivered</span>
          <strong>{brief.trade.delivered} / day</strong>
        </div>
        {brief.trade.shortfall > 0 && (
          <div className="summary-item warning">
            <span>Fuel shortfall</span>
            <strong>{brief.trade.shortfall} / day</strong>
          </div>
        )}
      </div>
      <p className="eyebrow">UNRESOLVED CONTACTS</p>
      <div className="contact-list">
        {brief.contacts
          .filter((contact) => contact.stage !== "identified")
          .map((contact, index) => (
            <div className="contact-row" key={contact.id}>
              <strong className="contact-name">
                Contact {index + 1}:{" "}
                {contact.category === "unknown"
                  ? "unknown"
                  : contact.category.replaceAll("_", " ")}
              </strong>
              <span className="contact-meta">
                {contact.stage.replaceAll("_", " ")} ·{" "}
                {Math.round(contact.confidence * 100)}% confidence ·{" "}
                {contact.domain}
              </span>
            </div>
          ))}
      </div>
      <p className="eyebrow">IDENTIFICATION TASKS</p>
      <ul className="mission-hooks">
        {brief.missions.slice(0, 4).map((mission) => (
          <li key={mission.id} className="mission-hook-row">
            <span>{mission.title}</span>
            {(mission.type === "escort_trade" ||
              mission.type === "investigate_disruption") && (
              <button
                type="button"
                className="inline-action"
                disabled={actionPending}
                onClick={() =>
                  onAction(
                    mission.type === "escort_trade" ? "escort" : "investigate",
                    mission.tradeRouteId ?? "bergen-scapa-fuel",
                  )
                }
              >
                {mission.type === "escort_trade" ? "Escort" : "Investigate"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatCountryName(countryId?: string): string {
  switch (countryId) {
    case "united-states":
      return "United States (US Navy / USMC)";
    case "united-kingdom":
      return "United Kingdom (Royal Navy)";
    case "west-germany":
      return "West Germany (Bundesmarine / Heer)";
    case "denmark":
      return "Denmark (Royal Danish Armed Forces)";
    case "norway":
      return "Norway (Royal Norwegian Armed Forces)";
    case "soviet-union":
      return "Soviet Union (Red Banner Northern Fleet)";
    default:
      return countryId
        ? countryId.replace(/-/g, " ").toUpperCase()
        : "Allied Forces";
  }
}

function createHexTacticalPopupContent(
  hex: StrategicHexCell,
  hexFormations: CampaignFormation[],
  onStartMovePlanning?: (
    form: CampaignFormation,
    hex: StrategicHexCell,
  ) => void,
  onEmbark?: (formationId: string, sealiftFormationId: string) => void,
  onDisembark?: (formationId: string, targetHexId: string) => void,
  onEngage?: (hexId: string) => void,
  onOpenFormationEditor?: (form: CampaignFormation) => void,
  onCancelMoveOrder?: (formationId: string) => void,
  onDismissMoveOrder?: (formationId: string) => void,
  onRefuelRearm?: (formationId: string) => void,
  onRestRefit?: (formationId: string) => void,
  onTrainFormation?: (formationId: string, turns?: number) => void,
  playerCountryId?: string,
  playerCountryName?: string,
  onUpgradeInvestment?: (hexId: string) => void,
): HTMLElement {
  const popup = document.createElement("div");
  popup.className = "hex-tactical-popup";

  const isPlayerSovereignHex =
    playerCountryId && hex.ownership.countryId === playerCountryId;
  const isAlliedHex = hex.ownership.side === "blufor" && !isPlayerSovereignHex;
  const isFriendlyPortHex =
    (hex.facilities.includes("naval_base") ||
      hex.facilities.includes("air_base") ||
      hex.facilities.includes("shipyard") ||
      hex.facilities.includes("refinery") ||
      Boolean(
        hex.childSites &&
        hex.childSites.some(
          (cs) =>
            cs.kind === "naval_base" ||
            cs.kind === "air_base" ||
            cs.kind === "world_port" ||
            cs.kind === "fuel_terminal",
        ),
      )) &&
    (hex.ownership.side === "blufor" ||
      (playerCountryId && hex.ownership.countryId === playerCountryId));

  const header = document.createElement("div");
  header.className = "sector-popup-header";
  const h4 = document.createElement("h4");
  h4.textContent = `🔷 ${hex.name}`;
  const badge = document.createElement("span");
  badge.className = `formation-tag ${hex.ownership.side} ${isPlayerSovereignHex ? "sovereign" : isAlliedHex ? "allied" : ""}`;
  badge.textContent = isPlayerSovereignHex
    ? `${(playerCountryName ?? "NORWEGIAN").toUpperCase()} SOVEREIGN`
    : isAlliedHex
      ? "ALLIED NATO"
      : hex.ownership.side === "opfor"
        ? "PACT OCCUPIED"
        : isWaterTerrain(hex.terrain)
          ? "INTERNATIONAL WATERS"
          : "UNALIGNED";
  header.appendChild(h4);
  header.appendChild(badge);
  popup.appendChild(header);

  // 1. Contested / Occupation Progress Status Callout
  if (hex.status === "contested") {
    const contestedAlert = document.createElement("div");
    contestedAlert.className = "contested-alert-box";
    contestedAlert.style.cssText =
      "background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-size: 11px; font-weight: bold;";
    contestedAlert.innerHTML = `⚠️ <span>CONTESTED SECTOR — Hostile forces engaged! Daily economic yields frozen to $0.</span>`;
    popup.appendChild(contestedAlert);
  } else if (hex.captureTurnsCounter && hex.captureTurnsCounter > 0) {
    const captureAlert = document.createElement("div");
    captureAlert.className = "capture-progress-box";
    captureAlert.style.cssText =
      "background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fcd34d; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-size: 11px; font-weight: bold;";
    captureAlert.innerHTML = `⏳ <span>Occupation Progress: <strong>${hex.captureTurnsCounter}/5 Turns</strong> (${(hex.occupyingCountryId ?? "Enemy").toUpperCase()})</span>`;
    popup.appendChild(captureAlert);
  }

  // Cold War 1983 Historical Context Callout
  if (hex.coldWarContext) {
    const intelBox = document.createElement("div");
    intelBox.className = "cold-war-intel-box";
    intelBox.innerHTML = `<strong>HISTORICAL 1983 STRATEGIC INTELLIGENCE</strong>${hex.coldWarContext}`;
    popup.appendChild(intelBox);
  }

  // Demographics & Turn Resource Yields
  const yieldsBox = document.createElement("div");
  yieldsBox.className = "hex-popup-yields";
  yieldsBox.innerHTML = `
    <span>💰 <strong>+$${hex.yields.fundsRevenue}</strong>/d</span>
    <span>⚙️ <strong>+${hex.yields.productionPoints}</strong>/d</span>
    <span>🛢️ <strong>+${hex.yields.energyFuel}</strong>/d</span>
    ${hex.population ? `<span>👥 <strong>${hex.population.toLocaleString()}</strong> Pop</span>` : ""}
  `;
  popup.appendChild(yieldsBox);

  // 2. Physical Stockpile Depots
  if (hex.depots) {
    const depotsBox = document.createElement("div");
    depotsBox.className = "hex-popup-depots";
    depotsBox.style.cssText =
      "background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.2); padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 11px;";
    depotsBox.innerHTML = `
      <div style="font-weight: 600; color: #94a3b8; margin-bottom: 4px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">📦 Physical Stockpile Depots</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; color: #cbd5e1;">
        <span>🛢️ Fuel: <strong>${hex.depots.fuelBarrels ?? 100} bbl</strong></span>
        <span>🚀 Missiles: <strong>${hex.depots.munitionsMissiles ?? 20}</strong></span>
        <span>🐟 Torpedoes: <strong>${hex.depots.munitionsTorpedoes ?? 10}</strong></span>
        <span>💥 Shells: <strong>${hex.depots.munitionsShells ?? 200}</strong></span>
        ${hex.depots.strategicOreTitanium ? `<span>⚙️ Titanium: <strong>${hex.depots.strategicOreTitanium}</strong></span>` : ""}
        ${hex.depots.strategicOreIron ? `<span>⛏️ Iron: <strong>${hex.depots.strategicOreIron}</strong></span>` : ""}
        ${hex.depots.strategicOreUranium ? `<span>☢️ Uranium: <strong>${hex.depots.strategicOreUranium}</strong></span>` : ""}
      </div>
    `;
    popup.appendChild(depotsBox);
  }

  // 3. Regional Capital Investment Tier & Upgrade
  const investmentTier = hex.investmentTier ?? 0;
  const tierNames = [
    "Tier 0: Standard Administration (1.0x)",
    "Tier 1: Industrial Modernization (+15% funds, +10 prod, +15 fuel)",
    "Tier 2: Logistics Hub & Fortifications (+35% funds, +25 prod, +40 fuel)",
    "Tier 3: Strategic Command & Complex (+60% funds, +50 prod, +80 fuel)",
  ];
  const nextTierCosts = [500, 1200, 2500];

  const investmentBox = document.createElement("div");
  investmentBox.className = "hex-popup-investment";
  investmentBox.style.cssText =
    "background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(56, 189, 248, 0.3); padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 11px;";

  const tierHeader = document.createElement("div");
  tierHeader.style.cssText =
    "display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;";
  tierHeader.innerHTML = `<span style="font-weight: bold; color: #38bdf8;">🏛️ Regional Investment</span><span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 2px 6px; border-radius: 3px; font-weight: bold;">Tier ${investmentTier}</span>`;
  investmentBox.appendChild(tierHeader);

  const tierDesc = document.createElement("div");
  tierDesc.style.cssText =
    "color: #94a3b8; font-size: 10px; margin-bottom: 6px;";
  tierDesc.textContent = tierNames[investmentTier] ?? tierNames[0] ?? "";
  investmentBox.appendChild(tierDesc);

  if (isPlayerSovereignHex && investmentTier < 3 && onUpgradeInvestment) {
    const upgradeCost = nextTierCosts[investmentTier];
    const upgBtn = document.createElement("button");
    upgBtn.className = "action-button";
    upgBtn.style.cssText =
      "width: 100%; font-size: 11px; padding: 6px 10px; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; transition: background 0.15s;";
    upgBtn.textContent = `🏗️ Upgrade to Tier ${investmentTier + 1} ($${upgradeCost})`;
    upgBtn.onclick = (e) => {
      e.stopPropagation();
      upgBtn.disabled = true;
      upgBtn.textContent = "Upgrading Sector...";
      upgBtn.style.background = "#64748b";
      onUpgradeInvestment(hex.id);
    };
    investmentBox.appendChild(upgBtn);
  }
  popup.appendChild(investmentBox);

  // Stationed Formations Section
  const formSection = document.createElement("div");
  formSection.className = "sector-popup-section";
  const formTitle = document.createElement("p");
  formTitle.className = "sector-popup-section-title";
  formTitle.textContent = `MILITARY FORMATIONS (${hexFormations.length})`;
  formSection.appendChild(formTitle);

  const formList = document.createElement("div");
  formList.className = "hex-formation-list";

  if (hexFormations.length === 0) {
    const emptyNote = document.createElement("p");
    emptyNote.className = "sector-popup-summary";
    emptyNote.textContent = "No military formations stationed in this sector.";
    formList.appendChild(emptyNote);
  } else {
    const sealiftPresent = hexFormations.find(
      (f) =>
        f.unitType === "sealift_transport_flotilla" &&
        f.side === "blufor" &&
        (!playerCountryId || f.countryId === playerCountryId),
    );

    for (const form of hexFormations) {
      const isNationalCommand =
        !playerCountryId || form.countryId === playerCountryId;
      const isAlliedFormation = form.side === "blufor" && !isNationalCommand;

      const card = document.createElement("div");
      card.className = "formation-card";

      const cardHeader = document.createElement("div");
      cardHeader.className = "formation-card-header";
      const nameSpan = document.createElement("span");
      nameSpan.className = "formation-name";
      nameSpan.textContent = form.name;

      const sideBadge = document.createElement("span");
      sideBadge.className = `formation-tag ${form.side} ${isAlliedFormation ? "allied" : isNationalCommand && form.side === "blufor" ? "sovereign" : ""}`;
      sideBadge.textContent = isAlliedFormation
        ? `ALLIED (${(form.countryId || "NATO").toUpperCase().replace(/-/g, " ")})`
        : isNationalCommand && form.side === "blufor"
          ? `${(playerCountryName ?? "NORWAY").toUpperCase()} (SOVEREIGN)`
          : form.side.toUpperCase();
      cardHeader.appendChild(nameSpan);
      cardHeader.appendChild(sideBadge);
      card.appendChild(cardHeader);

      const statusDisplay =
        form.status === "embarking"
          ? `<em style="color:#38bdf8; font-weight: bold;">⏳ Loading on Sealift (1 Turn)</em>`
          : form.status === "disembarking"
            ? `<em style="color:#38bdf8; font-weight: bold;">🚢 Disembarking to Shore (1 Turn)</em>`
            : form.status === "training"
              ? `<em style="color:#fbbf24; font-weight: bold;">🎖️ Combat Drills</em>`
              : form.status === "embarked"
                ? `<em style="color:#94a3b8;">🚢 Embarked on Transport</em>`
                : `<em>${form.status}</em>`;

      const statusLine = document.createElement("div");
      statusLine.className = "formation-status-line";
      statusLine.innerHTML = `
        <span>Strength: <strong>${form.strength}%</strong></span>
        <span>AP: <strong>${form.actionPoints}/${form.maxActionPoints}</strong></span>
        <span>Status: ${statusDisplay}</span>
      `;
      card.appendChild(statusLine);

      // Readiness & Morale Chips
      const readinessDiv = document.createElement("div");
      readinessDiv.className = "formation-readiness-bar";
      readinessDiv.innerHTML = `
        <div class="readiness-chip" title="Strategic Fuel Reserves: ${form.fuelCurrent ?? 100}%">
          <span class="chip-label">⛽ Fuel</span>
          <span class="chip-val ${(form.fuelCurrent ?? 100) < 30 ? "critical" : ""}">${form.fuelCurrent ?? 100}%</span>
        </div>
        <div class="readiness-chip" title="Munitions & Ordnance: ${form.ammoLevel ?? 100}%">
          <span class="chip-label">🎯 Ammo</span>
          <span class="chip-val">${form.ammoLevel ?? 100}%</span>
        </div>
        <div class="readiness-chip" title="Crew Morale & Operational Stamina: ${form.morale ?? 100}%">
          <span class="chip-label">❤️ Morale</span>
          <span class="chip-val ${(form.morale ?? 100) < 50 ? "warning" : ""}">${form.morale ?? 100}%</span>
        </div>
        <div class="readiness-chip" title="Crew Experience: ${form.experience ?? 40} XP (${(form.veterancyRank ?? "regular").toUpperCase()})">
          <span class="chip-label">⭐ Rank</span>
          <span class="chip-val rank">${(form.veterancyRank ?? "regular").toUpperCase()}</span>
        </div>
      `;
      card.appendChild(readinessDiv);

      // Allied Independent NATO Command Notice
      if (isAlliedFormation) {
        const alliedNotice = document.createElement("div");
        alliedNotice.className = "allied-command-callout";
        alliedNotice.innerHTML = `
          🔒 <strong>Allied NATO Coalition Force</strong><br/>
          Operating under sovereign command of <em>${formatCountryName(form.countryId)}</em>. Tactical movement and flotilla refits are restricted to home national command.
        `;
        card.appendChild(alliedNotice);
      }

      // Active Multi-Turn Movement Route Progress Card (placed above roster for instant visibility)
      if (form.activeRoute) {
        const routeCard = document.createElement("div");
        routeCard.className = `popup-route-card ${form.activeRoute.status}`;
        const pct = Math.min(
          100,
          Math.round(
            (form.activeRoute.currentWaypointIndex /
              Math.max(1, form.activeRoute.totalWaypoints - 1)) *
              100,
          ),
        );
        const statusIcon =
          form.activeRoute.status === "in_transit"
            ? "🚀"
            : form.activeRoute.status === "arrived"
              ? "🏁"
              : form.activeRoute.status === "interrupted"
                ? "⚠️"
                : "🚫";

        const statusLabel =
          form.activeRoute.status === "in_transit"
            ? "In Transit"
            : form.activeRoute.status === "arrived"
              ? "Arrived"
              : form.activeRoute.status === "interrupted"
                ? "Halted / Engaged"
                : "Blocked";

        routeCard.innerHTML = `
          <div class="route-card-header">
            <span class="route-title">${statusIcon} <strong>${statusLabel}</strong> ➔ ${form.activeRoute.targetName}</span>
            <span class="route-turns-tag">Turn ${form.activeRoute.turnsElapsed}/${form.activeRoute.totalTurns}</span>
          </div>
          <div class="route-card-progress">
            <div class="route-progress-track">
              <div class="route-progress-bar" style="width: ${pct}%"></div>
            </div>
            <span class="route-step-text">Step ${form.activeRoute.currentWaypointIndex + 1} of ${form.activeRoute.totalWaypoints} (${pct}%)</span>
          </div>
          ${form.activeRoute.reason ? `<div class="route-reason-note" style="font-size: 0.65rem; color: #f59e0b;">${form.activeRoute.reason}</div>` : ""}
        `;

        if (
          isNationalCommand &&
          form.side === "blufor" &&
          form.activeRoute.status === "in_transit"
        ) {
          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "cancel-route-btn";
          cancelBtn.textContent = "🛑 Cancel Movement Order";
          cancelBtn.onclick = () => {
            if (onCancelMoveOrder) {
              onCancelMoveOrder(form.id);
            }
          };
          routeCard.appendChild(cancelBtn);
        }

        if (
          isNationalCommand &&
          form.side === "blufor" &&
          form.activeRoute.status === "arrived"
        ) {
          const dismissBtn = document.createElement("button");
          dismissBtn.type = "button";
          dismissBtn.className = "cancel-route-btn dismiss";
          dismissBtn.textContent = "✅ Dismiss Route Notice";
          dismissBtn.onclick = () => {
            if (onDismissMoveOrder) {
              onDismissMoveOrder(form.id);
            }
          };
          routeCard.appendChild(dismissBtn);
        }

        card.appendChild(routeCard);
      }

      // Flotilla Unit Manifest & Flagship Breakdown (using custom composition if present)
      const flotillaComp =
        form.composition ??
        getFlotillaComposition(
          form.unitType as FormationUnitType,
          form.countryId,
          form.side,
        );
      const rosterDiv = document.createElement("div");
      rosterDiv.className = "popup-roster-preview";
      rosterDiv.innerHTML = `
        <div class="roster-flagship"><strong>Flagship:</strong> ${flotillaComp.flagshipName}</div>
        <div class="roster-units-tags">
          ${flotillaComp.units
            .map(
              (u) =>
                `<span class="roster-unit-tag ${u.isProxy ? "proxy" : ""}" title="${u.isProxy ? u.proxyFor || "Vanilla Proxy" : "Authentic Asset"}">${u.count}x ${u.name} <small>[${u.classIniRef}]</small></span>`,
            )
            .join("")}
        </div>
      `;
      card.appendChild(rosterDiv);

      if (isNationalCommand && form.side === "blufor") {
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "formation-actions";

        if (
          form.actionPoints > 0 &&
          form.status !== "embarked" &&
          form.status !== "embarking" &&
          form.status !== "disembarking" &&
          form.status !== "training"
        ) {
          const moveBtn = document.createElement("button");
          moveBtn.type = "button";
          moveBtn.className = "formation-btn";
          moveBtn.textContent = "🎯 Click-to-Move Path ➔";
          moveBtn.onclick = () => {
            if (onStartMovePlanning) {
              onStartMovePlanning(form, hex);
            }
          };
          actionsDiv.appendChild(moveBtn);
        }

        if (
          form.archetype?.domain === "ground" &&
          !form.embarkedOnId &&
          form.status !== "embarking" &&
          sealiftPresent &&
          sealiftPresent.id !== form.id
        ) {
          const embarkBtn = document.createElement("button");
          embarkBtn.type = "button";
          embarkBtn.className = "formation-btn";
          embarkBtn.textContent = "🚢 Embark on Sealift";
          embarkBtn.onclick = () => {
            if (onEmbark) {
              onEmbark(form.id, sealiftPresent.id);
            }
          };
          actionsDiv.appendChild(embarkBtn);
        }

        if (form.embarkedOnId && form.status === "embarked") {
          const disembarkBtn = document.createElement("button");
          disembarkBtn.type = "button";
          disembarkBtn.className = "formation-btn";
          disembarkBtn.textContent = "⚓ Disembark to Land";
          disembarkBtn.onclick = () => {
            const landTarget = prompt(
              `Enter land sector ID to disembark ${form.name}:`,
              hex.id,
            );
            if (landTarget && onDisembark) {
              onDisembark(form.id, landTarget.trim());
            }
          };
          actionsDiv.appendChild(disembarkBtn);
        }

        // Port Logistics Operations
        if (
          isFriendlyPortHex &&
          form.status !== "embarked" &&
          form.status !== "embarking" &&
          form.status !== "disembarking"
        ) {
          const refuelBtn = document.createElement("button");
          refuelBtn.type = "button";
          refuelBtn.className = "formation-btn log-action";
          refuelBtn.textContent = "⛽ Refuel & Rearm";
          refuelBtn.title =
            "Replenish fuel & ammunition to 100% (-$25, -15bbl)";
          refuelBtn.onclick = () => {
            if (onRefuelRearm) {
              onRefuelRearm(form.id);
            }
          };
          actionsDiv.appendChild(refuelBtn);

          const restBtn = document.createElement("button");
          restBtn.type = "button";
          restBtn.className = "formation-btn log-action";
          restBtn.textContent = "🛌 Shore Leave (R&R)";
          restBtn.title = "Rest crew and recover morale to 100%";
          restBtn.onclick = () => {
            if (onRestRefit) {
              onRestRefit(form.id);
            }
          };
          actionsDiv.appendChild(restBtn);

          if (form.status !== "training") {
            const trainBtn = document.createElement("button");
            trainBtn.type = "button";
            trainBtn.className = "formation-btn log-action";
            trainBtn.textContent = "🎖️ Train Crew (+XP)";
            trainBtn.title =
              "Conduct intensive combat training drills (+7 XP per turn)";
            trainBtn.onclick = () => {
              if (onTrainFormation) {
                onTrainFormation(form.id, 1);
              }
            };
            actionsDiv.appendChild(trainBtn);
          }
        }

        const customizeBtn = document.createElement("button");
        customizeBtn.type = "button";
        customizeBtn.className = "formation-btn customize";
        customizeBtn.textContent = "🛠️ Modify Flotilla Manifest";
        customizeBtn.onclick = () => {
          if (onOpenFormationEditor) {
            onOpenFormationEditor(form);
          }
        };
        actionsDiv.appendChild(customizeBtn);

        card.appendChild(actionsDiv);
      }

      formList.appendChild(card);
    }
  }

  formSection.appendChild(formList);
  popup.appendChild(formSection);

  // Economic Activities Tags
  if (hex.economicActivities && hex.economicActivities.length > 0) {
    const econSection = document.createElement("div");
    econSection.className = "sector-popup-section";
    const econTitle = document.createElement("p");
    econTitle.className = "sector-popup-section-title";
    econTitle.textContent = "REGIONAL ECONOMIC ACTIVITIES";
    econSection.appendChild(econTitle);
    const econTags = document.createElement("div");
    econTags.className = "economic-tags-container";
    for (const act of hex.economicActivities) {
      const tag = document.createElement("span");
      tag.className = "economic-tag";
      tag.textContent = act.replace(/_/g, " ").toUpperCase();
      econTags.appendChild(tag);
    }
    econSection.appendChild(econTags);
    popup.appendChild(econSection);
  }

  // Child Tactical Sites within Hex
  if (hex.childSites && hex.childSites.length > 0) {
    const childSection = document.createElement("div");
    childSection.className = "sector-popup-section";
    const childTitle = document.createElement("p");
    childTitle.className = "sector-popup-section-title";
    childTitle.textContent = `CHILD TACTICAL ASSETS (${hex.childSites.length})`;
    childSection.appendChild(childTitle);
    const childList = document.createElement("div");
    childList.className = "child-sites-container";
    for (const site of hex.childSites) {
      const row = document.createElement("div");
      row.className = "child-site-row";
      row.innerHTML = `
        <div class="child-site-header">
          <span>${site.name}</span>
          <span class="economic-tag">${site.kind.replace(/_/g, " ").toUpperCase()}</span>
        </div>
        <div class="child-site-desc">${site.output} · <em>${site.status}</em></div>
      `;
      childList.appendChild(row);
    }
    childSection.appendChild(childList);
    popup.appendChild(childSection);
  }

  if (hex.facilities.length > 0) {
    const facSection = document.createElement("div");
    facSection.className = "sector-popup-section";
    const facTitle = document.createElement("p");
    facTitle.className = "sector-popup-section-title";
    facTitle.textContent = "STRATEGIC FACILITIES";
    facSection.appendChild(facTitle);
    const facGrid = document.createElement("div");
    facGrid.className = "sector-site-tags";
    for (const fac of hex.facilities) {
      const tag = document.createElement("span");
      tag.className = "sector-site-tag active";
      tag.textContent = fac.replace(/_/g, " ").toUpperCase();
      facGrid.appendChild(tag);
    }
    facSection.appendChild(facGrid);
    popup.appendChild(facSection);
  }

  const battleSection = document.createElement("div");
  battleSection.className = "sector-popup-section";
  const battleBtn = document.createElement("button");
  battleBtn.type = "button";
  battleBtn.className = "formation-btn sp-battle";
  battleBtn.textContent = "⚔️ Generate Sea Power Engagement (.ini)";
  battleBtn.onclick = () => {
    if (onEngage) {
      onEngage(hex.id);
    }
  };
  battleSection.appendChild(battleBtn);
  popup.appendChild(battleSection);

  return popup;
}

interface CanvasHexGridOverlayInstance extends L.Layer {
  setSelectedHexId(hexId: string | null): void;
  render(): void;
}

const CanvasHexGridOverlay = L.Layer.extend({
  initialize() {
    this._canvas = null;
    this._ctx = null;
    this._selectedHexId = null;
  },

  onAdd(map: L.Map) {
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-hex-canvas-overlay");
    this._canvas.style.position = "absolute";
    this._canvas.style.top = "0";
    this._canvas.style.left = "0";
    this._canvas.style.pointerEvents = "none";
    this._canvas.style.zIndex = "250";
    map.getPanes().overlayPane.appendChild(this._canvas);
    this._ctx = this._canvas.getContext("2d");

    map.on("move zoom viewreset resize", this.render, this);
    this.render();
    return this;
  },

  onRemove(map: L.Map) {
    map.off("move zoom viewreset resize", this.render, this);
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;
    this._ctx = null;
    return this;
  },

  setSelectedHexId(hexId: string | null) {
    this._selectedHexId = hexId;
    this.render();
  },

  render() {
    const map = this._map;
    if (!map || !this._canvas || !this._ctx) return;

    const size = map.getSize();
    const pixelRatio = window.devicePixelRatio || 1;
    this._canvas.width = size.x * pixelRatio;
    this._canvas.height = size.y * pixelRatio;
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);

    const ctx = this._ctx;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    const bounds = map.getBounds();
    const [minX, minY] = latLonToMercator(
      Math.max(-85, bounds.getSouth() - 2),
      bounds.getWest() - 4,
    );
    const [maxX, maxY] = latLonToMercator(
      Math.min(85, bounds.getNorth() + 2),
      bounds.getEast() + 4,
    );

    const minR = Math.max(-100, Math.floor(minY / MERCATOR_SPACING_Y) - 1);
    const maxR = Math.min(100, Math.ceil(maxY / MERCATOR_SPACING_Y) + 1);

    for (let r = minR; r <= maxR; r++) {
      const minQ = Math.floor(minX / MERCATOR_SPACING_X - r * 0.5) - 1;
      const maxQ = Math.ceil(maxX / MERCATOR_SPACING_X - r * 0.5) + 1;

      for (let q = minQ; q <= maxQ; q++) {
        const hexId = getHexIdForAxial(q, r);
        const hex = getHexCellDefinition(hexId, { q, r });
        const isSelected = hex.id === this._selectedHexId;
        const isBlufor = hex.ownership.side === "blufor";
        const isOpfor = hex.ownership.side === "opfor";

        const polygon = hex.polygon;
        ctx.beginPath();
        for (let i = 0; i < polygon.length; i++) {
          const vertex = polygon[i];
          if (!vertex) continue;
          const pt = map.latLngToContainerPoint([vertex[0], vertex[1]]);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();

        // Subtle Faction Background Fills
        if (isSelected) {
          ctx.fillStyle = "rgba(56, 189, 248, 0.32)";
          ctx.fill();
        } else if (isBlufor) {
          ctx.fillStyle = "rgba(59, 130, 246, 0.12)";
          ctx.fill();
        } else if (isOpfor) {
          ctx.fillStyle = "rgba(239, 68, 68, 0.12)";
          ctx.fill();
        } else {
          ctx.fillStyle = "rgba(202, 138, 4, 0.05)";
          ctx.fill();
        }

        // Crisp Hex Grid Outline (Matches user's uploaded Kepler.gl/H3 screenshots)
        if (isSelected) {
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else {
          ctx.strokeStyle = isBlufor
            ? "rgba(96, 165, 250, 0.65)"
            : isOpfor
              ? "rgba(248, 113, 113, 0.65)"
              : "rgba(234, 179, 8, 0.45)";
          ctx.lineWidth = hex.isCoreTheater ? 1.4 : 0.9;
          ctx.stroke();
        }
      }
    }
  },
});

function RecruitmentCatalogModal({
  isOpen,
  onClose,
  hexGrid,
  funds,
  productionPoints,
  onRecruit,
  isRecruiting,
}: {
  isOpen: boolean;
  onClose: () => void;
  hexGrid?: HexGridStateSnapshot | undefined;
  funds: number;
  productionPoints: number;
  onRecruit: (input: {
    unitType: FormationUnitType;
    hexId: string;
    customName?: string | undefined;
  }) => void;
  isRecruiting: boolean;
}): ReactElement | null {
  const [selectedType, setSelectedType] = useState<FormationUnitType>(
    "surface_action_group",
  );
  const [selectedHexId, setSelectedHexId] = useState<string>("");
  const [customName, setCustomName] = useState<string>("");

  const friendlyHexes = useMemo(() => {
    const fromGrid = (hexGrid?.hexCells ?? []).filter(
      (h) => h.ownership.side === "blufor",
    );
    if (fromGrid.length > 0) return fromGrid;
    return getAllBalticCoreHexCells().filter(
      (h) => h.ownership.side === "blufor",
    );
  }, [hexGrid]);

  useEffect(() => {
    if (!selectedHexId && friendlyHexes.length > 0) {
      setSelectedHexId(friendlyHexes[0]!.id);
    }
  }, [friendlyHexes, selectedHexId]);

  if (!isOpen) return null;

  const archetypesList = Object.values(FORMATION_ARCHETYPES);
  const selectedArchetype = FORMATION_ARCHETYPES[selectedType];
  const canAfford =
    funds >= selectedArchetype.fundsCost &&
    productionPoints >= selectedArchetype.productionCost;

  return (
    <div className="recruitment-modal-backdrop" onClick={onClose}>
      <div className="recruitment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recruitment-modal-header">
          <h3>📋 NATO Military Procurement & Force Recruitment Catalog</h3>
          <button
            type="button"
            className="recruitment-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="recruitment-modal-body">
          <div className="recruitment-controls-row">
            <div className="recruitment-control-group">
              <label>Deployment Sector (Friendly Base/Port)</label>
              <select
                value={selectedHexId}
                onChange={(e) => setSelectedHexId(e.target.value)}
              >
                {friendlyHexes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.terrain.replace(/_/g, " ")})
                  </option>
                ))}
              </select>
            </div>
            <div className="recruitment-control-group">
              <label>Custom Unit Designation (Optional)</label>
              <input
                type="text"
                placeholder="e.g. 1st Royal Marine Commando Flotilla"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>
          </div>

          <div className="archetypes-grid">
            {archetypesList.map((arch) => {
              const isSelected = arch.type === selectedType;
              const hasFunds = funds >= arch.fundsCost;
              const hasProd = productionPoints >= arch.productionCost;
              return (
                <div
                  key={arch.type}
                  className={`archetype-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedType(arch.type)}
                >
                  <div className="archetype-card-header">
                    <span className="archetype-card-title">
                      {arch.displayName}
                    </span>
                    <span className={`archetype-domain-badge ${arch.domain}`}>
                      {arch.domain}
                    </span>
                  </div>
                  <div className="archetype-costs">
                    <span
                      className={`cost-tag funds ${!hasFunds ? "insufficient" : ""}`}
                    >
                      💰 ${arch.fundsCost}
                    </span>
                    <span
                      className={`cost-tag prod ${!hasProd ? "insufficient" : ""}`}
                    >
                      ⚙️ {arch.productionCost} P
                    </span>
                  </div>
                  <div className="archetype-stats-row">
                    <span>
                      Strength: <strong>{arch.defaultStrength}%</strong>
                    </span>
                    <span>
                      AP: <strong>{arch.maxActionPoints}</strong>
                    </span>
                    <span>
                      Upkeep: <strong>${arch.upkeepFundsPerTurn}/d</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Flotilla Order of Battle & Vessel Manifest */}
          {(() => {
            const selectedHex = friendlyHexes.find(
              (h) => h.id === selectedHexId,
            );
            const countryId = selectedHex?.ownership?.countryId || "norway";
            const comp = getFlotillaComposition(
              selectedType,
              countryId,
              "blufor",
            );
            return (
              <div className="flotilla-manifest-panel">
                <div className="flotilla-manifest-header">
                  <div>
                    <h4>⚓ Order of Battle: {comp.callsignPrefix}</h4>
                    <p className="flotilla-manifest-summary">{comp.summary}</p>
                  </div>
                  <div className="flotilla-totals-pills">
                    {comp.totalVessels > 0 && (
                      <span className="flotilla-total-pill">
                        🚢 {comp.totalVessels} Vessels
                      </span>
                    )}
                    {comp.totalSubmarines > 0 && (
                      <span className="flotilla-total-pill">
                        🐬 {comp.totalSubmarines} Submarines
                      </span>
                    )}
                    {comp.totalAircraft > 0 && (
                      <span className="flotilla-total-pill">
                        ✈️ {comp.totalAircraft} Aircraft
                      </span>
                    )}
                    {comp.totalVehicles > 0 && (
                      <span className="flotilla-total-pill">
                        🛡️ {comp.totalVehicles} Vehicles
                      </span>
                    )}
                  </div>
                </div>
                <div className="flotilla-units-list">
                  {comp.units.map((unit) => (
                    <div key={unit.id} className="flotilla-unit-row">
                      <div className="flotilla-unit-main">
                        <span className="flotilla-unit-qty">{unit.count}x</span>
                        <span className="flotilla-unit-name">{unit.name}</span>
                        <span className="flotilla-unit-class">
                          ({unit.unitClass})
                        </span>
                        {unit.isProxy && (
                          <span className="proxy-badge" title={unit.proxyFor}>
                            Vanilla Proxy
                          </span>
                        )}
                      </div>
                      <div className="flotilla-unit-meta">
                        <span className="flotilla-unit-role">{unit.role}</span>
                        <code className="flotilla-ini-tag">
                          {unit.classIniRef}.ini
                        </code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
        <div className="recruitment-modal-footer">
          <button type="button" className="secondary-action" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="recruitment-submit-btn"
            disabled={isRecruiting || !canAfford || !selectedHexId}
            onClick={() => {
              if (selectedHexId) {
                onRecruit({
                  unitType: selectedType,
                  hexId: selectedHexId,
                  customName: customName.trim() || undefined,
                });
              }
            }}
          >
            {isRecruiting
              ? "Procuring Formation..."
              : !canAfford
                ? "Insufficient Funds / Production"
                : `Recruit Formation ($${selectedArchetype.fundsCost} / ${selectedArchetype.productionCost} P)`}
          </button>
        </div>
      </div>
    </div>
  );
}

function MilitarySurplusMarketModal({
  isOpen,
  onClose,
  hexGrid,
  funds,
  catalog,
  pendingOrders,
  onPurchase,
  isPurchasing,
}: {
  isOpen: boolean;
  onClose: () => void;
  hexGrid?: HexGridStateSnapshot | undefined;
  funds: number;
  catalog: MilitaryMarketListing[];
  pendingOrders: MarketOrderRecord[];
  onPurchase: (input: {
    listingId: string;
    targetHexId: string;
    customName?: string | undefined;
  }) => void;
  isPurchasing: boolean;
}): ReactElement | null {
  const [selectedListingId, setSelectedListingId] = useState<string>(
    catalog[0]?.id ?? "surplus-hauk-fast-patrol",
  );
  const [targetHexId, setTargetHexId] = useState<string>("");
  const [customName, setCustomName] = useState<string>("");

  const friendlyPortHexes = useMemo(() => {
    const list = (hexGrid?.hexCells ?? []).filter(
      (h) =>
        h.ownership.side === "blufor" &&
        (h.facilities.includes("naval_base") ||
          h.facilities.includes("air_base") ||
          h.facilities.includes("shipyard") ||
          Boolean(
            h.childSites &&
            h.childSites.some(
              (cs) =>
                cs.kind === "naval_base" ||
                cs.kind === "air_base" ||
                cs.kind === "world_port",
            ),
          )),
    );
    if (list.length > 0) return list;
    return (hexGrid?.hexCells ?? []).filter(
      (h) => h.ownership.side === "blufor",
    );
  }, [hexGrid]);

  useEffect(() => {
    if (!targetHexId && friendlyPortHexes.length > 0) {
      setTargetHexId(friendlyPortHexes[0]!.id);
    }
  }, [friendlyPortHexes, targetHexId]);

  if (!isOpen) return null;

  const selectedListing =
    catalog.find((l) => l.id === selectedListingId) ?? catalog[0];
  const canAfford = selectedListing
    ? funds >= selectedListing.costFunds
    : false;

  return (
    <div className="recruitment-modal-backdrop" onClick={onClose}>
      <div className="recruitment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recruitment-modal-header">
          <h3>🛒 Cold War Surplus Military Market</h3>
          <button
            type="button"
            className="recruitment-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="recruitment-modal-body">
          {pendingOrders.length > 0 && (
            <div
              style={{
                background: "rgba(30, 41, 59, 0.8)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                borderRadius: "6px",
                padding: "10px 14px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  color: "#38bdf8",
                  fontWeight: 600,
                  fontSize: "12px",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                }}
              >
                ⏳ Commissioning & Delivery Queue ({pendingOrders.length})
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {pendingOrders.map((ord) => (
                  <div
                    key={ord.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "12px",
                      background: "rgba(15, 23, 42, 0.6)",
                      padding: "6px 10px",
                      borderRadius: "4px",
                    }}
                  >
                    <span>
                      🚢 <strong>{ord.unitName}</strong> → Sector{" "}
                      {ord.targetHexId}
                    </span>
                    <span style={{ color: "#fbbf24", fontWeight: "bold" }}>
                      {ord.turnsRemaining}{" "}
                      {ord.turnsRemaining === 1 ? "Turn" : "Turns"} Remaining
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="recruitment-controls-row">
            <div className="recruitment-control-group">
              <label>Surplus Listing Catalog</label>
              <select
                value={selectedListingId}
                onChange={(e) => setSelectedListingId(e.target.value)}
              >
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} (${item.costFunds} / {item.deliveryTurns} Turn
                    Delivery)
                  </option>
                ))}
              </select>
            </div>

            <div className="recruitment-control-group">
              <label>Delivery Port Sector</label>
              <select
                value={targetHexId}
                onChange={(e) => setTargetHexId(e.target.value)}
              >
                {friendlyPortHexes.map((hex) => (
                  <option key={hex.id} value={hex.id}>
                    {hex.name} ({hex.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            className="recruitment-control-group"
            style={{ marginTop: "12px" }}
          >
            <label>Custom Unit Name / Callsign (Optional)</label>
            <input
              type="text"
              placeholder={selectedListing?.name ?? "Custom unit name"}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </div>

          {selectedListing && (
            <div
              className="recruitment-preview-panel"
              style={{
                marginTop: "16px",
                background: "rgba(15, 23, 42, 0.7)",
                padding: "12px",
                borderRadius: "6px",
                border: "1px solid rgba(148, 163, 184, 0.2)",
              }}
            >
              <h4 style={{ margin: "0 0 6px", color: "#f8fafc" }}>
                {selectedListing.name}
              </h4>
              <p
                style={{
                  margin: "0 0 10px",
                  color: "#94a3b8",
                  fontSize: "12px",
                }}
              >
                {selectedListing.description}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "8px",
                  fontSize: "11px",
                }}
              >
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.6)",
                    padding: "6px",
                    borderRadius: "4px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Cost:</span>{" "}
                  <strong style={{ color: "#38bdf8" }}>
                    ${selectedListing.costFunds}
                  </strong>
                </div>
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.6)",
                    padding: "6px",
                    borderRadius: "4px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Delivery:</span>{" "}
                  <strong style={{ color: "#fbbf24" }}>
                    {selectedListing.deliveryTurns} Turns
                  </strong>
                </div>
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.6)",
                    padding: "6px",
                    borderRadius: "4px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Origin:</span>{" "}
                  <strong style={{ color: "#f1f5f9" }}>
                    {selectedListing.sourceCountry.toUpperCase()}
                  </strong>
                </div>
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.6)",
                    padding: "6px",
                    borderRadius: "4px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Strength:</span>{" "}
                  <strong style={{ color: "#4ade80" }}>
                    {selectedListing.strength}%
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="recruitment-modal-footer">
          <button
            type="button"
            className="action-button secondary-action"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="recruitment-submit-btn"
            disabled={
              isPurchasing || !canAfford || !targetHexId || !selectedListing
            }
            onClick={() => {
              if (selectedListing && targetHexId) {
                onPurchase({
                  listingId: selectedListing.id,
                  targetHexId,
                  customName: customName.trim() || undefined,
                });
              }
            }}
          >
            {isPurchasing
              ? "Purchasing..."
              : !canAfford
                ? `Insufficient Funds (Need $${selectedListing?.costFunds})`
                : `Purchase & Deploy ($${selectedListing?.costFunds})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export type OllamaStatus = {
  online: boolean;
  activeModel: string;
  availableModels: string[];
  latencyMs: number;
  error?: string;
};

export type CampaignTensionState = {
  campaignId: string;
  tensionIndex: number;
  defconLevel: 1 | 2 | 3 | 4 | 5;
  peaceTurnsCounter: number;
  lastIncidentSummary: string | null;
  updatedAt: string;
};

export type CovertOpType =
  | "SABOTAGE_STOCKPILE_DEPOT"
  | "DISABLE_RADAR_AND_AIR_DEFENSE"
  | "CLANDESTINE_SEA_MINING"
  | "INDUSTRIAL_DISRUPTION"
  | "PROXY_SUBMARINE_INCURSION"
  | "SPECIAL_FORCES_RAID";

export type CovertOpCatalogListing = {
  opType: CovertOpType;
  title: string;
  summary: string;
  fundsCost: number;
  baseSuccessRate: number;
  baseAttributionRisk: number;
  tensionImpact: number;
};

export type CovertOperationRecord = {
  id: string;
  campaignId: string;
  sourceCountryId: string;
  targetCountryId: string;
  targetHexId: string;
  opType: CovertOpType;
  status: "planned" | "success" | "failed" | "compromised";
  fundsCost: number;
  successChance: number;
  attributionRisk: number;
  detected: boolean;
  resultSummary: string;
  createdAt: string;
  updatedAt: string;
};

export type DiplomaticCable = {
  id: string;
  senderCountryId: string;
  recipientCountryId: string;
  classification: string;
  header: string;
  content: string;
  stanceChange?: string | undefined;
  isRead: boolean;
  createdAt: string;
};

export type WorldNewsDispatch = {
  id: string;
  campaignId: string;
  agency: string;
  headline: string;
  body: string;
  category: string;
  createdAt: string;
};

export type DiplomaticNegotiationResponse = {
  decision:
    "accept" | "reject" | "counter_offer" | "demand_tribute" | "threaten_war";
  reasoning: string;
  diplomaticDialogue: string;
  source: "ollama_llm" | "heuristic_ai";
  modelUsed?: string | undefined;
  counterTerms?:
    | {
        durationTurns?: number | undefined;
        demandedFunds?: number | undefined;
        demandedFuel?: number | undefined;
        demandedProduction?: number | undefined;
        conditionSummary?: string | undefined;
      }
    | undefined;
  ratifiedTreaty?: DiplomaticTreatyRecord | undefined;
  thirdPartyFalloutCables?: DiplomaticCable[] | undefined;
  triggeredCovertOpSummary?: string | undefined;
  updatedRelations?: BilateralRelationshipDetails | undefined;
};

export type CasusBelliPretext = {
  name: string;
  pretextSummary: string;
  historicalAnalog: string;
  legitimacyOdds: number;
  triggerThreshold: number;
  casusBelliType: string;
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
  mode: "offer" | "demand";
  funds?: number | undefined;
  fuel?: number | undefined;
  production?: number | undefined;
  techSharing?: boolean | undefined;
  transferredFormationId?: string | undefined;
  cededHexId?: string | undefined;
};

export type BilateralRelationshipDetails = {
  score: number;
  stance: "allied" | "friendly" | "neutral" | "strained" | "hostile" | "war";
  sentimentLabel: string;
  baselineReason?: string | undefined;
  events?: DiplomaticRelationEvent[] | undefined;
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
        durationTurns?: number | undefined;
        conditionSummary: string;
      }
    | undefined;
};

function CovertOperationsModal({
  isOpen,
  onClose,
  hexGrid,
  funds,
  catalog,
  operations,
  onLaunch,
  isLaunching,
}: {
  isOpen: boolean;
  onClose: () => void;
  hexGrid: HexGridStateSnapshot | undefined;
  funds: number;
  catalog: CovertOpCatalogListing[];
  operations: CovertOperationRecord[];
  onLaunch: (input: {
    targetCountryId: string;
    targetHexId: string;
    opType: CovertOpType;
  }) => void;
  isLaunching: boolean;
}): ReactElement | null {
  const [selectedOpType, setSelectedOpType] = useState<CovertOpType>(
    "SABOTAGE_STOCKPILE_DEPOT",
  );
  const [targetHexId, setTargetHexId] = useState<string>("hex-sov-murmansk");
  const [targetCountryId, setTargetCountryId] =
    useState<string>("soviet-union");

  if (!isOpen) return null;

  const effectiveCatalog =
    catalog && catalog.length > 0 ? catalog : COVERT_OPS_CATALOG;
  const currentOp =
    effectiveCatalog.find((c) => c.opType === selectedOpType) ??
    effectiveCatalog[0]!;
  const targetHexes =
    hexGrid?.hexCells.filter((h) => h.ownership.side !== "blufor") ?? [];

  return (
    <div className="recruitment-modal-backdrop" onClick={onClose}>
      <div
        className="recruitment-modal"
        style={{ maxWidth: "800px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="recruitment-modal-header"
          style={{ borderBottomColor: "#dc2626" }}
        >
          <h3 style={{ color: "#f87171" }}>
            🗡️ Clandestine Black Operations & Sabotage
          </h3>
          <button
            type="button"
            className="recruitment-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="recruitment-modal-body">
          {/* Operation Cards Selection */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            {catalog.map((op) => {
              const isSelected = op.opType === selectedOpType;
              return (
                <div
                  key={op.opType}
                  onClick={() => setSelectedOpType(op.opType)}
                  style={{
                    background: isSelected
                      ? "rgba(220, 38, 38, 0.2)"
                      : "rgba(30, 41, 59, 0.6)",
                    border: `1px solid ${
                      isSelected ? "#ef4444" : "rgba(148, 163, 184, 0.2)"
                    }`,
                    borderRadius: "6px",
                    padding: "10px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: "13px",
                      color: isSelected ? "#fca5a5" : "#f1f5f9",
                      marginBottom: "4px",
                    }}
                  >
                    {op.title}
                  </div>
                  <p
                    style={{
                      margin: "0 0 6px 0",
                      fontSize: "11px",
                      color: "#94a3b8",
                    }}
                  >
                    {op.summary}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      fontWeight: "bold",
                    }}
                  >
                    <span style={{ color: "#38bdf8" }}>
                      Cost: ${op.fundsCost}
                    </span>
                    <span style={{ color: "#4ade80" }}>
                      Success: {Math.round(op.baseSuccessRate * 100)}%
                    </span>
                    <span style={{ color: "#fb923c" }}>
                      Risk: {Math.round(op.baseAttributionRisk * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Operation Target Selector */}
          <div className="recruitment-controls-row">
            <div className="recruitment-control-group">
              <label>Target Nation</label>
              <select
                value={targetCountryId}
                onChange={(e) => setTargetCountryId(e.target.value)}
              >
                <option value="soviet-union">Soviet Union (OPFOR)</option>
                <option value="east-germany">East Germany (OPFOR)</option>
                <option value="poland">Poland (OPFOR)</option>
                <option value="sweden">Sweden (Neutral)</option>
                <option value="finland">Finland (Neutral)</option>
              </select>
            </div>

            <div className="recruitment-control-group">
              <label>Target Strategic Sector</label>
              <select
                value={targetHexId}
                onChange={(e) => setTargetHexId(e.target.value)}
              >
                {targetHexes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.ownership.countryId})
                  </option>
                ))}
                {targetHexes.length === 0 && (
                  <option value="hex-sov-murmansk">
                    Murmansk Naval Bastion (soviet-union)
                  </option>
                )}
              </select>
            </div>
          </div>

          {/* History of Covert Actions */}
          <div
            style={{
              marginTop: "16px",
              background: "rgba(15, 23, 42, 0.8)",
              padding: "10px",
              borderRadius: "6px",
              maxHeight: "140px",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#94a3b8",
                marginBottom: "6px",
                textTransform: "uppercase",
              }}
            >
              Clandestine Intelligence Log ({operations.length})
            </div>
            {operations.length === 0 ? (
              <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                No covert operations launched yet.
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {operations.map((op) => (
                  <div
                    key={op.id}
                    style={{
                      fontSize: "11px",
                      padding: "6px 8px",
                      borderRadius: "4px",
                      background: op.detected
                        ? "rgba(239, 68, 68, 0.15)"
                        : "rgba(34, 197, 94, 0.15)",
                      border: `1px solid ${
                        op.detected
                          ? "rgba(239, 68, 68, 0.4)"
                          : "rgba(34, 197, 94, 0.4)"
                      }`,
                    }}
                  >
                    <strong>{op.opType}</strong> against{" "}
                    <em>{op.targetHexId}</em> ({op.targetCountryId}):{" "}
                    <span>{op.resultSummary}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="recruitment-modal-footer">
          <button
            type="button"
            className="action-button secondary-action"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="recruitment-submit-btn"
            style={{ background: "#dc2626" }}
            disabled={isLaunching || funds < currentOp.fundsCost}
            onClick={() => {
              onLaunch({
                targetCountryId,
                targetHexId,
                opType: currentOp.opType,
              });
            }}
          >
            {isLaunching
              ? "Executing Infiltration..."
              : funds < currentOp.fundsCost
                ? `Insufficient Funds ($${currentOp.fundsCost})`
                : `Authorize Black Op ($${currentOp.fundsCost})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function DiplomaticTreatiesModal({
  isOpen,
  onClose,
  treaties,
  cables,
  onNegotiate,
  isNegotiating,
  latestNegotiation,
  onAcceptCounterOffer,
  isAcceptingCounter,
  onDeclineCounterOffer,
  isDecliningCounter,
  onClearNegotiation,
  diplomacyError,
  onClearDiplomacyError,
  playerFunds,
  playerFuel,
  playerProduction,
  playerFormations = [],
  playerHexes = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  treaties: DiplomaticTreatyRecord[];
  cables: DiplomaticCable[];
  onNegotiate: (input: {
    treatyType: string;
    targetCountryId: string;
    durationTurns: number;
    offeredTributeFunds?: number | undefined;
    tribute?: TributePackage | undefined;
  }) => void;
  isNegotiating: boolean;
  latestNegotiation: DiplomaticNegotiationResponse | null;
  onAcceptCounterOffer: (input: {
    targetCountryId: string;
    treatyType: string;
    durationTurns: number;
    demandedFunds?: number | undefined;
    demandedFuel?: number | undefined;
    demandedProduction?: number | undefined;
    conditionSummary?: string | undefined;
  }) => void;
  isAcceptingCounter: boolean;
  onDeclineCounterOffer: (input: {
    targetCountryId: string;
    treatyType: string;
    reason?: string;
  }) => void;
  isDecliningCounter: boolean;
  onClearNegotiation: () => void;
  diplomacyError?: string | null | undefined;
  onClearDiplomacyError?: (() => void) | undefined;
  playerFunds: number;
  playerFuel: number;
  playerProduction: number;
  playerFormations?: CampaignFormation[] | undefined;
  playerHexes?: StrategicHexCell[] | undefined;
}): ReactElement | null {
  const [targetCountryId, setTargetCountryId] =
    useState<string>("soviet-union");
  const [treatyType, setTreatyType] = useState<string>("ceasefire");
  const [durationTurns, setDurationTurns] = useState<number>(30);
  const [tributeMode, setTributeMode] = useState<"offer" | "demand">("offer");
  const [tributeFunds, setTributeFunds] = useState<number>(0);
  const [tributeFuel, setTributeFuel] = useState<number>(0);
  const [tributeProduction, setTributeProduction] = useState<number>(0);
  const [tributeTech, setTributeTech] = useState<boolean>(false);
  const [tributeFormationId, setTributeFormationId] = useState<string>("");
  const [tributeHexId, setTributeHexId] = useState<string>("");
  const [isLedgerExpanded, setIsLedgerExpanded] = useState<boolean>(true);
  const [counterAdjustment, setCounterAdjustment] = useState<{
    funds?: number;
    fuel?: number;
    production?: number;
    duration?: number;
  } | null>(null);
  const [isJustArrived, setIsJustArrived] = useState<boolean>(false);
  const [formGuidanceNotice, setFormGuidanceNotice] = useState<string | null>(
    null,
  );

  const modalBodyRef = useRef<HTMLDivElement>(null);
  const answerCardRef = useRef<HTMLDivElement>(null);
  const proposalSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (latestNegotiation) {
      setIsJustArrived(true);
      if (modalBodyRef.current) {
        modalBodyRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
      answerCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      const timer = setTimeout(() => setIsJustArrived(false), 2200);
      return () => clearTimeout(timer);
    }
  }, [latestNegotiation]);

  // Dynamic duration bounds based on treaty type
  const durationBounds = useMemo(() => {
    switch (treatyType) {
      case "ceasefire":
        return { min: 7, max: 60, def: 30, unit: "Days (Armistice)" };
      case "military_transit_rights":
        return { min: 14, max: 180, def: 90, unit: "Days (Transit Rights)" };
      case "basing_rights":
        return { min: 30, max: 180, def: 90, unit: "Days (Basing Rights)" };
      case "trade_agreement":
        return { min: 30, max: 365, def: 180, unit: "Days (Trade Agreement)" };
      case "joint_production_pact":
        return { min: 60, max: 365, def: 180, unit: "Days (Joint Production)" };
      case "science_tech_sharing":
        return {
          min: 60,
          max: 365,
          def: 180,
          unit: "Days (Defense Science & Tech)",
        };
      case "non_aggression":
        return { min: 30, max: 365, def: 180, unit: "Days (Non-Aggression)" };
      case "alliance":
      case "mutual_defense":
      default:
        return { min: 60, max: 365, def: 365, unit: "Days (Alliance)" };
    }
  }, [treatyType]);

  const handleTreatyTypeChange = (newType: string) => {
    setTreatyType(newType);
    let def = 30;
    if (newType === "military_transit_rights" || newType === "basing_rights")
      def = 90;
    else if (
      newType === "non_aggression" ||
      newType === "trade_agreement" ||
      newType === "joint_production_pact" ||
      newType === "science_tech_sharing"
    )
      def = 180;
    else if (newType === "alliance" || newType === "mutual_defense") def = 365;
    setDurationTurns(def);
  };

  const treatyOdds = useQuery({
    queryKey: [
      "treatyOdds",
      targetCountryId,
      treatyType,
      durationTurns,
      tributeMode,
      tributeFunds,
      tributeFuel,
      tributeProduction,
      tributeTech,
      tributeFormationId,
      tributeHexId,
    ],
    queryFn: () => {
      const q = new URLSearchParams({
        targetCountryId,
        treatyType,
        durationTurns: String(durationTurns),
        tributeMode,
        offeredTributeFunds: String(tributeFunds),
        offeredTributeFuel: String(tributeFuel),
        offeredTributeProduction: String(tributeProduction),
        techSharing: String(tributeTech),
      });
      if (tributeFormationId)
        q.set("transferredFormationId", tributeFormationId);
      if (tributeHexId) q.set("cededHexId", tributeHexId);
      return api<{
        ok: boolean;
        odds: DiplomaticOddsCalculation;
        eligible: boolean;
        reason?: string;
      }>(`/api/v1/campaigns/current/diplomacy/odds?${q.toString()}`);
    },
    enabled: isOpen,
  });

  const bilateralRelations = useQuery({
    queryKey: ["bilateralRelations", targetCountryId],
    queryFn: () =>
      api<{
        ok: boolean;
        relations: BilateralRelationshipDetails;
      }>(
        `/api/v1/campaigns/current/diplomacy/relations?targetCountryId=${encodeURIComponent(targetCountryId)}`,
      ),
    enabled: isOpen,
  });

  const rel =
    bilateralRelations.data?.relations ??
    treatyOdds.data?.odds?.relationshipDetails;

  if (!isOpen) return null;

  return (
    <div className="recruitment-modal-backdrop" onClick={onClose}>
      <div
        className="recruitment-modal"
        style={{ maxWidth: "780px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="recruitment-modal-header">
          <h3>📜 Autonomous Diplomatic Cables & Treaties</h3>
          <button
            type="button"
            className="recruitment-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div
          className="recruitment-modal-body"
          ref={modalBodyRef}
          style={{ maxHeight: "75vh", overflowY: "auto" }}
        >
          {/* Active Treaties Banner */}
          <div
            style={{
              background: "rgba(30, 41, 59, 0.8)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "6px",
              padding: "10px 14px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontWeight: 600,
                fontSize: "12px",
                marginBottom: "6px",
                textTransform: "uppercase",
              }}
            >
              Active Ratified Treaties ({treaties.length})
            </div>
            {treaties.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b", fontSize: "12px" }}>
                No active bilateral treaties in effect.
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {treaties.map((t) => {
                  let badge = "🤝";
                  if (t.treatyType === "military_transit_rights") badge = "✈️";
                  if (t.treatyType === "basing_rights") badge = "⚓";
                  return (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        background: "rgba(15, 23, 42, 0.6)",
                        padding: "6px 10px",
                        borderRadius: "4px",
                      }}
                    >
                      <span>
                        {badge} <strong>{t.treatyType.toUpperCase()}</strong> (
                        {t.partyACountryId} & {t.partyBCountryId})
                      </span>
                      <span style={{ color: "#4ade80", fontWeight: "bold" }}>
                        {t.turnsRemaining} Days Remaining
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {diplomacyError && (
            <div
              style={{
                background: "rgba(220, 38, 38, 0.25)",
                border: "1px solid #ef4444",
                borderRadius: "6px",
                padding: "10px 14px",
                marginBottom: "14px",
                fontSize: "12px",
                color: "#fca5a5",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>⚠️ {diplomacyError}</span>
              {onClearDiplomacyError && (
                <button
                  type="button"
                  onClick={onClearDiplomacyError}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#fca5a5",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: "14px",
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Diplomatic Telegram Cable Received */}
          {latestNegotiation && (
            <div
              ref={answerCardRef}
              className={isJustArrived ? "diplomatic-arrival-card" : undefined}
              style={{
                background: "rgba(15, 23, 42, 0.95)",
                border: isJustArrived
                  ? "2px solid #38bdf8"
                  : "2px solid rgba(56, 189, 248, 0.6)",
                borderRadius: "8px",
                padding: "14px",
                marginBottom: "16px",
                boxShadow: isJustArrived
                  ? "0 0 24px rgba(56, 189, 248, 0.5)"
                  : "0 4px 12px rgba(0,0,0,0.4)",
                transition: "all 0.4s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid #1e293b",
                  paddingBottom: "8px",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: "bold",
                      color: "#38bdf8",
                      letterSpacing: "1px",
                    }}
                  >
                    📠 DIPLOMATIC TELEGRAM / AMBASSADORIAL CABLE
                  </span>
                  {isJustArrived && (
                    <span
                      style={{
                        background: "#0284c7",
                        color: "#ffffff",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        fontWeight: "bold",
                        letterSpacing: "0.5px",
                        animation: "diplomaticPulse 1.2s infinite",
                      }}
                    >
                      ✨ NEW COMMUNIQUE RECEIVED
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background:
                      latestNegotiation.decision === "accept"
                        ? "#15803d"
                        : latestNegotiation.decision === "threaten_war"
                          ? "#b91c1c"
                          : latestNegotiation.decision === "counter_offer"
                            ? "#d97706"
                            : "#64748b",
                    color: "#fff",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                  }}
                >
                  DECISION: {latestNegotiation.decision.replace(/_/g, " ")}
                </span>
              </div>

              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "13px",
                  lineHeight: "1.5",
                  color: "#f8fafc",
                  background: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  padding: "12px",
                  marginBottom: "10px",
                  fontStyle: "italic",
                }}
              >
                "{latestNegotiation.diplomaticDialogue}"
              </div>

              <div
                style={{
                  fontSize: "11px",
                  color: "#94a3b8",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>
                  <strong>Assessment:</strong> {latestNegotiation.reasoning}
                </span>
                <span style={{ color: "#38bdf8" }}>
                  {latestNegotiation.source === "ollama_llm"
                    ? `🟢 Model: ${latestNegotiation.modelUsed || "Ollama"}`
                    : "🟡 Heuristic Strategic AI"}
                </span>
              </div>

              {/* Counter-Offer Interactive Card */}
              {latestNegotiation.counterTerms && (() => {
                const origFunds =
                  latestNegotiation.counterTerms.demandedFunds ?? 0;
                const origFuel =
                  latestNegotiation.counterTerms.demandedFuel ?? 0;
                const origProd =
                  latestNegotiation.counterTerms.demandedProduction ?? 0;

                const effFunds =
                  counterAdjustment?.funds !== undefined
                    ? counterAdjustment.funds
                    : origFunds;
                const effFuel =
                  counterAdjustment?.fuel !== undefined
                    ? counterAdjustment.fuel
                    : origFuel;
                const effProduction =
                  counterAdjustment?.production !== undefined
                    ? counterAdjustment.production
                    : origProd;
                const effDuration =
                  counterAdjustment?.duration ??
                  latestNegotiation.counterTerms.durationTurns ??
                  durationTurns;

                const fundsExceeded = effFunds > playerFunds;
                const fuelExceeded = effFuel > playerFuel;
                const prodExceeded = effProduction > playerProduction;
                const hasExceededReserves =
                  fundsExceeded || fuelExceeded || prodExceeded;

                return (
                  <div
                    style={{
                      marginTop: "12px",
                      background: "rgba(180, 83, 9, 0.2)",
                      border: "1px solid #f59e0b",
                      borderRadius: "6px",
                      padding: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "6px",
                      }}
                    >
                      <strong style={{ color: "#f59e0b", fontSize: "12px" }}>
                        ⚖️ DIPLOMATIC COUNTER-PROPOSAL: COMPENSATORY SECURITY
                        INDEMNITY
                      </strong>
                      <span style={{ fontSize: "11px", color: "#fde68a" }}>
                        CONCESSIONS REQUIRED
                      </span>
                    </div>
                    <p
                      style={{
                        margin: "0 0 10px 0",
                        fontSize: "12px",
                        color: "#fef3c7",
                      }}
                    >
                      {latestNegotiation.counterTerms.conditionSummary ||
                        "The foreign government has countered with compensatory security demands."}
                    </p>

                    {/* Interactive 3-Asset Adjustment Sliders */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: "10px",
                        marginBottom: "10px",
                      }}
                    >
                      {/* Funds Slider */}
                      <div
                        style={{
                          background: "rgba(0,0,0,0.35)",
                          padding: "8px 10px",
                          borderRadius: "4px",
                          border: `1px solid ${fundsExceeded ? "#ef4444" : "rgba(148, 163, 184, 0.2)"}`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "11px",
                            marginBottom: "4px",
                          }}
                        >
                          <strong>Treasury Funds:</strong>
                          <span
                            style={{
                              color: fundsExceeded ? "#f87171" : "#fef08a",
                              fontWeight: "bold",
                            }}
                          >
                            ${effFunds}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(origFunds, 1000)}
                          step={25}
                          value={effFunds}
                          onChange={(e) =>
                            setCounterAdjustment({
                              funds: Number(e.target.value),
                              fuel: effFuel,
                              production: effProduction,
                              duration: effDuration,
                            })
                          }
                          style={{ width: "100%" }}
                        />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "10px",
                            marginTop: "4px",
                          }}
                        >
                          <span
                            style={{
                              color: fundsExceeded ? "#f87171" : "#94a3b8",
                            }}
                          >
                            {fundsExceeded
                              ? `⚠️ Short by $${effFunds - playerFunds}`
                              : `Stock: $${playerFunds}`}
                          </span>
                          <button
                            type="button"
                            style={{
                              background: "none",
                              border: "none",
                              color: "#38bdf8",
                              cursor: "pointer",
                              fontSize: "10px",
                              textDecoration: "underline",
                            }}
                            onClick={() =>
                              setCounterAdjustment({
                                funds: effFunds === 0 ? origFunds : 0,
                                fuel: effFuel,
                                production: effProduction,
                                duration: effDuration,
                              })
                            }
                          >
                            {effFunds === 0
                              ? `Reset ($${origFunds})`
                              : "Waive ($0)"}
                          </button>
                        </div>
                      </div>

                      {/* Fuel Slider */}
                      <div
                        style={{
                          background: "rgba(0,0,0,0.35)",
                          padding: "8px 10px",
                          borderRadius: "4px",
                          border: `1px solid ${fuelExceeded ? "#ef4444" : "rgba(148, 163, 184, 0.2)"}`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "11px",
                            marginBottom: "4px",
                          }}
                        >
                          <strong>Naval Fuel:</strong>
                          <span
                            style={{
                              color: fuelExceeded ? "#f87171" : "#fef08a",
                              fontWeight: "bold",
                            }}
                          >
                            {effFuel} bbl
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(origFuel, 500)}
                          step={20}
                          value={effFuel}
                          onChange={(e) =>
                            setCounterAdjustment({
                              funds: effFunds,
                              fuel: Number(e.target.value),
                              production: effProduction,
                              duration: effDuration,
                            })
                          }
                          style={{ width: "100%" }}
                        />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "10px",
                            marginTop: "4px",
                          }}
                        >
                          <span
                            style={{
                              color: fuelExceeded ? "#f87171" : "#94a3b8",
                            }}
                          >
                            {fuelExceeded
                              ? `⚠️ Short by ${effFuel - playerFuel} bbl`
                              : `Stock: ${playerFuel} bbl`}
                          </span>
                          <button
                            type="button"
                            style={{
                              background: "none",
                              border: "none",
                              color: "#38bdf8",
                              cursor: "pointer",
                              fontSize: "10px",
                              textDecoration: "underline",
                            }}
                            onClick={() =>
                              setCounterAdjustment({
                                funds: effFunds,
                                fuel: effFuel === 0 ? origFuel : 0,
                                production: effProduction,
                                duration: effDuration,
                              })
                            }
                          >
                            {effFuel === 0
                              ? `Reset (${origFuel} bbl)`
                              : "Waive (0 bbl)"}
                          </button>
                        </div>
                      </div>

                      {/* Production Slider */}
                      <div
                        style={{
                          background: "rgba(0,0,0,0.35)",
                          padding: "8px 10px",
                          borderRadius: "4px",
                          border: `1px solid ${prodExceeded ? "#ef4444" : "rgba(148, 163, 184, 0.2)"}`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "11px",
                            marginBottom: "4px",
                          }}
                        >
                          <strong>Production Quota:</strong>
                          <span
                            style={{
                              color: prodExceeded
                                ? "#f87171"
                                : effProduction === 0
                                  ? "#4ade80"
                                  : "#fef08a",
                              fontWeight: "bold",
                            }}
                          >
                            {effProduction > 0
                              ? `${effProduction} PP`
                              : "0 PP (Waived)"}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(origProd, 200)}
                          step={10}
                          value={effProduction}
                          onChange={(e) =>
                            setCounterAdjustment({
                              funds: effFunds,
                              fuel: effFuel,
                              production: Number(e.target.value),
                              duration: effDuration,
                            })
                          }
                          style={{ width: "100%" }}
                        />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "10px",
                            marginTop: "4px",
                          }}
                        >
                          <span
                            style={{
                              color: prodExceeded ? "#f87171" : "#94a3b8",
                            }}
                          >
                            {prodExceeded
                              ? `⚠️ Short by ${effProduction - playerProduction} PP`
                              : `Stock: ${playerProduction} PP`}
                          </span>
                          <button
                            type="button"
                            style={{
                              background: "none",
                              border: "none",
                              color: "#38bdf8",
                              cursor: "pointer",
                              fontSize: "10px",
                              textDecoration: "underline",
                            }}
                            onClick={() =>
                              setCounterAdjustment({
                                funds: effFunds,
                                fuel: effFuel,
                                production: effProduction === 0 ? origProd : 0,
                                duration: effDuration,
                              })
                            }
                          >
                            {effProduction === 0
                              ? `Reset (${origProd} PP)`
                              : "Waive (0 PP)"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sufficiency Status Banner */}
                    <div
                      style={{
                        fontSize: "11px",
                        marginBottom: "10px",
                        padding: "6px 10px",
                        borderRadius: "4px",
                        background: hasExceededReserves
                          ? "rgba(220, 38, 38, 0.2)"
                          : "rgba(22, 163, 74, 0.2)",
                        border: `1px solid ${hasExceededReserves ? "#ef4444" : "#22c55e"}`,
                        color: hasExceededReserves ? "#fca5a5" : "#86efac",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        {hasExceededReserves
                          ? "⚠️ Demanded concessions exceed current national reserves. Use sliders or 'Waive' buttons to adjust downward."
                          : "✓ Counter-concessions within national strategic reserves. Ready for ratification."}
                      </span>
                      <button
                        type="button"
                        style={{
                          background: "none",
                          border: "1px solid currentColor",
                          color: "inherit",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          fontSize: "10px",
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          setCounterAdjustment({
                            funds: 0,
                            fuel: 0,
                            production: 0,
                            duration: effDuration,
                          })
                        }
                      >
                        ⚡ Waive All to Zero
                      </button>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "8px",
                      }}
                    >
                      <button
                        type="button"
                        className="recruitment-cancel-btn"
                        style={{
                          background: "rgba(239, 68, 68, 0.2)",
                          borderColor: "#ef4444",
                          color: "#fca5a5",
                          fontSize: "12px",
                          padding: "6px 14px",
                        }}
                        disabled={isDecliningCounter || isAcceptingCounter}
                        onClick={() => {
                          onDeclineCounterOffer({
                            targetCountryId,
                            treatyType,
                            reason:
                              "Leadership rejected foreign compensatory indemnity demands",
                          });
                        }}
                      >
                        {isDecliningCounter ? "Declining..." : "Decline Demands"}
                      </button>
                      <button
                        type="button"
                        className="recruitment-cancel-btn"
                        style={{
                          background: "rgba(245, 158, 11, 0.2)",
                          borderColor: "#f59e0b",
                          color: "#fcd34d",
                          fontSize: "12px",
                          padding: "6px 14px",
                        }}
                        disabled={isDecliningCounter || isAcceptingCounter}
                        onClick={() => {
                          if (latestNegotiation.counterTerms) {
                            if (
                              latestNegotiation.counterTerms.durationTurns !==
                              undefined
                            ) {
                              setDurationTurns(
                                latestNegotiation.counterTerms.durationTurns,
                              );
                            }
                            setTributeMode("offer");
                            setTributeFunds(Math.min(1000, effFunds));
                            setTributeFuel(Math.min(500, effFuel));
                            setTributeProduction(Math.min(200, effProduction));
                            setFormGuidanceNotice(
                              "💡 Counter-demands transferred to proposal builder below. Adjust concessions and transmit.",
                            );
                            proposalSectionRef.current?.scrollIntoView({
                              behavior: "smooth",
                            });
                          }
                        }}
                      >
                        Adjust & Counter-Offer
                      </button>
                      <button
                        type="button"
                        className="recruitment-submit-btn"
                        style={{
                          background: hasExceededReserves
                            ? "#334155"
                            : "#16a34a",
                          borderColor: hasExceededReserves
                            ? "#475569"
                            : "#22c55e",
                          fontSize: "12px",
                          padding: "6px 14px",
                          cursor: hasExceededReserves
                            ? "not-allowed"
                            : "pointer",
                        }}
                        disabled={
                          isAcceptingCounter ||
                          isDecliningCounter ||
                          hasExceededReserves
                        }
                        onClick={() => {
                          onAcceptCounterOffer({
                            targetCountryId,
                            treatyType,
                            durationTurns: effDuration,
                            demandedFunds: effFunds,
                            demandedFuel: effFuel,
                            demandedProduction: effProduction,
                            conditionSummary: `Bilateral counter-terms ratified ($${effFunds} funds, ${effFuel} bbl fuel, ${effProduction} PP).`,
                          });
                        }}
                      >
                        {isAcceptingCounter
                          ? "Ratifying Accord..."
                          : `Accept & Ratify ($${effFunds}, ${effFuel} bbl, ${effProduction} PP)`}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Third-Party Diplomatic Fallout Alert Cables */}
              {latestNegotiation.thirdPartyFalloutCables &&
                latestNegotiation.thirdPartyFalloutCables.length > 0 && (
                  <div
                    style={{
                      marginTop: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {latestNegotiation.thirdPartyFalloutCables.map((cable) => (
                      <div
                        key={cable.id}
                        style={{
                          background: "rgba(127, 29, 29, 0.4)",
                          border: "1px solid #ef4444",
                          borderRadius: "6px",
                          padding: "10px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "11px",
                            fontWeight: "bold",
                            color: "#fca5a5",
                            marginBottom: "4px",
                          }}
                        >
                          <span>
                            ⚡ {cable.classification} — {cable.header}
                          </span>
                          {cable.stanceChange && (
                            <span
                              style={{
                                background: "#7f1d1d",
                                padding: "1px 6px",
                                borderRadius: "3px",
                                color: "#fecaca",
                              }}
                            >
                              STATUS: {cable.stanceChange.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: "12px",
                            color: "#fee2e2",
                            fontStyle: "italic",
                          }}
                        >
                          "{cable.content}"
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* STEP 1: TARGET FOREIGN GOVERNMENT */}
          <div
            style={{
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(56, 189, 248, 0.4)",
              borderRadius: "8px",
              padding: "12px 14px",
              marginBottom: "14px",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: "bold",
                color: "#38bdf8",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                marginBottom: "6px",
              }}
            >
              Step 1: Select Target Foreign Government
            </label>
            <select
              value={targetCountryId}
              onChange={(e) => setTargetCountryId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#0f172a",
                border: "1px solid #475569",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              <option value="soviet-union">
                🇷🇺 Soviet Union (STAVKA / Andropov)
              </option>
              <option value="sweden">
                🇸🇪 Sweden (Palme / Armed Neutrality)
              </option>
              <option value="finland">
                🇫🇮 Finland (Koivisto / FCMA Treaty)
              </option>
              <option value="united-states">
                🇺🇸 United States (Reagan / SACEUR)
              </option>
              <option value="united-kingdom">
                🇬🇧 United Kingdom (Thatcher / NATO)
              </option>
              <option value="east-germany">
                🇩🇩 East Germany (SED / Honecker)
              </option>
              <option value="poland">🇵🇱 Poland (Warsaw Pact)</option>
            </select>
          </div>

          {/* STEP 2: BILATERAL DIPLOMATIC STANCE & EVENT LEDGER */}
          {rel && (
            <div
              style={{
                marginBottom: "14px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid #334155",
                borderRadius: "8px",
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "bold",
                    color: "#f8fafc",
                  }}
                >
                  🌐 Step 2: Bilateral Diplomatic Stance:{" "}
                  <span
                    style={{
                      color:
                        rel.score >= 50
                          ? "#4ade80"
                          : rel.score >= 0
                            ? "#38bdf8"
                            : rel.score >= -50
                              ? "#fbbf24"
                              : "#f87171",
                    }}
                  >
                    {rel.score > 0 ? "+" : ""}
                    {rel.score} / 100 [{rel.sentimentLabel}]
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    padding: "3px 10px",
                    borderRadius: "4px",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    background:
                      rel.stance === "allied"
                        ? "#166534"
                        : rel.stance === "friendly"
                          ? "#0369a1"
                          : rel.stance === "neutral"
                            ? "#334155"
                            : rel.stance === "strained"
                              ? "#854d0e"
                              : "#991b1b",
                    color: "#fff",
                  }}
                >
                  {rel.stance}
                </div>
              </div>

              {/* Relationship Slider Gauge */}
              <div
                style={{
                  height: "6px",
                  background:
                    "linear-gradient(to right, #ef4444 0%, #f59e0b 35%, #64748b 50%, #38bdf8 65%, #22c55e 100%)",
                  borderRadius: "3px",
                  position: "relative",
                  marginBottom: "12px",
                }}
              >
                {/* Needle */}
                <div
                  style={{
                    position: "absolute",
                    top: "-3px",
                    left: `${Math.max(
                      0,
                      Math.min(100, (rel.score + 100) / 2),
                    )}%`,
                    transform: "translateX(-50%)",
                    width: "12px",
                    height: "12px",
                    background: "#fff",
                    border: "2px solid #0f172a",
                    borderRadius: "50%",
                    boxShadow: "0 0 4px rgba(0,0,0,0.8)",
                  }}
                />
              </div>

              {/* Bilateral Relations Ledger & Grievances */}
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  borderRadius: "6px",
                  padding: "8px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: isLedgerExpanded ? "8px" : 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      letterSpacing: "0.5px",
                    }}
                  >
                    📜 BILATERAL RELATIONS & GRIEVANCE LEDGER
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsLedgerExpanded(!isLedgerExpanded)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#38bdf8",
                      fontSize: "11px",
                      cursor: "pointer",
                      padding: 0,
                      fontWeight: 600,
                    }}
                  >
                    {isLedgerExpanded ? "Hide Ledger ▲" : "Show Ledger ▼"}
                  </button>
                </div>

                {isLedgerExpanded && (
                  <div
                    style={{
                      maxHeight: "140px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {rel.baselineReason && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          fontSize: "11px",
                          background: "rgba(15, 23, 42, 0.5)",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          borderLeft: `3px solid ${
                            rel.score >= 0 ? "#22c55e" : "#ef4444"
                          }`,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            color: rel.score >= 0 ? "#4ade80" : "#f87171",
                            minWidth: "38px",
                          }}
                        >
                          {rel.score >= 0 ? `+${rel.score}` : `${rel.score}`}
                        </span>
                        <span style={{ color: "#cbd5e1", flex: 1 }}>
                          {rel.baselineReason}
                        </span>
                        <span
                          style={{
                            color: "#64748b",
                            fontSize: "10px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Doctrine Baseline
                        </span>
                      </div>
                    )}

                    {rel.events &&
                      rel.events.map((evt) => (
                        <div
                          key={evt.id}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            fontSize: "11px",
                            background: "rgba(15, 23, 42, 0.4)",
                            padding: "6px 8px",
                            borderRadius: "4px",
                            borderLeft: `3px solid ${
                              evt.deltaScore > 0 ? "#22c55e" : "#ef4444"
                            }`,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                evt.deltaScore > 0 ? "#4ade80" : "#f87171",
                              minWidth: "38px",
                            }}
                          >
                            {evt.deltaScore > 0
                              ? `+${evt.deltaScore}`
                              : `${evt.deltaScore}`}
                          </span>
                          <span style={{ color: "#e2e8f0", flex: 1 }}>
                            {evt.reason}
                          </span>
                          <span
                            style={{
                              color: "#64748b",
                              fontSize: "10px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {new Date(evt.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: TREATY ACCORD & MULTI-ASSET TRIBUTE PROPOSAL */}
          <div
            ref={proposalSectionRef}
            style={{
              background: "rgba(15, 23, 42, 0.7)",
              border: formGuidanceNotice
                ? "1px solid #38bdf8"
                : "1px solid #334155",
              borderRadius: "8px",
              padding: "12px 14px",
              marginBottom: "14px",
              transition: "border 0.3s ease",
            }}
          >
            {formGuidanceNotice && (
              <div
                style={{
                  background: "rgba(14, 165, 233, 0.2)",
                  border: "1px solid #0284c7",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  marginBottom: "10px",
                  fontSize: "12px",
                  color: "#bae6fd",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{formGuidanceNotice}</span>
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#bae6fd",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: "14px",
                  }}
                  onClick={() => setFormGuidanceNotice(null)}
                >
                  ✕
                </button>
              </div>
            )}

            <div
              style={{
                fontSize: "11px",
                fontWeight: "bold",
                color: "#38bdf8",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              Step 3: Treaty Terms & Multi-Asset Tribute Proposal
            </div>

            <div className="recruitment-controls-row">
              <div className="recruitment-control-group">
                <label>Proposed Treaty Type</label>
                <select
                  value={treatyType}
                  onChange={(e) => handleTreatyTypeChange(e.target.value)}
                >
                  <option value="ceasefire">
                    Ceasefire (Hostilities Paused: 7–60 Days)
                  </option>
                  <option value="trade_agreement">
                    🚢 Maritime Trade Agreement (+$40 Funds/Turn: 30–365 Days)
                  </option>
                  <option value="joint_production_pact">
                    🏭 Joint Production Pact (+25 Production/Turn: 60–365 Days)
                  </option>
                  <option value="science_tech_sharing">
                    🔬 Defense Science & Tech Sharing (-15% Upkeep: 60–365 Days)
                  </option>
                  <option value="military_transit_rights">
                    ✈️ Military Transit Rights (Airspace & Waters: 14–180 Days)
                  </option>
                  <option value="basing_rights">
                    ⚓ Basing & Port Access Rights (Naval Facilities: 30–180 Days)
                  </option>
                  <option value="non_aggression">
                    Non-Aggression Pact (30–365 Days)
                  </option>
                  <option value="alliance">
                    Defensive Coalition Alliance (60–365 Days)
                  </option>
                  <option value="mutual_defense">
                    Mutual Defense Pact (60–365 Days)
                  </option>
                </select>
              </div>

              <div className="recruitment-control-group">
                <label>
                  Duration: {durationTurns} {durationBounds.unit}
                </label>
                <input
                  type="range"
                  min={durationBounds.min}
                  max={durationBounds.max}
                  value={durationTurns}
                  onChange={(e) => setDurationTurns(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Tribute Direction Toggle Switch */}
            <div style={{ marginTop: "12px", marginBottom: "10px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#94a3b8",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                }}
              >
                Diplomatic Posture / Tribute Direction
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setTributeMode("offer")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    background:
                      tributeMode === "offer"
                        ? "rgba(34, 197, 94, 0.25)"
                        : "rgba(30, 41, 59, 0.6)",
                    border: `1px solid ${
                      tributeMode === "offer" ? "#22c55e" : "#475569"
                    }`,
                    color: tributeMode === "offer" ? "#86efac" : "#94a3b8",
                  }}
                >
                  🤝 Offer Concession (Sweetener)
                </button>
                <button
                  type="button"
                  onClick={() => setTributeMode("demand")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    background:
                      tributeMode === "demand"
                        ? "rgba(239, 68, 68, 0.25)"
                        : "rgba(30, 41, 59, 0.6)",
                    border: `1px solid ${
                      tributeMode === "demand" ? "#ef4444" : "#475569"
                    }`,
                    color: tributeMode === "demand" ? "#fca5a5" : "#94a3b8",
                  }}
                >
                  🛑 Demand Sovereign Tribute / Ultimatum
                </button>
              </div>
            </div>

            {/* Multi-Asset Tribute Controls */}
            <div
              style={{
                background: "rgba(15, 23, 42, 0.9)",
                border: `1px solid ${
                  tributeMode === "offer"
                    ? "rgba(34, 197, 94, 0.3)"
                    : "rgba(239, 68, 68, 0.3)"
                }`,
                borderRadius: "6px",
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "bold",
                  color: tributeMode === "offer" ? "#86efac" : "#fca5a5",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                }}
              >
                {tributeMode === "offer"
                  ? "Concession Package Offered by National Treasury"
                  : "State Indemnities & Tributes Demanded from Foreign Power"}
              </div>

              {/* Funds, Fuel, Production */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "10px",
                  marginBottom: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      color: "#cbd5e1",
                    }}
                  >
                    Treasury Funds: <strong>${tributeFunds}</strong>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    step={25}
                    value={tributeFunds}
                    onChange={(e) => setTributeFunds(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: "10px", color: "#64748b" }}>
                    Stock: ${playerFunds}
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      color: "#cbd5e1",
                    }}
                  >
                    Naval Fuel: <strong>{tributeFuel} bbl</strong>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={500}
                    step={20}
                    value={tributeFuel}
                    onChange={(e) => setTributeFuel(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: "10px", color: "#64748b" }}>
                    Stock: {playerFuel} bbl
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      color: "#cbd5e1",
                    }}
                  >
                    Production: <strong>{tributeProduction} PP</strong>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={10}
                    value={tributeProduction}
                    onChange={(e) =>
                      setTributeProduction(Number(e.target.value))
                    }
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: "10px", color: "#64748b" }}>
                    Stock: {playerProduction} PP
                  </div>
                </div>
              </div>

              {/* Tech Sharing Checkbox */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "10px",
                  fontSize: "12px",
                  color: "#e2e8f0",
                }}
              >
                <input
                  type="checkbox"
                  id="tech-sharing-toggle"
                  checked={tributeTech}
                  onChange={(e) => setTributeTech(e.target.checked)}
                />
                <label
                  htmlFor="tech-sharing-toggle"
                  style={{ cursor: "pointer" }}
                >
                  🔬 {tributeMode === "offer" ? "Transfer" : "Demand"} Defense
                  Science & Acoustic Sensor Tech License (+12% Odds Sweetener)
                </label>
              </div>

              {/* Formation & Hex Transfers */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      color: "#cbd5e1",
                      marginBottom: "4px",
                    }}
                  >
                    ⚔️{" "}
                    {tributeMode === "offer"
                      ? "Transfer Military Unit"
                      : "Demand Enemy Formation Surrender"}
                  </label>
                  <select
                    value={tributeFormationId}
                    onChange={(e) => setTributeFormationId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      background: "#0f172a",
                      border: "1px solid #475569",
                      borderRadius: "4px",
                      color: "#f8fafc",
                      fontSize: "11px",
                    }}
                  >
                    <option value="">
                      -- None (
                      {tributeMode === "offer"
                        ? "No unit transfer"
                        : "No surrender demand"}
                      ) --
                    </option>
                    {tributeMode === "offer" ? (
                      playerFormations.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.unitType.toUpperCase()})
                        </option>
                      ))
                    ) : (
                      <option value="demand_frontline_dissolution">
                        Frontline Border Patrol Task Group
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      color: "#cbd5e1",
                      marginBottom: "4px",
                    }}
                  >
                    🗺️{" "}
                    {tributeMode === "offer"
                      ? "Cede Sovereign Border Hex"
                      : "Demand Hex Sector Cession"}
                  </label>
                  <select
                    value={tributeHexId}
                    onChange={(e) => setTributeHexId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      background: "#0f172a",
                      border: "1px solid #475569",
                      borderRadius: "4px",
                      color: "#f8fafc",
                      fontSize: "11px",
                    }}
                  >
                    <option value="">
                      -- None (
                      {tributeMode === "offer"
                        ? "No territory ceded"
                        : "No border demanded"}
                      ) --
                    </option>
                    {tributeMode === "offer" ? (
                      playerHexes
                        .filter(
                          (h) =>
                            h.ownership.side === "blufor" ||
                            h.ownership.countryId === "norway",
                        )
                        .slice(0, 15)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            Sector {h.name || h.id} ({h.terrain.toUpperCase()})
                          </option>
                        ))
                    ) : (
                      <option value="demand_demilitarized_buffer">
                        Demilitarized Border Hex Zone
                      </option>
                    )}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Diplomatic Approval Odds Meter */}
          {treatyOdds.data?.odds && (
            <div
              style={{
                marginTop: "14px",
                padding: "12px 14px",
                background: treatyOdds.data.odds.isHardRedline
                  ? "rgba(180, 83, 9, 0.25)"
                  : tributeMode === "demand"
                    ? "rgba(127, 29, 29, 0.35)"
                    : "rgba(15, 23, 42, 0.85)",
                border: `1px solid ${
                  treatyOdds.data.odds.isHardRedline
                    ? "#f59e0b"
                    : tributeMode === "demand"
                      ? "#ef4444"
                      : treatyOdds.data.odds.oddsPercent >= 60
                        ? "#22c55e"
                        : treatyOdds.data.odds.oddsPercent >= 30
                          ? "#f59e0b"
                          : "#ef4444"
                }`,
                borderRadius: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span style={{ fontSize: "16px" }}>
                    {treatyOdds.data.odds.isHardRedline
                      ? "⛔"
                      : tributeMode === "demand"
                        ? "🛑"
                        : treatyOdds.data.odds.oddsPercent >= 60
                          ? "📈"
                          : "⚖️"}
                  </span>
                  <strong
                    style={{
                      fontSize: "12px",
                      letterSpacing: "0.5px",
                      color: treatyOdds.data.odds.isHardRedline
                        ? "#f59e0b"
                        : tributeMode === "demand"
                          ? "#fca5a5"
                          : treatyOdds.data.odds.oddsPercent >= 60
                            ? "#4ade80"
                            : treatyOdds.data.odds.oddsPercent >= 30
                              ? "#fbbf24"
                              : "#f87171",
                    }}
                  >
                    {treatyOdds.data.odds.isHardRedline
                      ? "EXISTENTIAL REDLINE / INAPPLICABLE"
                      : tributeMode === "demand"
                        ? `AGGRESSIVE SOVEREIGN ULTIMATUM — RATIFICATION ODDS: ${treatyOdds.data.odds.oddsPercent}%`
                        : `DIPLOMATIC APPROVAL PROBABILITY: ${treatyOdds.data.odds.oddsPercent}%`}
                  </strong>
                </div>
                {!treatyOdds.data.odds.isHardRedline && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "bold",
                      color:
                        tributeMode === "demand"
                          ? "#f87171"
                          : treatyOdds.data.odds.oddsPercent >= 60
                            ? "#86efac"
                            : treatyOdds.data.odds.oddsPercent >= 30
                              ? "#fde68a"
                              : "#fca5a5",
                    }}
                  >
                    {tributeMode === "demand"
                      ? "High Probability of Indignant Rejection & Crisis"
                      : treatyOdds.data.odds.oddsPercent >= 60
                        ? "Favorable Direct Ratification"
                        : "Compensatory State Indemnities Demanded"}
                  </span>
                )}
              </div>

              {/* Progress Gauge */}
              {!treatyOdds.data.odds.isHardRedline && (
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "rgba(0,0,0,0.5)",
                    borderRadius: "4px",
                    overflow: "hidden",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      width: `${treatyOdds.data.odds.oddsPercent}%`,
                      height: "100%",
                      background:
                        tributeMode === "demand"
                          ? "linear-gradient(90deg, #7f1d1d, #ef4444)"
                          : treatyOdds.data.odds.oddsPercent >= 60
                            ? "linear-gradient(90deg, #16a34a, #22c55e)"
                            : treatyOdds.data.odds.oddsPercent >= 30
                              ? "linear-gradient(90deg, #d97706, #f59e0b)"
                              : "linear-gradient(90deg, #dc2626, #ef4444)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              )}

              {/* Redline Reason or Odds Factors Breakdown */}
              {treatyOdds.data.odds.isHardRedline ? (
                <div style={{ fontSize: "12px", color: "#fef3c7" }}>
                  <strong>Policy Doctrine:</strong>{" "}
                  {treatyOdds.data.odds.redlineReason}
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      marginBottom: "6px",
                    }}
                  >
                    {treatyOdds.data.odds.breakdown.map((item, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          background:
                            item.delta > 0
                              ? "rgba(34, 197, 94, 0.2)"
                              : item.delta < 0
                                ? "rgba(239, 68, 68, 0.2)"
                                : "rgba(148, 163, 184, 0.2)",
                          color:
                            item.delta > 0
                              ? "#86efac"
                              : item.delta < 0
                                ? "#fca5a5"
                                : "#cbd5e1",
                          border: `1px solid ${
                            item.delta > 0
                              ? "rgba(34, 197, 94, 0.4)"
                              : item.delta < 0
                                ? "rgba(239, 68, 68, 0.4)"
                                : "rgba(148, 163, 184, 0.4)"
                          }`,
                        }}
                      >
                        {item.delta > 0 ? `+${item.delta}%` : `${item.delta}%`}{" "}
                        {item.factor}
                      </span>
                    ))}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: tributeMode === "demand" ? "#fca5a5" : "#94a3b8",
                      fontStyle: "italic",
                    }}
                  >
                    {tributeMode === "demand"
                      ? "⚠️ The target foreign power will consider this ultimatum a sovereign extortion attempt. Unless facing catastrophic military defeat, their Politburo/Cabinet will aggressively reject and sever relations."
                      : treatyOdds.data.odds.oddsPercent >= 60
                        ? "Foreign command projects positive strategic yield from this accord."
                        : "Unfavorable strategic yield; foreign political leadership will demand compensatory state indemnities (funds, fuel, production quotas) before considering ratification."}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Diplomatic Cables Ledger Feed */}
          {cables && cables.length > 0 && (
            <div
              style={{
                marginTop: "18px",
                borderTop: "1px solid #334155",
                paddingTop: "12px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "bold",
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                Intercepted Ambassadorial Telegram Cables ({cables.length})
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  maxHeight: "150px",
                  overflowY: "auto",
                }}
              >
                {cables.slice(0, 10).map((cable) => (
                  <div
                    key={cable.id}
                    style={{
                      background: "rgba(15, 23, 42, 0.7)",
                      border: "1px solid #334155",
                      borderRadius: "4px",
                      padding: "6px 10px",
                      fontSize: "11px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        color: "#93c5fd",
                        fontWeight: "bold",
                      }}
                    >
                      <span>
                        [{cable.senderCountryId.toUpperCase()} ➔{" "}
                        {cable.recipientCountryId.toUpperCase()}] {cable.header}
                      </span>
                      {cable.stanceChange && (
                        <span style={{ color: "#f87171" }}>
                          {cable.stanceChange}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        color: "#cbd5e1",
                        marginTop: "2px",
                        fontStyle: "italic",
                      }}
                    >
                      "{cable.content}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="recruitment-modal-footer">
          {isNegotiating && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                color: "#38bdf8",
                marginRight: "auto",
              }}
            >
              <span className="diplomatic-pulse-icon">📡</span>
              <span>Encrypted diplomatic cable in transit...</span>
            </div>
          )}
          <button
            type="button"
            className="action-button secondary-action"
            onClick={onClose}
            disabled={isNegotiating}
          >
            Close
          </button>
          <button
            type="button"
            className={`recruitment-submit-btn ${
              isNegotiating ? "diplomatic-transmitting-btn" : ""
            }`}
            disabled={
              isNegotiating ||
              (treatyOdds.data?.odds !== undefined &&
                treatyOdds.data.odds.isHardRedline)
            }
            style={{
              opacity: isNegotiating
                ? 0.75
                : treatyOdds.data?.odds && treatyOdds.data.odds.isHardRedline
                  ? 0.5
                  : 1,
              cursor: isNegotiating
                ? "not-allowed"
                : treatyOdds.data?.odds && treatyOdds.data.odds.isHardRedline
                  ? "not-allowed"
                  : "pointer",
              background: isNegotiating
                ? "#1e293b"
                : tributeMode === "demand"
                  ? "linear-gradient(135deg, #b91c1c, #dc2626)"
                  : undefined,
              borderColor: isNegotiating
                ? "#475569"
                : tributeMode === "demand"
                  ? "#ef4444"
                  : undefined,
              boxShadow: isNegotiating ? "none" : undefined,
            }}
            onClick={() => {
              onNegotiate({
                treatyType,
                targetCountryId,
                durationTurns,
                offeredTributeFunds:
                  tributeFunds > 0 ? tributeFunds : undefined,
                tribute: {
                  mode: tributeMode,
                  funds: tributeFunds,
                  fuel: tributeFuel,
                  production: tributeProduction,
                  techSharing: tributeTech || undefined,
                  transferredFormationId: tributeFormationId || undefined,
                  cededHexId: tributeHexId || undefined,
                },
              });
            }}
          >
            {isNegotiating ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span className="diplomatic-pulse-icon">📡</span>
                <span>Transmitting Telegram to Foreign Ministry...</span>
              </div>
            ) : treatyOdds.data?.odds?.isHardRedline ? (
              "Proposal Inapplicable"
            ) : tributeMode === "demand" ? (
              "Transmit Sovereign Ultimatum"
            ) : (
              `Transmit Proposal (${treatyOdds.data?.odds?.oddsPercent ?? 50}% Odds)`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DiplomaticInboxModal({
  isOpen,
  onClose,
  cables,
  worldNews,
  onMarkRead,
  isMarkingRead,
}: {
  isOpen: boolean;
  onClose: () => void;
  cables: DiplomaticCable[];
  worldNews: WorldNewsDispatch[];
  onMarkRead: (cableIds?: string[]) => void;
  isMarkingRead: boolean;
}): ReactElement | null {
  const [activeTab, setActiveTab] = useState<"cables" | "news">("cables");
  const [cableFilter, setCableFilter] = useState<"all" | "unread" | "protests">(
    "all",
  );

  if (!isOpen) return null;

  const unreadCount = cables.filter((c) => !c.isRead).length;
  const filteredCables = cables.filter((c) => {
    if (cableFilter === "unread") return !c.isRead;
    if (cableFilter === "protests")
      return (
        c.header.toUpperCase().includes("PROTEST") ||
        c.header.toUpperCase().includes("BORDER") ||
        c.header.toUpperCase().includes("DEMARCHE") ||
        c.header.toUpperCase().includes("FLASH")
      );
    return true;
  });

  return (
    <div className="recruitment-modal-backdrop" onClick={onClose}>
      <div
        className="recruitment-modal"
        style={{ maxWidth: "840px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="recruitment-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h3>📨 Embassy Diplomatic Cables & World Press Wire</h3>
            {unreadCount > 0 && (
              <span
                style={{
                  background: "#dc2626",
                  color: "#fff",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "11px",
                  fontWeight: "bold",
                }}
              >
                {unreadCount} UNREAD
              </span>
            )}
          </div>
          <button
            type="button"
            className="recruitment-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 16px",
            borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
            background: "rgba(15, 23, 42, 0.7)",
          }}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              style={{
                padding: "6px 14px",
                borderRadius: "4px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background:
                  activeTab === "cables" ? "#0284c7" : "rgba(51, 65, 85, 0.6)",
                color: "#fff",
              }}
              onClick={() => setActiveTab("cables")}
            >
              📠 Diplomatic Cables ({cables.length})
            </button>
            <button
              type="button"
              style={{
                padding: "6px 14px",
                borderRadius: "4px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background:
                  activeTab === "news" ? "#0284c7" : "rgba(51, 65, 85, 0.6)",
                color: "#fff",
              }}
              onClick={() => setActiveTab("news")}
            >
              📡 World Press Wire ({worldNews.length})
            </button>
          </div>

          {activeTab === "cables" && unreadCount > 0 && (
            <button
              type="button"
              style={{
                padding: "4px 10px",
                background: "#334155",
                color: "#e2e8f0",
                border: "1px solid #64748b",
                borderRadius: "4px",
                fontSize: "11px",
                cursor: "pointer",
              }}
              disabled={isMarkingRead}
              onClick={() => onMarkRead()}
            >
              ✓ Mark All As Read
            </button>
          )}
        </div>

        <div
          className="recruitment-modal-body"
          style={{ maxHeight: "70vh", overflowY: "auto", padding: "16px" }}
        >
          {activeTab === "cables" ? (
            <div>
              {/* Cable Sub-filters */}
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  marginBottom: "12px",
                }}
              >
                <button
                  type="button"
                  style={{
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    border: "none",
                    cursor: "pointer",
                    background: cableFilter === "all" ? "#38bdf8" : "#1e293b",
                    color: cableFilter === "all" ? "#0f172a" : "#94a3b8",
                    fontWeight: "bold",
                  }}
                  onClick={() => setCableFilter("all")}
                >
                  All Cables ({cables.length})
                </button>
                <button
                  type="button"
                  style={{
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    border: "none",
                    cursor: "pointer",
                    background:
                      cableFilter === "unread" ? "#ef4444" : "#1e293b",
                    color: cableFilter === "unread" ? "#fff" : "#94a3b8",
                    fontWeight: "bold",
                  }}
                  onClick={() => setCableFilter("unread")}
                >
                  Unread ({unreadCount})
                </button>
                <button
                  type="button"
                  style={{
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    border: "none",
                    cursor: "pointer",
                    background:
                      cableFilter === "protests" ? "#f59e0b" : "#1e293b",
                    color: cableFilter === "protests" ? "#0f172a" : "#94a3b8",
                    fontWeight: "bold",
                  }}
                  onClick={() => setCableFilter("protests")}
                >
                  ⚠️ Border Protests & Warnings
                </button>
              </div>

              {filteredCables.length === 0 ? (
                <div
                  style={{
                    padding: "30px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  No diplomatic telegrams found for this filter.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {filteredCables.map((cable) => {
                    const isAlert =
                      cable.header.toUpperCase().includes("PROTEST") ||
                      cable.header.toUpperCase().includes("DEMARCHE") ||
                      cable.header.toUpperCase().includes("FLASH");
                    return (
                      <div
                        key={cable.id}
                        style={{
                          background: isAlert
                            ? "rgba(127, 29, 29, 0.25)"
                            : !cable.isRead
                              ? "rgba(14, 116, 144, 0.2)"
                              : "rgba(15, 23, 42, 0.8)",
                          border: isAlert
                            ? "1px solid #ef4444"
                            : !cable.isRead
                              ? "1px solid #06b6d4"
                              : "1px solid rgba(148, 163, 184, 0.2)",
                          borderRadius: "6px",
                          padding: "12px 14px",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "6px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: "bold",
                                padding: "2px 6px",
                                borderRadius: "3px",
                                background: isAlert ? "#7f1d1d" : "#0369a1",
                                color: "#fff",
                                letterSpacing: "0.5px",
                              }}
                            >
                              {cable.classification}
                            </span>
                            <span
                              style={{
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: isAlert ? "#fca5a5" : "#38bdf8",
                              }}
                            >
                              {cable.header}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            {!cable.isRead && (
                              <span
                                style={{
                                  background: "#06b6d4",
                                  color: "#0f172a",
                                  fontSize: "10px",
                                  fontWeight: "bold",
                                  padding: "1px 5px",
                                  borderRadius: "3px",
                                }}
                              >
                                NEW
                              </span>
                            )}
                            <span
                              style={{ fontSize: "11px", color: "#94a3b8" }}
                            >
                              {new Date(cable.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: "12px",
                            color: isAlert ? "#fee2e2" : "#e2e8f0",
                            lineHeight: "1.5",
                            marginTop: "6px",
                          }}
                        >
                          "{cable.content}"
                        </div>

                        {cable.stanceChange && (
                          <div
                            style={{
                              marginTop: "8px",
                              fontSize: "11px",
                              color: "#f87171",
                              fontWeight: "bold",
                            }}
                          >
                            DIPLOMATIC STANCE SHIFT:{" "}
                            {cable.stanceChange.toUpperCase()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              {worldNews.length === 0 ? (
                <div
                  style={{
                    padding: "30px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  No international news wire dispatches broadcast yet.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {worldNews.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        background: "rgba(15, 23, 42, 0.9)",
                        border: "1px solid #334155",
                        borderRadius: "6px",
                        padding: "14px",
                        fontFamily: "Courier New, monospace",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              background:
                                item.agency === "TASS"
                                  ? "#991b1b"
                                  : item.agency === "REUTERS"
                                    ? "#d97706"
                                    : "#2563eb",
                              color: "#fff",
                              padding: "2px 6px",
                              borderRadius: "3px",
                              fontWeight: "bold",
                              fontSize: "10px",
                            }}
                          >
                            {item.agency} WIRE
                          </span>
                          <span
                            style={{
                              color: "#e2e8f0",
                              fontSize: "13px",
                              fontWeight: "bold",
                            }}
                          >
                            {item.headline}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "10px",
                            color: "#94a3b8",
                            background: "rgba(51, 65, 85, 0.5)",
                            padding: "2px 6px",
                            borderRadius: "3px",
                          }}
                        >
                          {item.category}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: "6px 0 0 0",
                          fontSize: "12px",
                          color: "#cbd5e1",
                          lineHeight: "1.4",
                        }}
                      >
                        {item.body}
                      </p>
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "10px",
                          color: "#64748b",
                          textAlign: "right",
                        }}
                      >
                        FILED AT {new Date(item.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="recruitment-modal-footer">
          <button
            type="button"
            className="action-button secondary-action"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function FormationCompositionEditorModal({
  isOpen,
  formation,
  currentFunds,
  campaignYear,
  onClose,
  onSave,
  isSaving,
}: {
  isOpen: boolean;
  formation: CampaignFormation | null;
  currentFunds: number;
  campaignYear: number;
  onClose: () => void;
  onSave: (updates: {
    formationId: string;
    name?: string;
    customComposition?: FlotillaComposition;
  }) => void;
  isSaving: boolean;
}): ReactElement | null {
  const defaultComp = useMemo(() => {
    if (!formation) return null;
    return (
      formation.composition ||
      getFlotillaComposition(
        formation.unitType as FormationUnitType,
        formation.countryId,
        formation.side,
      )
    );
  }, [formation]);

  const [name, setName] = useState(formation?.name ?? "");
  const [flagshipName, setFlagshipName] = useState(
    defaultComp?.flagshipName ?? "",
  );
  const [units, setUnits] = useState<FlotillaUnit[]>(defaultComp?.units ?? []);
  const [strictTimeline, setStrictTimeline] = useState<boolean>(true);
  const [activeGroupId, setActiveGroupId] = useState<string>("all");
  const [activeSubCategory, setActiveSubCategory] = useState<
    FlotillaSubCategory | "all"
  >("all");
  const [selectedAssetRef, setSelectedAssetRef] = useState<string>("");
  const [addCount, setAddCount] = useState<number>(1);

  // Sync state when formation changes
  useEffect(() => {
    if (formation && defaultComp) {
      setName(formation.name);
      setFlagshipName(defaultComp.flagshipName);
      setUnits(
        defaultComp.units.map((u) => {
          const stats = getUnitBaseStats(u.classIniRef);
          return {
            ...u,
            fundsCost: u.fundsCost ?? stats.fundsCost,
            productionCost: u.productionCost ?? stats.productionCost,
            pointValue: u.pointValue ?? stats.pointValue,
            introducedYear: u.introducedYear ?? stats.introducedYear,
            subCategory: u.subCategory ?? stats.subCategory,
            modernizationFamily:
              u.modernizationFamily ?? stats.modernizationFamily,
            modernizationLevel:
              u.modernizationLevel ?? stats.modernizationLevel,
            modernizationDescription:
              u.modernizationDescription ?? stats.modernizationDescription,
          };
        }),
      );
    }
  }, [formation, defaultComp]);

  // Initial cost baseline of original formation
  const initialCost = useMemo(() => {
    if (!defaultComp)
      return { totalFunds: 0, totalProduction: 0, totalPoints: 0 };
    return calculateCompositionCost(defaultComp.units);
  }, [defaultComp]);

  // Current live composition cost
  const currentCost = useMemo(() => {
    return calculateCompositionCost(units);
  }, [units]);

  const deltaFunds = currentCost.totalFunds - initialCost.totalFunds;
  const canAffordDelta =
    deltaFunds <= 0 ||
    formation?.side !== "blufor" ||
    currentFunds >= deltaFunds;

  // Filter available assets based on faction, timeline, group, and subcategory
  const availableOptions = useMemo(() => {
    if (!formation) return [];

    let list = AVAILABLE_VANILLA_ASSETS.filter((item) => {
      const matchFaction =
        item.faction === "all" ||
        item.faction === formation.side ||
        (formation.side === "blufor" && item.faction === "blufor") ||
        (formation.side === "opfor" && item.faction === "opfor");
      return matchFaction;
    });

    // Timeline filtering
    list = filterAssetsByTimeline(list, campaignYear, strictTimeline);

    // Group / Subcategory filtering
    if (activeGroupId !== "all") {
      const group = HIERARCHICAL_CATALOG_GROUPS.find(
        (g) => g.id === activeGroupId,
      );
      if (group) {
        const allowedSubCats = group.subCategories.map((s) => s.id);
        list = list.filter((item) => allowedSubCats.includes(item.subCategory));
      }
    }

    if (activeSubCategory !== "all") {
      list = list.filter((item) => item.subCategory === activeSubCategory);
    }

    return list;
  }, [
    formation,
    campaignYear,
    strictTimeline,
    activeGroupId,
    activeSubCategory,
  ]);

  useEffect(() => {
    if (
      availableOptions.length > 0 &&
      (!selectedAssetRef ||
        !availableOptions.some((o) => o.classIniRef === selectedAssetRef))
    ) {
      setSelectedAssetRef(availableOptions[0]!.classIniRef);
      setAddCount(availableOptions[0]!.defaultCount);
    }
  }, [availableOptions, selectedAssetRef]);

  // Recalculate dynamic totals
  const totals = useMemo(() => recalculateCompositionTotals(units), [units]);

  if (!isOpen || !formation || !defaultComp) return null;

  // Handle count adjustment
  const handleAdjustCount = (unitId: string, delta: number) => {
    setUnits((prev) =>
      prev
        .map((u) => {
          if (u.id === unitId) {
            const newCount = Math.max(1, u.count + delta);
            return { ...u, count: newCount };
          }
          return u;
        })
        .filter((u) => u.count > 0),
    );
  };

  // Handle unit removal
  const handleRemoveUnit = (unitId: string) => {
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
  };

  // Handle unit modernization refit / upgrade
  const handleModernizeUnit = (
    unitId: string,
    targetAsset: AvailableAssetCatalogItem,
  ) => {
    setUnits((prev) =>
      prev.map((u) => {
        if (u.id === unitId) {
          return {
            ...u,
            name: targetAsset.name,
            unitClass: targetAsset.unitClass,
            classIniRef: targetAsset.classIniRef,
            role: targetAsset.defaultRole,
            fundsCost: targetAsset.fundsCost,
            productionCost: targetAsset.productionCost,
            pointValue: targetAsset.pointValue,
            introducedYear: targetAsset.introducedYear,
            subCategory: targetAsset.subCategory,
            modernizationFamily: targetAsset.modernizationFamily,
            modernizationLevel: targetAsset.modernizationLevel,
            modernizationDescription: targetAsset.modernizationDescription,
            isProxy: targetAsset.isProxy,
            proxyFor: targetAsset.proxyFor,
          };
        }
        return u;
      }),
    );
  };

  // Handle adding new unit to manifest
  const handleAddUnit = () => {
    const asset = AVAILABLE_VANILLA_ASSETS.find(
      (a) => a.classIniRef === selectedAssetRef,
    );
    if (!asset) return;

    // Check if already in units list
    const existingIndex = units.findIndex(
      (u) => u.classIniRef === asset.classIniRef,
    );
    if (existingIndex >= 0) {
      setUnits((prev) =>
        prev.map((u, i) =>
          i === existingIndex ? { ...u, count: u.count + addCount } : u,
        ),
      );
    } else {
      const newUnit: FlotillaUnit = {
        id: `unit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: asset.name,
        unitClass: asset.unitClass,
        classIniRef: asset.classIniRef,
        category: asset.category,
        subCategory: asset.subCategory,
        role: asset.defaultRole,
        count: Math.max(1, addCount),
        fundsCost: asset.fundsCost,
        productionCost: asset.productionCost,
        pointValue: asset.pointValue,
        introducedYear: asset.introducedYear,
        modernizationFamily: asset.modernizationFamily,
        modernizationLevel: asset.modernizationLevel,
        modernizationDescription: asset.modernizationDescription,
        isProxy: asset.isProxy,
        proxyFor: asset.proxyFor,
      };
      setUnits((prev) => [...prev, newUnit]);
    }
  };

  // Reset to original default archetype roster
  const handleResetToDefault = () => {
    const std = getFlotillaComposition(
      formation.unitType as FormationUnitType,
      formation.countryId,
      formation.side,
    );
    setName(formation.archetype?.displayName ?? formation.name);
    setFlagshipName(std.flagshipName);
    setUnits(
      std.units.map((u) => {
        const stats = getUnitBaseStats(u.classIniRef);
        return {
          ...u,
          fundsCost: u.fundsCost ?? stats.fundsCost,
          productionCost: u.productionCost ?? stats.productionCost,
          pointValue: u.pointValue ?? stats.pointValue,
          introducedYear: u.introducedYear ?? stats.introducedYear,
          subCategory: u.subCategory ?? stats.subCategory,
          modernizationFamily:
            u.modernizationFamily ?? stats.modernizationFamily,
          modernizationLevel: u.modernizationLevel ?? stats.modernizationLevel,
          modernizationDescription:
            u.modernizationDescription ?? stats.modernizationDescription,
        };
      }),
    );
  };

  // Submit save
  const handleSave = () => {
    if (!canAffordDelta) return;

    const finalComp: FlotillaComposition = {
      ...defaultComp,
      callsignPrefix: defaultComp.callsignPrefix || name,
      flagshipName: flagshipName || (units[0]?.name ?? "Flagship"),
      totalVessels: totals.totalVessels,
      totalSubmarines: totals.totalSubmarines,
      totalAircraft: totals.totalAircraft,
      totalVehicles: totals.totalVehicles,
      units,
    };

    onSave({
      formationId: formation.id,
      name: name.trim() || formation.name,
      customComposition: finalComp,
    });
  };

  const selectedAsset = AVAILABLE_VANILLA_ASSETS.find(
    (a) => a.classIniRef === selectedAssetRef,
  );

  return (
    <div className="recruitment-modal-backdrop" onClick={onClose}>
      <div
        className="recruitment-modal formation-editor-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="recruitment-modal-header">
          <div>
            <h3>🛠️ Formation & Flotilla Order of Battle Editor</h3>
            <span className="modal-subtitle">
              Configure vanilla <em>Sea Power</em> vessels, air wings,
              armaments, and refits for <strong>{formation.name}</strong>
            </span>
          </div>
          <button
            type="button"
            className="recruitment-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="recruitment-modal-body">
          {/* Header Controls: Name & Flagship Selection */}
          <div className="formation-editor-top-controls">
            <div className="recruitment-control-group">
              <label>Formation Name / Designation</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Carrier Strike Group 8 (USS Nimitz)"
              />
            </div>
            <div className="recruitment-control-group">
              <label>Flagship / Command Vessel</label>
              <input
                type="text"
                value={flagshipName}
                onChange={(e) => setFlagshipName(e.target.value)}
                placeholder="e.g. USS Nimitz (CVN-68)"
              />
            </div>
          </div>

          {/* Budget & Cost Delta Summary Bar */}
          <div className="formation-editor-budget-bar">
            <div className="budget-stat-item">
              <span className="budget-stat-label">Treasury Balance</span>
              <strong className="budget-stat-val funds">
                💰 ${currentFunds}
              </strong>
            </div>
            <div className="budget-stat-item">
              <span className="budget-stat-label">Formation Value</span>
              <strong className="budget-stat-val">
                ${currentCost.totalFunds} ({currentCost.totalProduction} P /{" "}
                {currentCost.totalPoints} pts)
              </strong>
            </div>
            <div className="budget-stat-item">
              <span className="budget-stat-label">Cost Adjustment</span>
              <strong
                className={`budget-stat-val ${
                  deltaFunds > 0
                    ? "delta-positive"
                    : deltaFunds < 0
                      ? "delta-negative"
                      : "delta-zero"
                }`}
              >
                {deltaFunds > 0
                  ? `+$${deltaFunds} (Cost)`
                  : deltaFunds < 0
                    ? `-$${Math.abs(deltaFunds)} (Refund)`
                    : "$0 (No Change)"}
              </strong>
            </div>
            <div className="budget-stat-item timeline-toggle-item">
              <label className="timeline-toggle-label">
                <input
                  type="checkbox"
                  checked={strictTimeline}
                  onChange={(e) => setStrictTimeline(e.target.checked)}
                />
                <span className="timeline-toggle-text">
                  {strictTimeline
                    ? `🔒 Strict ${campaignYear} Timeline`
                    : `🌐 All Eras (1950–1985)`}
                </span>
              </label>
            </div>
          </div>

          {/* Unit Manifest Table with In-Row Refit Upgrades */}
          <div className="formation-editor-units-table-container">
            <table className="formation-editor-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Unit / Ship Name & Class</th>
                  <th>Era / Score</th>
                  <th>Unit Price</th>
                  <th>Modernization / Refits</th>
                  <th style={{ textAlign: "center" }}>Qty</th>
                  <th style={{ textAlign: "center" }}>Subtotal</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{ textAlign: "center", color: "#94a3b8" }}
                    >
                      No units assigned. Use the catalog below to add vessels or
                      squadrons.
                    </td>
                  </tr>
                ) : (
                  units.map((unit) => {
                    const stats = getUnitBaseStats(unit.classIniRef);
                    const unitFunds = unit.fundsCost ?? stats.fundsCost;
                    const unitYear =
                      unit.introducedYear ?? stats.introducedYear;
                    const unitPoints = unit.pointValue ?? stats.pointValue;
                    const modernizations = getAvailableModernizations(
                      unit.classIniRef,
                      campaignYear,
                      strictTimeline,
                    );

                    return (
                      <tr key={unit.id} className="editor-unit-row">
                        <td>
                          <span
                            className={`unit-category-badge ${unit.category}`}
                          >
                            {unit.category === "vessel"
                              ? "🚢 Vessel"
                              : unit.category === "submarine"
                                ? "🐬 Sub"
                                : unit.category === "aircraft"
                                  ? "✈️ Air"
                                  : "🛡️ Ground"}
                          </span>
                        </td>
                        <td>
                          <div className="unit-name-cell">
                            <strong className="unit-display-name">
                              {unit.name}
                            </strong>
                            <span className="unit-class-name">
                              {unit.unitClass}
                            </span>
                            <div className="unit-tags-row">
                              <code className="flotilla-ini-tag">
                                {unit.classIniRef}.ini
                              </code>
                              {unit.isProxy && (
                                <span
                                  className="proxy-badge"
                                  title={unit.proxyFor}
                                >
                                  Proxy
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="unit-stat-cell">
                            <span className="year-pill">📅 {unitYear}</span>
                            <span className="pts-pill">
                              ⭐ {unitPoints} pts
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="unit-price-cell">
                            <strong>${unitFunds}</strong>
                            <small>{stats.productionCost} P</small>
                          </div>
                        </td>
                        <td>
                          {modernizations.length > 1 ? (
                            <div className="refit-selector-container">
                              <select
                                className="refit-dropdown"
                                value={unit.classIniRef}
                                onChange={(e) => {
                                  const target = modernizations.find(
                                    (m) => m.classIniRef === e.target.value,
                                  );
                                  if (target) {
                                    handleModernizeUnit(unit.id, target);
                                  }
                                }}
                              >
                                {modernizations.map((mod) => {
                                  const costDiff = mod.fundsCost - unitFunds;
                                  const diffLabel =
                                    costDiff > 0
                                      ? ` (+$${costDiff})`
                                      : costDiff < 0
                                        ? ` (-$${Math.abs(costDiff)})`
                                        : " (Equipped)";
                                  return (
                                    <option
                                      key={mod.classIniRef}
                                      value={mod.classIniRef}
                                    >
                                      ⚡{" "}
                                      {mod.modernizationDescription || mod.name}
                                      {diffLabel}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          ) : (
                            <span className="no-refit-label">
                              Standard Spec
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="quantity-stepper">
                            <button
                              type="button"
                              className="stepper-btn minus"
                              onClick={() => handleAdjustCount(unit.id, -1)}
                              disabled={unit.count <= 1}
                            >
                              −
                            </button>
                            <span className="stepper-count">{unit.count}</span>
                            <button
                              type="button"
                              className="stepper-btn plus"
                              onClick={() => handleAdjustCount(unit.id, 1)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <strong className="subtotal-amount">
                            ${unitFunds * unit.count}
                          </strong>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className="delete-unit-btn"
                            title="Remove unit from formation"
                            onClick={() => handleRemoveUnit(unit.id)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Add New Unit: Hierarchical Tree & Category Browser */}
          <div className="formation-editor-add-section">
            <div className="catalog-header-row">
              <h4>+ Add Sea Power Unit from Catalog</h4>
              <span className="catalog-count-badge">
                {availableOptions.length} assets available
                {strictTimeline
                  ? ` (Commissioned $\\le$ ${campaignYear})`
                  : " (All Eras)"}
              </span>
            </div>

            {/* Major Category Navigator Tabs */}
            <div className="catalog-major-tabs">
              <button
                type="button"
                className={`major-tab ${activeGroupId === "all" ? "active" : ""}`}
                onClick={() => {
                  setActiveGroupId("all");
                  setActiveSubCategory("all");
                }}
              >
                🌐 All Classes
              </button>
              {HIERARCHICAL_CATALOG_GROUPS.map((grp) => (
                <button
                  key={grp.id}
                  type="button"
                  className={`major-tab ${activeGroupId === grp.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveGroupId(grp.id);
                    setActiveSubCategory("all");
                  }}
                >
                  {grp.icon} {grp.label.split("&")[0]?.trim() || grp.label}
                </button>
              ))}
            </div>

            {/* Subcategory Filter Pills */}
            {activeGroupId !== "all" && (
              <div className="catalog-subcategories-bar">
                <button
                  type="button"
                  className={`subcat-pill ${activeSubCategory === "all" ? "active" : ""}`}
                  onClick={() => setActiveSubCategory("all")}
                >
                  All in Category
                </button>
                {HIERARCHICAL_CATALOG_GROUPS.find(
                  (g) => g.id === activeGroupId,
                )?.subCategories.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    className={`subcat-pill ${activeSubCategory === sub.id ? "active" : ""}`}
                    onClick={() => setActiveSubCategory(sub.id)}
                  >
                    {sub.icon} {sub.label}
                  </button>
                ))}
              </div>
            )}

            {/* Asset Selection Controls */}
            <div className="add-unit-controls-row">
              <div className="recruitment-control-group unit-select-group">
                <label>Select Warship, Submarine or Airframe</label>
                <select
                  value={selectedAssetRef}
                  onChange={(e) => {
                    setSelectedAssetRef(e.target.value);
                    const asset = AVAILABLE_VANILLA_ASSETS.find(
                      (a) => a.classIniRef === e.target.value,
                    );
                    if (asset) setAddCount(asset.defaultCount);
                  }}
                >
                  {availableOptions.map((opt) => (
                    <option key={opt.classIniRef} value={opt.classIniRef}>
                      [{opt.introducedYear}] {opt.name} — ${opt.fundsCost} /{" "}
                      {opt.productionCost}P ({opt.unitClass})
                      {opt.modernizationFamily ? " ⚡" : ""}
                      {opt.isProxy ? " [Proxy]" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="recruitment-control-group qty-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={addCount}
                  onChange={(e) =>
                    setAddCount(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>

              <button
                type="button"
                className="add-to-manifest-btn"
                disabled={availableOptions.length === 0}
                onClick={handleAddUnit}
              >
                + Add {addCount > 1 ? `${addCount}x` : ""} to Roster ($
                {(selectedAsset?.fundsCost ?? 0) * addCount})
              </button>
            </div>

            {/* Selected Asset Info Preview Card */}
            {selectedAsset && (
              <div className="catalog-item-preview-card">
                <div className="preview-top">
                  <div className="preview-titles">
                    <strong>{selectedAsset.name}</strong>
                    <span className="preview-class">
                      {selectedAsset.unitClass}
                    </span>
                  </div>
                  <div className="preview-badges">
                    <span className="year-pill">
                      📅 Commissioned {selectedAsset.introducedYear}
                    </span>
                    <span className="price-pill">
                      💰 ${selectedAsset.fundsCost} Funds /{" "}
                      {selectedAsset.productionCost} P
                    </span>
                    <span className="pts-pill">
                      ⭐ {selectedAsset.pointValue} Combat Score
                    </span>
                    {selectedAsset.modernizationFamily && (
                      <span className="refit-available-pill">
                        ⚡ Refits Available
                      </span>
                    )}
                  </div>
                </div>
                <div className="preview-bottom">
                  <span className="preview-role">
                    🎯 <em>Role:</em> {selectedAsset.defaultRole}
                  </span>
                  <code className="flotilla-ini-tag">
                    {selectedAsset.classIniRef}.ini
                  </code>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="recruitment-modal-footer">
          <div className="footer-left">
            <button
              type="button"
              className="secondary-action reset-btn"
              onClick={handleResetToDefault}
            >
              ↺ Reset to Standard OOB
            </button>
            {!canAffordDelta && (
              <span className="budget-alert-warning">
                ⚠️ Insufficient Treasury: Need +${deltaFunds}, only $
                {currentFunds} available.
              </span>
            )}
          </div>
          <div className="footer-right">
            <button
              type="button"
              className="secondary-action"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="recruitment-submit-btn save-composition-btn"
              disabled={isSaving || units.length === 0 || !canAffordDelta}
              onClick={handleSave}
            >
              {isSaving
                ? "Saving Manifest..."
                : deltaFunds > 0
                  ? `💾 Save & Pay +$${deltaFunds}`
                  : deltaFunds < 0
                    ? `💾 Save & Refund -$${Math.abs(deltaFunds)}`
                    : "💾 Save Composition ($0)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategicMap({
  sites,
  entities,
  hexGrid,
  funds,
  lanes,
  selectedLaneId,
  onLaneSelect,
  onGenerateMissionForRoute,
  onLaneActionForRoute,
  onMoveFormation,
  onIssueMovementOrder,
  onCancelMovementOrder,
  onDismissMovementOrder,
  onEmbarkFormation,
  onDisembarkFormation,
  onRefuelRearm,
  onRestRefit,
  onTrainFormation,
  onEngageHex,
  onOpenFormationEditor,
  onUpgradeInvestment,
  actionPending,
  world,
  onViewportChange,
  initialBounds,
  playerCountryId,
  playerCountryName,
}: {
  sites: StrategicSite[];
  entities: CampaignStateEntity[] | undefined;
  hexGrid?: HexGridStateSnapshot | undefined;
  funds: number;
  lanes: TheaterLane[];
  selectedLaneId: string | undefined;
  onLaneSelect: (laneId: string) => void;
  onGenerateMissionForRoute: (routeId: string) => void;
  onLaneActionForRoute: (action: LaneAction, routeId: string) => void;
  onMoveFormation?: (formationId: string, targetHexId: string) => void;
  onIssueMovementOrder?: (formationId: string, targetHexId: string) => void;
  onCancelMovementOrder?: (formationId: string) => void;
  onDismissMovementOrder?: (formationId: string) => void;
  onEmbarkFormation?: (formationId: string, sealiftFormationId: string) => void;
  onDisembarkFormation?: (formationId: string, targetHexId: string) => void;
  onRefuelRearm?: (formationId: string) => void;
  onRestRefit?: (formationId: string) => void;
  onTrainFormation?: (formationId: string, turns?: number) => void;
  onEngageHex?: (hexId: string) => void;
  onOpenFormationEditor?: (formation: CampaignFormation) => void;
  onUpgradeInvestment?: (hexId: string) => void;
  actionPending: boolean;
  world?: WorldZone | undefined;
  onViewportChange: (bounds: MapBounds) => void;
  initialBounds: MapBounds;
  playerCountryId?: string;
  playerCountryName?: string;
}): ReactElement {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const worldLayerRef = useRef<L.LayerGroup | null>(null);
  const hexGridLayerRef = useRef<L.LayerGroup | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);
  const childSitesLayerRef = useRef<L.LayerGroup | null>(null);
  const canvasOverlayRef = useRef<CanvasHexGridOverlayInstance | null>(null);
  const hexGridRef = useRef(hexGrid);
  hexGridRef.current = hexGrid;
  const playerCountryIdRef = useRef(playerCountryId);
  playerCountryIdRef.current = playerCountryId;
  const playerCountryNameRef = useRef(playerCountryName);
  playerCountryNameRef.current = playerCountryName;
  const sitesLayerRef = useRef<L.LayerGroup | null>(null);
  const lanesLayerRef = useRef<L.LayerGroup | null>(null);
  const lanePolylinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const routePolylineRef = useRef<L.Polyline | null>(null);

  // Click-to-Move Pathfinding Interactive Mode
  const [movePlanning, setMovePlanning] = useState<{
    formation: CampaignFormation;
    startHex: StrategicHexCell;
    targetHex: StrategicHexCell | null;
    pathResult: HexPathResult | null;
  } | null>(null);
  const movePlanningRef = useRef(movePlanning);
  movePlanningRef.current = movePlanning;

  const fundsRef = useRef(funds);
  fundsRef.current = funds;
  const actionPendingRef = useRef(actionPending);
  actionPendingRef.current = actionPending;
  const onGenerateMissionRef = useRef(onGenerateMissionForRoute);
  onGenerateMissionRef.current = onGenerateMissionForRoute;
  const onLaneActionRef = useRef(onLaneActionForRoute);
  onLaneActionRef.current = onLaneActionForRoute;
  const onLaneSelectRef = useRef(onLaneSelect);
  onLaneSelectRef.current = onLaneSelect;
  const onMoveFormationRef = useRef(onMoveFormation);
  onMoveFormationRef.current = onMoveFormation;
  const onIssueMovementOrderRef = useRef(onIssueMovementOrder);
  onIssueMovementOrderRef.current = onIssueMovementOrder;
  const onCancelMovementOrderRef = useRef(onCancelMovementOrder);
  onCancelMovementOrderRef.current = onCancelMovementOrder;
  const onDismissMovementOrderRef = useRef(onDismissMovementOrder);
  onDismissMovementOrderRef.current = onDismissMovementOrder;
  const onEmbarkFormationRef = useRef(onEmbarkFormation);
  onEmbarkFormationRef.current = onEmbarkFormation;
  const onDisembarkFormationRef = useRef(onDisembarkFormation);
  onDisembarkFormationRef.current = onDisembarkFormation;
  const onRefuelRearmRef = useRef(onRefuelRearm);
  onRefuelRearmRef.current = onRefuelRearm;
  const onRestRefitRef = useRef(onRestRefit);
  onRestRefitRef.current = onRestRefit;
  const onTrainFormationRef = useRef(onTrainFormation);
  onTrainFormationRef.current = onTrainFormation;
  const onEngageHexRef = useRef(onEngageHex);
  onEngageHexRef.current = onEngageHex;
  const onOpenFormationEditorRef = useRef(onOpenFormationEditor);
  onOpenFormationEditorRef.current = onOpenFormationEditor;
  const onUpgradeInvestmentRef = useRef(onUpgradeInvestment);
  onUpgradeInvestmentRef.current = onUpgradeInvestment;

  const onStartMovePlanning = useCallback(
    (form: CampaignFormation, hex: StrategicHexCell) => {
      mapRef.current?.closePopup();
      setMovePlanning({
        formation: form,
        startHex: hex,
        targetHex: null,
        pathResult: null,
      });
      if (routePolylineRef.current && mapRef.current) {
        mapRef.current.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!element.current) return;
    const map = L.map(element.current, {
      zoomControl: false,
      minZoom: 2,
      maxZoom: 16,
    });
    mapRef.current = map;
    (window as unknown as { __leafletMap: L.Map }).__leafletMap = map;
    L.control.zoom({ position: "topright" }).addTo(map);

    worldLayerRef.current = L.layerGroup().addTo(map);
    const canvasOverlay = new (
      CanvasHexGridOverlay as unknown as {
        new (): CanvasHexGridOverlayInstance;
      }
    )();
    canvasOverlay.addTo(map);
    canvasOverlayRef.current = canvasOverlay;

    hexGridLayerRef.current = L.layerGroup().addTo(map);
    routesLayerRef.current = L.layerGroup().addTo(map);
    childSitesLayerRef.current = L.layerGroup().addTo(map);
    lanesLayerRef.current = L.layerGroup().addTo(map);
    sitesLayerRef.current = L.layerGroup().addTo(map);

    const onMapClick = (event: L.LeafletMouseEvent) => {
      const targetElement = event.originalEvent?.target as HTMLElement | null;
      if (
        targetElement &&
        (targetElement.closest(".custom-sector-popup") ||
          targetElement.closest(".strategic-marker") ||
          targetElement.closest(".formation-map-counter") ||
          targetElement.closest(".tactical-child-marker"))
      ) {
        return;
      }
      const axial = coordinatesToAxial(event.latlng.lat, event.latlng.lng);
      const hexId = getHexIdForAxial(axial.q, axial.r);
      const hex =
        hexGridRef.current?.hexCells.find((h) => h.id === hexId) ??
        getHexCellDefinition(hexId, axial);

      // Handle Interactive Click-to-Move Pathfinding Destination
      if (movePlanningRef.current) {
        const path = findFormationHexPath({
          startAxial: movePlanningRef.current.startHex.axial,
          targetAxial: hex.axial,
          unitType: movePlanningRef.current.formation
            .unitType as FormationUnitType,
          isEmbarked: !!movePlanningRef.current.formation.embarkedOnId,
          currentAP: movePlanningRef.current.formation.actionPoints,
          maxAP: movePlanningRef.current.formation.maxActionPoints,
        });

        setMovePlanning({
          ...movePlanningRef.current,
          targetHex: hex,
          pathResult: path,
        });

        if (routePolylineRef.current) {
          map.removeLayer(routePolylineRef.current);
          routePolylineRef.current = null;
        }

        if (path.found && path.path.length > 0) {
          const latLngs = path.path.map(
            (n) => [n.centroid[0], n.centroid[1]] as [number, number],
          );
          const poly = L.polyline(latLngs, {
            color: "#fbbf24",
            weight: 5,
            dashArray: "8, 8",
            className: "animated-movement-planning-route",
            opacity: 0.95,
          }).addTo(map);
          routePolylineRef.current = poly;
        }
        return;
      }

      canvasOverlayRef.current?.setSelectedHexId(hex.id);

      const formations =
        hexGridRef.current?.formations.filter((f) => f.hexId === hex.id) ?? [];
      const popupContent = createHexTacticalPopupContent(
        hex,
        formations,
        onStartMovePlanning,
        onEmbarkFormationRef.current,
        onDisembarkFormationRef.current,
        onEngageHexRef.current,
        onOpenFormationEditorRef.current,
        onCancelMovementOrderRef.current,
        onDismissMovementOrderRef.current,
        onRefuelRearmRef.current,
        onRestRefitRef.current,
        onTrainFormationRef.current,
        playerCountryIdRef.current,
        playerCountryNameRef.current,
        onUpgradeInvestmentRef.current,
      );

      L.popup({
        maxWidth: 360,
        autoPan: true,
        keepInView: true,
        autoPanPadding: [30, 30],
        className: "custom-sector-popup",
      })
        .setLatLng(event.latlng)
        .setContent(popupContent)
        .openOn(map);
    };
    map.on("click", onMapClick);

    const reportViewport = () => {
      const bounds = map.getBounds();
      onViewportChange({
        west: Number(bounds.getWest().toFixed(2)),
        south: Number(bounds.getSouth().toFixed(2)),
        east: Number(bounds.getEast().toFixed(2)),
        north: Number(bounds.getNorth().toFixed(2)),
      });
    };
    map.on("moveend", reportViewport);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: 2,
      maxZoom: 18,
      maxNativeZoom: 18,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    map.fitBounds(
      [
        [initialBounds.south, initialBounds.west],
        [initialBounds.north, initialBounds.east],
      ],
      { padding: [24, 24], maxZoom: 4 },
    );
    reportViewport();
    return () => {
      map.off("click", onMapClick);
      map.off("moveend", reportViewport);
      if (canvasOverlayRef.current) {
        map.removeLayer(canvasOverlayRef.current);
        canvasOverlayRef.current = null;
      }
      if (routePolylineRef.current) {
        map.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      if (routesLayerRef.current) {
        map.removeLayer(routesLayerRef.current);
        routesLayerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      worldLayerRef.current = null;
      hexGridLayerRef.current = null;
      routesLayerRef.current = null;
      childSitesLayerRef.current = null;
      lanesLayerRef.current = null;
      sitesLayerRef.current = null;
    };
  }, [initialBounds, onStartMovePlanning, onViewportChange]);

  // Render Child Tactical Sites directly on their exact GPS coordinates inside each Hex
  useEffect(() => {
    const layer = childSitesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const coreHexes = getAllBalticCoreHexCells();
    const kindIcons: Record<string, string> = {
      naval_base: "⚓",
      air_base: "✈️",
      world_port: "🚢",
      aa_site: "🛡️",
      radar_site: "📡",
      fuel_terminal: "🛢️",
      factory: "🏭",
      firing_range: "🎯",
    };

    for (const hex of coreHexes) {
      for (const site of hex.childSites ?? []) {
        const symbol = kindIcons[site.kind] || "⚓";
        const icon = L.divIcon({
          className: `tactical-child-marker ${site.kind}`,
          html: `<span>${symbol}</span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        L.marker([site.latitude, site.longitude], { icon })
          .bindTooltip(`<b>${site.name}</b><br>${site.output}`)
          .bindPopup(
            `<strong>${site.name}</strong><br>` +
              `<em>${site.kind.replace(/_/g, " ").toUpperCase()}</em><br>` +
              `Sector: <strong>${hex.name}</strong><br>` +
              `Role: ${site.output}<br>` +
              `Status: <strong>${(site.status ?? "operational").toUpperCase()}</strong>`,
          )
          .addTo(layer);
      }
    }
  }, []);

  useEffect(() => {
    const layer = worldLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const layerName of ["places", "ports", "airports"] as const) {
      for (const record of world?.layers[layerName]?.records ?? []) {
        if (record.latitude === undefined || record.longitude === undefined)
          continue;
        L.circleMarker([record.latitude, record.longitude], {
          radius: layerName === "places" ? 2 : 4,
          color:
            layerName === "ports"
              ? "#22d3ee"
              : layerName === "airports"
                ? "#f59e0b"
                : "#94a3b8",
          weight: 1,
          fillOpacity: 0.7,
        })
          .bindTooltip(record.name)
          .addTo(layer);
      }
    }
  }, [world]);

  useEffect(() => {
    const layer = sitesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const icons: Record<StrategicSite["kind"], string> = {
      naval_base: "N",
      air_base: "A",
      factory: "F",
      port: "P",
      industrial_site: "I",
      resource_site: "R",
      fuel_terminal: "O",
      training_range: "T",
      aa_site: "D",
      city_region: "C",
    };
    for (const site of sites) {
      const icon = L.divIcon({
        className: `strategic-marker ${site.kind}`,
        html: `<span>${icons[site.kind]}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([site.latitude, site.longitude], { icon })
        .addTo(layer)
        .bindPopup(
          `<strong>${site.name}</strong><br>${site.output}` +
            (site.revenuePerDay
              ? `<br>Revenue: +${site.revenuePerDay}/day`
              : "") +
            (site.researchPerDay
              ? `<br>Research: +${site.researchPerDay}/day`
              : "") +
            (site.defenseRating
              ? `<br>Defense rating: ${site.defenseRating}`
              : ""),
        );
    }
    for (const entity of entities ?? []) {
      if (entity.tag !== "hawk_site") continue;
      if (entity.status === "destroyed" || entity.status === "sunk") continue;
      const source = textMeta(entity.metadata, "source");
      if (source !== "purchased-aa-site") continue;
      const latitude = numericMeta(entity.metadata, "latitude");
      const longitude = numericMeta(entity.metadata, "longitude");
      if (latitude === undefined || longitude === undefined) continue;
      const regionKey = textMeta(entity.metadata, "regionKey") ?? "unknown";

      const icon = L.divIcon({
        className: "strategic-marker aa_redeployment",
        html: "<span>R</span>",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([latitude, longitude], { icon })
        .addTo(layer)
        .bindPopup(
          `<strong>${entity.displayName}</strong><br>` +
            `Redeployed AA site<br>` +
            `Region: ${titleToken(regionKey)}<br>` +
            `Status: ${entity.status}`,
        );
    }
  }, [entities, sites]);

  useEffect(() => {
    const layer = lanesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    lanePolylinesRef.current.clear();
    for (const lane of lanes) {
      const economy = lane.dailyValue * (1 - lane.disruption);
      const polyline = L.polyline(lane.coordinates, {
        color: lane.kind === "shipping" ? "#4dd7c0" : "#f0bd63",
        dashArray: lane.kind === "air" ? "8 8" : undefined,
        opacity: 0.78,
        weight: lane.id === selectedLaneId ? 5 : 3,
      })
        .bindPopup(
          `<strong>${lane.name}</strong>` +
            `<br>${lane.kind === "shipping" ? "Shipping" : "Air corridor"}` +
            `<br>Flow: ${lane.commodity}` +
            `<br>Capacity: ${lane.dailyCapacity}/day` +
            `<br>Economic exchange: ${lane.dailyValue}/day` +
            `<br>Currently flowing: ${Math.round(economy)}/day` +
            `<br>Connected: ${lane.countryIds.join(" · ")}`,
        )
        .on("click", () => onLaneSelectRef.current(lane.id))
        .addTo(layer);
      lanePolylinesRef.current.set(lane.id, polyline);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes]);

  // Render Multi-Turn Active In-Transit Animated Movement Routes on Map
  useEffect(() => {
    const layer = routesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!hexGrid) return;

    for (const form of hexGrid.formations) {
      if (!form.activeRoute || form.activeRoute.status !== "in_transit") {
        continue;
      }

      const route = form.activeRoute;
      const waypoints = route.waypoints;
      if (!waypoints || waypoints.length < 2) continue;

      const fullLatLngs: [number, number][] = waypoints.map((wId) => {
        const cell = getHexCellDefinition(wId);
        return [cell.centroid[0], cell.centroid[1]];
      });

      // 1. Draw traversed portion (if any)
      if (route.currentWaypointIndex > 0) {
        const traversedLatLngs = fullLatLngs.slice(
          0,
          route.currentWaypointIndex + 1,
        );
        L.polyline(traversedLatLngs, {
          color: "#64748b",
          weight: 3,
          dashArray: "4, 6",
          opacity: 0.6,
        }).addTo(layer);
      }

      // 2. Draw remaining active animated path
      const remainingLatLngs = fullLatLngs.slice(route.currentWaypointIndex);
      const isBlufor = form.side === "blufor";
      const routeColor = isBlufor ? "#38bdf8" : "#f87171";

      L.polyline(remainingLatLngs, {
        color: routeColor,
        weight: 4,
        dashArray: "8, 12",
        className: "animated-movement-route",
        opacity: 0.95,
      })
        .bindTooltip(
          `<b>${form.name}</b><br>➔ Destination: ${route.targetName}<br>Turn ${route.turnsElapsed}/${route.totalTurns} (Step ${route.currentWaypointIndex + 1}/${route.totalWaypoints})`,
          { sticky: true },
        )
        .addTo(layer);

      // 3. Add Turn ETA Waypoint Badges along remaining path
      const effectiveMaxAP = Math.max(1, form.maxActionPoints);
      let stepOffset = 0;
      let turnNumber = route.turnsElapsed;

      for (let i = route.currentWaypointIndex + 1; i < waypoints.length; i++) {
        stepOffset++;
        const isTurnBoundary =
          stepOffset % effectiveMaxAP === 0 || i === waypoints.length - 1;
        if (isTurnBoundary) {
          turnNumber++;
          const isDest = i === waypoints.length - 1;
          const label = isDest
            ? `🏁 ETA Turn ${turnNumber}`
            : `⏱️ Turn ${turnNumber}`;
          const pt = fullLatLngs[i];
          if (pt) {
            const badgeIcon = L.divIcon({
              className: "waypoint-eta-badge",
              html: `<span>${label}</span>`,
              iconSize: [80, 20],
              iconAnchor: [40, 10],
            });
            L.marker(pt, { icon: badgeIcon, interactive: false }).addTo(layer);
          }
        }
      }
    }
  }, [hexGrid]);

  useEffect(() => {
    const layer = hexGridLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    canvasOverlayRef.current?.render();

    if (!hexGrid) return;

    // Group formations by hexId
    const formationsByHex = new Map<string, CampaignFormation[]>();
    for (const formation of hexGrid.formations) {
      const list = formationsByHex.get(formation.hexId) ?? [];
      list.push(formation);
      formationsByHex.set(formation.hexId, list);
    }

    for (const [hexId, hexFormations] of formationsByHex.entries()) {
      const hex =
        hexGrid.hexCells.find((h) => h.id === hexId) ??
        getHexCellDefinition(hexId);
      const topForm = hexFormations[0];
      if (!topForm) continue;

      const tag =
        topForm.archetype?.domain === "ground"
          ? "ARM"
          : topForm.archetype?.domain === "naval"
            ? "SAG"
            : "AIR";
      const isAllied =
        playerCountryId &&
        topForm.side === "blufor" &&
        topForm.countryId !== playerCountryId;
      const counterClass = isAllied
        ? "formation-counter-icon allied"
        : `formation-counter-icon ${topForm.side}`;
      const iconHtml = `<div class="${counterClass}">[${tag}] ${hexFormations.length > 1 ? `+${hexFormations.length - 1}` : ""}</div>`;
      const counterIcon = L.divIcon({
        className: "formation-map-counter",
        html: iconHtml,
        iconSize: [46, 20],
        iconAnchor: [23, 10],
      });
      const marker = L.marker(hex.centroid, { icon: counterIcon })
        .bindTooltip(
          `${isAllied ? "[ALLIED] " : ""}${topForm.name} (${hexFormations.length} Formations)`,
        )
        .addTo(layer);

      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        canvasOverlayRef.current?.setSelectedHexId(hex.id);
        const popupContent = createHexTacticalPopupContent(
          hex,
          hexFormations,
          onStartMovePlanning,
          onEmbarkFormationRef.current,
          onDisembarkFormationRef.current,
          onEngageHexRef.current,
          onOpenFormationEditorRef.current,
          onCancelMovementOrderRef.current,
          onDismissMovementOrderRef.current,
          onRefuelRearmRef.current,
          onRestRefitRef.current,
          onTrainFormationRef.current,
          playerCountryIdRef.current,
          playerCountryNameRef.current,
          onUpgradeInvestmentRef.current,
        );
        L.popup({
          maxWidth: 360,
          autoPan: true,
          keepInView: true,
          autoPanPadding: [30, 30],
          className: "custom-sector-popup",
        })
          .setLatLng(hex.centroid)
          .setContent(popupContent)
          .openOn(mapRef.current!);
      });
    }
  }, [hexGrid, onStartMovePlanning, playerCountryId]);

  // Update visual selection highlights for lanes in-place without rebuilding layers or closing popups
  useEffect(() => {
    for (const [laneId, polyline] of lanePolylinesRef.current) {
      polyline.setStyle({
        weight: laneId === selectedLaneId ? 5 : 3,
      });
    }
  }, [selectedLaneId]);

  return (
    <div className="strategic-map-wrapper" style={{ position: "relative" }}>
      <div
        className="command-map"
        ref={element}
        aria-label="Strategic map"
        data-testid="strategic-map"
      />
      {movePlanning && (
        <div className="movement-order-card">
          <h4>🎯 Strategic Movement Order</h4>
          <div className="movement-route-info">
            <div className="movement-route-row">
              <span>Unit:</span>
              <strong>{movePlanning.formation.name}</strong>
            </div>
            <div className="movement-route-row">
              <span>Origin:</span>
              <span>{movePlanning.startHex.name}</span>
            </div>
            <div className="movement-route-row">
              <span>Destination:</span>
              <span>
                {movePlanning.targetHex
                  ? movePlanning.targetHex.name
                  : "Click destination hex on map..."}
              </span>
            </div>
            {movePlanning.pathResult && (
              <>
                <div className="movement-route-row">
                  <span>Distance / Steps:</span>
                  <strong>{movePlanning.pathResult.stepCount} Hexes</strong>
                </div>
                <div className="movement-route-row">
                  <span>AP Cost:</span>
                  <strong>
                    {movePlanning.pathResult.apCost} AP (Available:{" "}
                    {movePlanning.formation.actionPoints})
                  </strong>
                </div>
                <div
                  className={`movement-turns-badge ${
                    !movePlanning.pathResult.found
                      ? "blocked"
                      : movePlanning.pathResult.turnsNeeded === 1
                        ? "instant"
                        : "multi-turn"
                  }`}
                >
                  {!movePlanning.pathResult.found
                    ? `❌ Impassable: ${movePlanning.pathResult.reason}`
                    : movePlanning.pathResult.turnsNeeded === 1
                      ? "🟢 Arrival: This Turn (Immediate)"
                      : `🟡 Arrival: In ${movePlanning.pathResult.turnsNeeded} Strategic Turns`}
                </div>
              </>
            )}
          </div>
          <div className="movement-actions-row">
            <button
              type="button"
              className="movement-confirm-btn"
              disabled={
                !movePlanning.targetHex ||
                !movePlanning.pathResult?.found ||
                actionPending
              }
              onClick={() => {
                if (movePlanning.targetHex && onIssueMovementOrderRef.current) {
                  onIssueMovementOrderRef.current(
                    movePlanning.formation.id,
                    movePlanning.targetHex.id,
                  );
                  if (routePolylineRef.current && mapRef.current) {
                    mapRef.current.removeLayer(routePolylineRef.current);
                    routePolylineRef.current = null;
                  }
                  setMovePlanning(null);
                } else if (
                  movePlanning.targetHex &&
                  onMoveFormationRef.current
                ) {
                  onMoveFormationRef.current(
                    movePlanning.formation.id,
                    movePlanning.targetHex.id,
                  );
                  if (routePolylineRef.current && mapRef.current) {
                    mapRef.current.removeLayer(routePolylineRef.current);
                    routePolylineRef.current = null;
                  }
                  setMovePlanning(null);
                }
              }}
            >
              {actionPending
                ? "Transmitting..."
                : movePlanning.pathResult?.turnsNeeded &&
                    movePlanning.pathResult.turnsNeeded > 1
                  ? `🚀 Issue Multi-Turn Order (${movePlanning.pathResult.turnsNeeded} Turns)`
                  : "🚀 Confirm & Transmit Order"}
            </button>
            <button
              type="button"
              className="movement-cancel-btn"
              onClick={() => {
                if (routePolylineRef.current && mapRef.current) {
                  mapRef.current.removeLayer(routePolylineRef.current);
                  routePolylineRef.current = null;
                }
                setMovePlanning(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="map-legend" aria-label="Strategic map legend">
        <span>
          <b className="legend-dot naval_base">N</b> Naval base
        </span>
        <span>
          <b className="legend-dot air_base">A</b> Air base
        </span>
        <span>
          <b className="legend-dot port">P</b> World port
        </span>
        <span>
          <b className="legend-line shipping" /> Shipping lane
        </span>
        <span>
          <b className="legend-line air" /> Air corridor
        </span>
        <span>
          <b className="legend-dot industrial_site">I</b> Industry
        </span>
        <span>
          <b className="legend-dot resource_site">R</b> Resource
        </span>
        <span>
          <b className="legend-dot fuel_terminal">O</b> Fuel
        </span>
        <span>
          <b className="legend-dot aa_site">D</b> Air defense
        </span>
        <span>
          <b className="legend-dot training_range">T</b> Firing range
        </span>
      </div>
    </div>
  );
}
