import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import { z } from "zod";
import {
  createCampaign,
  getSessionCampaign,
  setupCatalog,
} from "../application/campaignSetup.js";
import {
  AA_SITE_PURCHASE_COST,
  advanceCampaignDay,
  applyForceInventoryAction,
  getCampaignStateSnapshot,
  purchaseAaSite,
  purchaseSectorAsset,
  registerWorldEntity,
  updateWorldEntityStatus,
} from "../application/campaignLedger.js";
import {
  resolveSectorView,
  sectorsForTheater,
  sideForCoalition,
  type SectorStrategicCategory,
  type SectorUnitCategory,
} from "../application/sectorOperations.js";
import {
  getCampaignHexState,
  moveFormation,
  issueFormationMovementOrder,
  cancelFormationMovementOrder,
  dismissCompletedMovementOrder,
  recruitFormation,
  embarkFormation,
  disembarkFormation,
  refuelAndRearmFormation,
  restAndRefitFormation,
  orderCombatTraining,
  generateSeaPowerHexBattle,
  updateFormationComposition,
} from "../application/hexStrategicSystem.js";
import {
  listHexCellsInBounds,
  getHexCellDefinition,
} from "../domain/hexGrid.js";
import { findFormationHexPath } from "../domain/hexPathfinding.js";
import {
  type FormationUnitType,
  type FlotillaComposition,
} from "../domain/militaryFormations.js";
import {
  COLD_WAR_MARKET_CATALOG,
  purchaseMarketUnit,
  getPendingMarketOrders,
} from "../domain/militaryMarket.js";
import { upgradeHexInvestment } from "../domain/hexInvestments.js";
import {
  establishDiplomaticTreaty,
  getActiveDiplomaticTreaties,
  getDiplomaticCables,
  markDiplomaticCablesAsRead,
  getWorldNewsDispatches,
  calculateTreatyOdds,
  getBilateralRelationshipDetails,
  type TreatyType,
  type TributePackage,
} from "../domain/diplomacy.js";
import { checkOllamaStatus } from "../infrastructure/ollamaClient.js";
import {
  negotiateDiplomaticProposal,
  acceptDiplomaticCounterOffer,
  declineDiplomaticCounterOffer,
} from "../domain/diplomaticNegotiator.js";
import {
  COVERT_OPS_CATALOG,
  executeCovertOperation,
  getCovertOperations,
  getCampaignTension,
  type CovertOpType,
} from "../domain/covertOperations.js";
import { getCampaignAiTurnLogs } from "../domain/aiStrategicCommander.js";
import type { AppConfig } from "../infrastructure/config.js";
import type { CampaignDatabase } from "../infrastructure/database.js";
import {
  campaignSessionMiddleware,
  readSessionId,
  sessionCookieNameForServer,
} from "./session.js";
import { worldZone, type WorldLayer } from "../infrastructure/worldData.js";
import {
  applyLaneAction,
  northernFlankBrief,
  northernFlankSituation,
} from "../application/northernFlankMissions.js";
import { composeLaneTraffic } from "../domain/laneTraffic.js";
import type { LaneTrafficPicture } from "../domain/laneTraffic.js";
import { generateLaneMission } from "../domain/laneMission.js";
import type { MissionGenerationConfig } from "../domain/mission-mods/types.js";
import { renderNativeMissionIni } from "../domain/nativeMission.js";
import {
  loadMissionTemplateMetadata,
  templatePlayerStart,
} from "../domain/missionTemplate.js";
import type { TheaterLane } from "../domain/trade.js";

const createCampaignSchema = z.object({
  scenarioFamilyId: z.string().min(1),
  variantId: z.string().min(1),
  countryId: z.string().min(1),
  seed: z.string().trim().min(3).max(64),
  difficulty: z.enum(["standard", "challenging", "hardcore"]),
  techMode: z.enum(["historical", "what-if"]),
});

const missionGenerationConfigSchema = z
  .object({
    areaProfile: z
      .enum(["auto", "coastal", "littoral", "open_ocean"])
      .optional(),
    enabledModules: z
      .array(z.enum(["fisherman_intel_reports", "refinery_state_continuity"]))
      .optional(),
    disabledModules: z
      .array(z.enum(["fisherman_intel_reports", "refinery_state_continuity"]))
      .optional(),
    campaignState: z
      .object({
        destroyedInfrastructureTags: z.array(z.string().min(1)).optional(),
      })
      .optional(),
  })
  .optional();

function mergeDestroyedInfrastructureTags(
  base: MissionGenerationConfig | undefined,
  tags: string[],
): MissionGenerationConfig | undefined {
  const merged = new Set([
    ...(base?.campaignState?.destroyedInfrastructureTags ?? []),
    ...tags,
  ]);
  if (!merged.size && !base) return undefined;
  return {
    ...(base ?? {}),
    campaignState: {
      ...(base?.campaignState ?? {}),
      destroyedInfrastructureTags: [...merged],
    },
  };
}

type AppDependencies = { database?: CampaignDatabase };

export function createApp(
  config: AppConfig,
  dependencies: AppDependencies = {},
): express.Express {
  const app = express();
  const laneDisruptionByCampaign = new Map<string, number>();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  });
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/v1/health", (_request, response) => {
    response.json({
      ok: true,
      service: "theater_campaign",
      version: "0.1.0",
      ollamaUrl: config.ollamaUrl,
      godModeEnabled: config.godModeEnabled,
      requestId: response.locals.requestId,
    });
  });

  app.get("/api/v1/setup/catalog", (_request, response) => {
    const theaterId =
      typeof _request.query.theaterId === "string"
        ? _request.query.theaterId
        : "northern-flank";
    const catalog = setupCatalog(theaterId);
    const theaters = [
      {
        id: "northern-flank",
        name: "Northern Flank",
        summary: "Norwegian Sea and Arctic approaches.",
      },
      {
        id: "north-pacific",
        name: "North Pacific",
        summary: "Pacific Fleet projection and East Asian sea lanes.",
      },
      {
        id: "persian-gulf",
        name: "Persian Gulf",
        summary: "Oil transit, Iran-Iraq conflict, and Gulf access.",
      },
      {
        id: "indian-ocean",
        name: "Indian Ocean",
        summary: "South Asian rivalry and Arabian Sea access.",
      },
    ];
    response.json({
      theaters,
      family: { id: catalog.id, name: catalog.name, summary: catalog.summary },
      variants: catalog.variants,
      countries: catalog.countries
        .filter((country) => country.playable !== false)
        .map(({ id, name, coalitionId, commandScope, objectives }) => ({
          id,
          name,
          coalitionId,
          commandScope,
          objectives,
        })),
      coalitions: catalog.coalitions,
    });
  });

  app.get("/api/v1/world/zone", (request, response) => {
    const query = z
      .object({
        west: z.coerce.number().min(-180).max(180),
        south: z.coerce.number().min(-90).max(90),
        east: z.coerce.number().min(-180).max(180),
        north: z.coerce.number().min(-90).max(90),
        layers: z.string().default("countries,regions,places,ports,airports"),
        limit: z.coerce.number().int().min(1).max(500).default(150),
      })
      .safeParse(request.query);
    if (
      !query.success ||
      query.data.west >= query.data.east ||
      query.data.south >= query.data.north
    ) {
      response.status(400).json({
        error: {
          code: "INVALID_WORLD_BOUNDS",
          message: "World bounds or layer query is invalid.",
          requestId: response.locals.requestId,
        },
      });
      return;
    }
    const allowed = new Set<WorldLayer>([
      "countries",
      "regions",
      "places",
      "ports",
      "airports",
    ]);
    const layers = query.data.layers
      .split(",")
      .filter((layer): layer is WorldLayer => allowed.has(layer as WorldLayer));
    if (layers.length === 0) {
      response.status(400).json({
        error: {
          code: "INVALID_WORLD_LAYERS",
          message: "At least one supported world layer is required.",
          requestId: response.locals.requestId,
        },
      });
      return;
    }
    try {
      response.json({
        ...worldZone(layers, query.data, query.data.limit),
        requestId: response.locals.requestId,
      });
    } catch (error) {
      response.status(503).json({
        error: {
          code: "WORLD_DATA_UNAVAILABLE",
          message:
            error instanceof Error
              ? error.message
              : "World data is unavailable.",
          requestId: response.locals.requestId,
        },
      });
    }
  });

  app.get("/api/v1/campaigns/northern-flank/missions", (request, response) => {
    const parsed = z
      .object({
        tension: z.coerce.number().min(0).max(1).default(0.25),
        routeRisk: z.coerce.number().min(0).max(1).default(0.25),
      })
      .safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({
        error: {
          code: "INVALID_MISSION_CONTEXT",
          message: "Tension and route risk must be between 0 and 1.",
          requestId: response.locals.requestId,
        },
      });
      return;
    }
    response.json({
      ...northernFlankBrief(parsed.data.tension, parsed.data.routeRisk),
      requestId: response.locals.requestId,
    });
  });

  app.post("/api/v1/campaigns", (request, response) => {
    if (!dependencies.database) {
      response.status(503).json({
        error: {
          code: "CAMPAIGN_STORE_UNAVAILABLE",
          message: "Campaign storage is not available.",
          requestId: response.locals.requestId,
        },
      });
      return;
    }
    const parsed = createCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Campaign setup is invalid.",
          details: parsed.error.flatten(),
          requestId: response.locals.requestId,
        },
      });
      return;
    }
    try {
      const existingSessionId = readSessionId(request.headers.cookie);
      if (existingSessionId && dependencies.database) {
        dependencies.database
          .prepare("DELETE FROM local_sessions WHERE id = ?")
          .run(existingSessionId);
      }
      const session = createCampaign(dependencies.database, parsed.data);
      response.cookie("theater_campaign_session", session.id, {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/",
      });
      response.status(201).json({
        campaignId: session.campaignId,
        playerCountryId: session.playerCountryId,
      });
    } catch (error) {
      response.status(400).json({
        error: {
          code: "CAMPAIGN_CREATION_REJECTED",
          message:
            error instanceof Error
              ? error.message
              : "Campaign setup could not be created.",
          requestId: response.locals.requestId,
        },
      });
    }
  });

  const requireCampaignSession = dependencies.database
    ? campaignSessionMiddleware(dependencies.database)
    : (_request: express.Request, response: express.Response) => {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
      };

  app.get("/api/v1/session", requireCampaignSession, (request, response) => {
    if (!dependencies.database) {
      response.status(503).json({
        error: {
          code: "CAMPAIGN_STORE_UNAVAILABLE",
          message: "Campaign storage is not available.",
          requestId: response.locals.requestId,
        },
      });
      return;
    }
    const campaign = getSessionCampaign(
      dependencies.database,
      request.perspective!.sessionId,
    );
    if (!campaign) throw new Error("Campaign session disappeared.");
    response.json(campaign);
  });

  app.delete("/api/v1/session", (request, response) => {
    const sessionId = readSessionId(request.headers.cookie);
    if (sessionId && dependencies.database) {
      dependencies.database
        .prepare("DELETE FROM local_sessions WHERE id = ?")
        .run(sessionId);
    }
    response.clearCookie(sessionCookieNameForServer(), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    response.status(204).end();
  });

  app.get(
    "/api/v1/campaigns/current/missions",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const campaign = getSessionCampaign(
        dependencies.database,
        request.perspective!.sessionId,
      );
      if (!campaign) {
        response.status(409).json({
          error: {
            code: "CAMPAIGN_NOT_SELECTED",
            message: "Select a campaign before accessing mission planning.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      if (campaign.scenarioFamilyId !== "northern-flank") {
        const lanes: TheaterLane[] = campaign.theaterLanes ?? [];
        const laneTraffic: LaneTrafficPicture[] = lanes.map((lane) =>
          composeLaneTraffic(lane, 0.25, campaign.countryId),
        );
        const civilianTrafficExpected = laneTraffic.reduce(
          (sum, picture) =>
            sum +
            picture.traffic.reduce(
              (laneSum, spawn) => laneSum + spawn.expectedDailyCount,
              0,
            ),
          0,
        );
        response.json({
          tension: 0.25,
          routeRisk: 0.25,
          hoursSinceStart: 0,
          contacts: [],
          missions: [],
          traffic: [
            { state: "civilian", expectedDailyCount: civilianTrafficExpected },
          ],
          trade: {
            delivered: lanes.reduce((sum, lane) => sum + lane.dailyValue, 0),
            shortfall: 0,
            risk: 0.25,
            missionHooks: ["escort"],
          },
          lanes,
          laneTraffic,
          requestId: response.locals.requestId,
        });
        return;
      }
      const situation = northernFlankSituation(
        campaign.campaignTime ?? "",
        campaign.variantStartDate ?? campaign.campaignTime ?? "",
      );
      const laneDisruption =
        laneDisruptionByCampaign.get(
          campaign.campaignId ?? request.perspective!.sessionId,
        ) ?? situation.routeRisk;
      response.json({
        ...situation,
        ...northernFlankBrief(
          situation.tension,
          situation.routeRisk,
          laneDisruption,
          campaign.countryId,
        ),
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/lane-actions",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const campaign = getSessionCampaign(
        dependencies.database,
        request.perspective!.sessionId,
      );
      const parsed = z
        .object({
          action: z.enum(["escort", "secure", "investigate", "interdict"]),
          routeId: z.literal("bergen-scapa-fuel"),
        })
        .safeParse(request.body);
      if (!campaign || campaign.scenarioFamilyId !== "northern-flank") {
        response.status(404).json({
          error: {
            code: "LANE_ACTION_UNAVAILABLE",
            message: "Lane actions are unavailable for this theater.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_LANE_ACTION",
            message: "A valid Northern Flank lane action is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const situation = northernFlankSituation(
        campaign.campaignTime ?? "",
        campaign.variantStartDate ?? campaign.campaignTime ?? "",
      );
      const disruption = applyLaneAction(
        situation.routeRisk,
        parsed.data.action,
      );
      laneDisruptionByCampaign.set(
        campaign.campaignId ?? request.perspective!.sessionId,
        disruption,
      );
      response.json({
        action: parsed.data.action,
        routeId: parsed.data.routeId,
        disruption,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/state/advance-day",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const advanced = advanceCampaignDay(
        dependencies.database,
        request.perspective!.campaignId,
      );
      if (!advanced) {
        response.status(404).json({
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaign could not be found.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response.json({ ...advanced, requestId: response.locals.requestId });
    },
  );

  app.get(
    "/api/v1/campaigns/current/state",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const snapshot = getCampaignStateSnapshot(
        dependencies.database,
        request.perspective!.campaignId,
      );
      response.json({ ...snapshot, requestId: response.locals.requestId });
    },
  );

  app.get(
    "/api/v1/campaigns/current/sectors",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const campaign = getSessionCampaign(
        dependencies.database,
        request.perspective!.sessionId,
      );
      if (!campaign) {
        response.status(404).json({
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaign could not be found.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const player = dependencies.database
        .prepare(
          "SELECT coalition_id FROM countries WHERE campaign_id = ? AND id = ?",
        )
        .get(request.perspective!.campaignId, campaign.countryId) as
        { coalition_id: string } | undefined;
      const playerSide = sideForCoalition(player?.coalition_id ?? "allied");
      const state = getCampaignStateSnapshot(
        dependencies.database,
        request.perspective!.campaignId,
      );
      const sectors = resolveSectorView(
        sectorsForTheater(campaign.scenarioFamilyId ?? "northern-flank"),
        state,
        playerSide,
      );

      response.json({
        theaterId: campaign.scenarioFamilyId ?? "northern-flank",
        playerSide,
        sectors,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/sectors/:sectorId/assets/purchase",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const sectorIdParam =
        typeof request.params.sectorId === "string"
          ? request.params.sectorId
          : undefined;
      if (!sectorIdParam) {
        response.status(400).json({
          error: {
            code: "INVALID_SECTOR_ID",
            message: "A valid sector id is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          assetKind: z.enum(["unit", "strategic"]),
          category: z.string().trim().min(1).max(64),
          displayName: z.string().trim().min(1).max(128),
          cost: z.number().int().min(0).max(1_000_000).default(0),
          quantity: z.number().int().min(1).max(1_000).optional(),
          dailyFundsDelta: z
            .number()
            .int()
            .min(-1_000_000)
            .max(1_000_000)
            .optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_SECTOR_ASSET_PURCHASE",
            message: "A valid sector asset purchase payload is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const campaign = getSessionCampaign(
        dependencies.database,
        request.perspective!.sessionId,
      );
      if (!campaign) {
        response.status(404).json({
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaign could not be found.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const definitions = sectorsForTheater(
        campaign.scenarioFamilyId ?? "northern-flank",
      );
      const sector = definitions.find((entry) => entry.id === sectorIdParam);
      if (!sector) {
        response.status(404).json({
          error: {
            code: "SECTOR_NOT_FOUND",
            message: "That sector is not part of the active theater.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      if (parsed.data.assetKind === "unit") {
        if (
          !sector.hooks.unitCategories.includes(
            parsed.data.category as SectorUnitCategory,
          )
        ) {
          response.status(400).json({
            error: {
              code: "UNIT_CATEGORY_NOT_SUPPORTED",
              message: "That unit category is not enabled for this sector.",
              requestId: response.locals.requestId,
            },
          });
          return;
        }
      } else if (
        !sector.hooks.strategicCategories.includes(
          parsed.data.category as SectorStrategicCategory,
        )
      ) {
        response.status(400).json({
          error: {
            code: "STRATEGIC_CATEGORY_NOT_SUPPORTED",
            message: "That strategic category is not enabled for this sector.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const player = dependencies.database
        .prepare(
          "SELECT coalition_id FROM countries WHERE campaign_id = ? AND id = ?",
        )
        .get(request.perspective!.campaignId, campaign.countryId) as
        { coalition_id: string } | undefined;
      const playerSide = sideForCoalition(player?.coalition_id ?? "allied");

      const purchased = purchaseSectorAsset(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        sectorId: sector.id,
        assetKind: parsed.data.assetKind,
        category: parsed.data.category,
        displayName: parsed.data.displayName,
        cost: parsed.data.cost,
        side: playerSide,
        ...(parsed.data.quantity !== undefined
          ? { quantity: parsed.data.quantity }
          : {}),
        ...(parsed.data.dailyFundsDelta !== undefined
          ? { dailyFundsDelta: parsed.data.dailyFundsDelta }
          : {}),
        metadata: { theaterId: campaign.scenarioFamilyId },
      });
      if (!purchased.ok) {
        const status = purchased.reason === "insufficient_funds" ? 409 : 404;
        const code =
          purchased.reason === "insufficient_funds"
            ? "INSUFFICIENT_FUNDS"
            : purchased.reason === "economy_not_found"
              ? "CAMPAIGN_ECONOMY_NOT_FOUND"
              : "CAMPAIGN_NOT_FOUND";
        const message =
          purchased.reason === "insufficient_funds"
            ? "Insufficient funds for sector purchase."
            : "Campaign state unavailable for purchase.";
        response.status(status).json({
          error: {
            code,
            message,
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      response.status(201).json({
        entityId: purchased.entityId,
        fundsRemaining: purchased.fundsRemaining,
        cost: purchased.cost,
        requestId: response.locals.requestId,
      });
    },
  );

  app.patch(
    "/api/v1/campaigns/current/state/entities/:entityId",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          status: z.enum([
            "active",
            "damaged",
            "destroyed",
            "repairing",
            "sunk",
          ]),
          quantity: z.number().int().min(0).optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_ENTITY_UPDATE",
            message: "A valid entity status update is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const entityIdParam =
        typeof request.params.entityId === "string"
          ? request.params.entityId
          : undefined;
      if (!entityIdParam) {
        response.status(400).json({
          error: {
            code: "INVALID_ENTITY_ID",
            message: "A valid entity id is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const ok = updateWorldEntityStatus(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        entityId: entityIdParam,
        status: parsed.data.status,
        ...(parsed.data.quantity !== undefined
          ? { quantity: parsed.data.quantity }
          : {}),
      });
      if (!ok) {
        response.status(404).json({
          error: {
            code: "ENTITY_NOT_FOUND",
            message: "That world entity was not found for this campaign.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response.status(204).end();
    },
  );

  app.post(
    "/api/v1/campaigns/current/state/entities",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          entityType: z.string().trim().min(1).max(64),
          side: z.enum(["blufor", "opfor", "neutral"]),
          tag: z.string().trim().min(1).max(64),
          displayName: z.string().trim().min(1).max(128),
          quantity: z.number().int().min(1).max(1000).optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
          dailyFundsDelta: z
            .number()
            .int()
            .min(-1_000_000)
            .max(1_000_000)
            .optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_ENTITY_CREATE",
            message: "A valid world entity payload is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const entityId = registerWorldEntity(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        entityType: parsed.data.entityType,
        side: parsed.data.side,
        tag: parsed.data.tag,
        displayName: parsed.data.displayName,
        ...(parsed.data.quantity !== undefined
          ? { quantity: parsed.data.quantity }
          : {}),
        ...(parsed.data.metadata !== undefined
          ? { metadata: parsed.data.metadata }
          : {}),
        ...(parsed.data.dailyFundsDelta !== undefined
          ? { dailyFundsDelta: parsed.data.dailyFundsDelta }
          : {}),
      });
      response
        .status(201)
        .json({ entityId, requestId: response.locals.requestId });
    },
  );

  app.post(
    "/api/v1/campaigns/current/state/advance-day",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const result = advanceCampaignDay(
        dependencies.database,
        request.perspective!.campaignId,
      );
      if (!result) {
        response.status(404).json({
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaign not found.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const snapshot = getCampaignStateSnapshot(
        dependencies.database,
        request.perspective!.campaignId,
      );
      response.status(200).json({
        ...result,
        funds: snapshot.economy.funds,
        productionPoints: snapshot.economy.productionPoints,
        fuelStockpile: snapshot.economy.fuelStockpile,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/state/aa-sites/purchase",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          regionKey: z
            .string()
            .trim()
            .min(1)
            .max(64)
            .regex(/^[a-z0-9-]+$/),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_AA_SITE_PURCHASE",
            message: "A valid region key is required to deploy an AA site.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const purchased = purchaseAaSite(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        regionKey: parsed.data.regionKey,
      });
      if (!purchased.ok) {
        const codeByReason: Record<string, string> = {
          campaign_not_found: "CAMPAIGN_NOT_FOUND",
          economy_not_found: "CAMPAIGN_ECONOMY_NOT_FOUND",
          region_not_found: "AA_REGION_NOT_FOUND",
          region_full: "AA_REGION_CAPACITY_REACHED",
          insufficient_funds: "INSUFFICIENT_FUNDS",
        };
        const messageByReason: Record<string, string> = {
          campaign_not_found: "Campaign could not be found.",
          economy_not_found: "Campaign economy could not be found.",
          region_not_found: "That AA deployment region is unavailable.",
          region_full: "AA deployment slots for that region are already full.",
          insufficient_funds: `Insufficient funds to deploy AA site (${AA_SITE_PURCHASE_COST}).`,
        };
        const statusByReason: Record<string, number> = {
          campaign_not_found: 404,
          economy_not_found: 404,
          region_not_found: 404,
          region_full: 409,
          insufficient_funds: 409,
        };
        response.status(statusByReason[purchased.reason] ?? 400).json({
          error: {
            code: codeByReason[purchased.reason] ?? "AA_SITE_PURCHASE_FAILED",
            message:
              messageByReason[purchased.reason] ??
              "AA site procurement could not be completed.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      response.status(201).json({
        entityId: purchased.entityId,
        regionKey: purchased.regionKey,
        purchaseCost: purchased.purchaseCost,
        fundsRemaining: purchased.fundsRemaining,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/state/forces/:inventoryId/actions",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          action: z.enum(["purchase", "loss", "repair"]),
          quantity: z.number().int().min(1),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_FORCE_ACTION",
            message: "A valid force inventory action is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const inventoryIdParam =
        typeof request.params.inventoryId === "string"
          ? request.params.inventoryId
          : undefined;
      if (!inventoryIdParam) {
        response.status(400).json({
          error: {
            code: "INVALID_INVENTORY_ID",
            message: "A valid inventory id is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const ok = applyForceInventoryAction(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        inventoryId: inventoryIdParam,
        action: parsed.data.action,
        quantity: parsed.data.quantity,
      });
      if (!ok) {
        response.status(404).json({
          error: {
            code: "INVENTORY_NOT_FOUND",
            message: "That inventory row was not found for this campaign.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response.status(204).end();
    },
  );

  app.post(
    "/api/v1/campaigns/current/lane-missions",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const campaign = getSessionCampaign(
        dependencies.database,
        request.perspective!.sessionId,
      );
      const parsed = z
        .object({
          routeId: z.string().min(1),
          seed: z.string().trim().min(1).max(64).optional(),
          generationConfig: missionGenerationConfigSchema,
        })
        .safeParse(request.body);
      if (!campaign || !parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_LANE_MISSION",
            message: "A valid lane and mission seed are required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const lane = campaign.theaterLanes?.find(
        (entry) => entry.routeId === parsed.data.routeId,
      );
      if (!lane) {
        response.status(404).json({
          error: {
            code: "LANE_NOT_FOUND",
            message: "That lane is not part of the active theater.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const risk =
        campaign.scenarioFamilyId === "northern-flank" ||
        lane.region === "north_atlantic"
          ? northernFlankSituation(
              campaign.campaignTime ?? "",
              campaign.variantStartDate ?? campaign.campaignTime ?? "",
            ).routeRisk
          : 0.25;
      const traffic = composeLaneTraffic(
        lane,
        risk,
        campaign.countryId ?? "unknown",
      );
      const templatePath = resolve(
        process.cwd(),
        "..",
        "Sea Power_Data",
        "StreamingAssets",
        "user",
        "missions",
        "_bergen_region_template.ini",
      );
      const template =
        campaign.scenarioFamilyId === "northern-flank" ||
        lane.region === "north_atlantic"
          ? loadMissionTemplateMetadata(templatePath)
          : undefined;
      const missionSeed = parsed.data.seed ?? campaign.name ?? lane.name;
      const baseConfig = parsed.data.generationConfig as
        MissionGenerationConfig | undefined;
      const snapshot = getCampaignStateSnapshot(
        dependencies.database,
        request.perspective!.campaignId,
      );
      const generationConfig = mergeDestroyedInfrastructureTags(
        baseConfig,
        snapshot.destroyedInfrastructureTags,
      );
      response.json({
        ...generateLaneMission(
          lane,
          traffic,
          missionSeed,
          campaign.countryId ?? "unknown",
          risk,
          template ? templatePlayerStart(template, missionSeed) : undefined,
          campaign.campaignTime ?? undefined,
          template,
          generationConfig,
        ),
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/lane-missions/install",
    requireCampaignSession,
    async (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const campaign = getSessionCampaign(
        dependencies.database,
        request.perspective!.sessionId,
      );
      const parsed = z
        .object({
          routeId: z.string().min(1),
          seed: z.string().trim().min(1).max(64).optional(),
          generationConfig: missionGenerationConfigSchema,
        })
        .safeParse(request.body);
      if (!campaign || !parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_LANE_INSTALL",
            message: "A valid lane and mission seed are required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const lane = campaign.theaterLanes?.find(
        (entry) => entry.routeId === parsed.data.routeId,
      );
      if (!lane) {
        response.status(404).json({
          error: {
            code: "LANE_NOT_FOUND",
            message: "That lane is not part of the active theater.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const risk =
        campaign.scenarioFamilyId === "northern-flank" ||
        lane.region === "north_atlantic"
          ? northernFlankSituation(
              campaign.campaignTime ?? "",
              campaign.variantStartDate ?? campaign.campaignTime ?? "",
            ).routeRisk
          : 0.25;
      const playerCountryId = campaign.countryId ?? "unknown";
      const traffic = composeLaneTraffic(lane, risk, playerCountryId);
      const templatePath = resolve(
        process.cwd(),
        "..",
        "Sea Power_Data",
        "StreamingAssets",
        "user",
        "missions",
        "_bergen_region_template.ini",
      );
      const template =
        campaign.scenarioFamilyId === "northern-flank"
          ? loadMissionTemplateMetadata(templatePath)
          : undefined;
      const mission = generateLaneMission(
        lane,
        traffic,
        parsed.data.seed ?? campaign.name ?? lane.name,
        playerCountryId,
        risk,
        campaign.scenarioFamilyId === "northern-flank"
          ? template
            ? templatePlayerStart(
                template,
                parsed.data.seed ?? campaign.name ?? lane.name,
              )
            : undefined
          : undefined,
        campaign.campaignTime ?? undefined,
        template,
        mergeDestroyedInfrastructureTags(
          parsed.data.generationConfig as MissionGenerationConfig | undefined,
          getCampaignStateSnapshot(
            dependencies.database,
            request.perspective!.campaignId,
          ).destroyedInfrastructureTags,
        ),
      );
      const safeName =
        `${mission.laneId}-${mission.seed}`
          .replace(/[^a-z0-9-_]+/gi, "-")
          .replace(/-+/g, "-")
          .toLowerCase()
          .slice(0, 80) || "lane-mission";
      const missionsDirectory = resolve(
        process.cwd(),
        "..",
        "Sea Power_Data",
        "StreamingAssets",
        "user",
        "missions",
      );
      const temporaryPath = resolve(missionsDirectory, `${safeName}.mis`);
      const installedPath = resolve(missionsDirectory, `${safeName}.ini`);
      try {
        await mkdir(missionsDirectory, { recursive: true });
        await writeFile(
          temporaryPath,
          renderNativeMissionIni(
            mission,
            mergeDestroyedInfrastructureTags(
              parsed.data.generationConfig as
                MissionGenerationConfig | undefined,
              getCampaignStateSnapshot(
                dependencies.database,
                request.perspective!.campaignId,
              ).destroyedInfrastructureTags,
            ),
          ),
          "utf8",
        );
        await rm(installedPath, { force: true });
        await rename(temporaryPath, installedPath);
        response.json({
          fileName: `${safeName}.ini`,
          installedPath,
          missionId: mission.id,
          requestId: response.locals.requestId,
        });
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        response.status(500).json({
          error: {
            code: "MISSION_INSTALL_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "The mission could not be installed.",
            requestId: response.locals.requestId,
          },
        });
      }
    },
  );

  app.delete("/api/v1/session", (request, response) => {
    if (!dependencies.database) {
      response.status(503).json({
        error: {
          code: "CAMPAIGN_STORE_UNAVAILABLE",
          message: "Campaign storage is not available.",
          requestId: response.locals.requestId,
        },
      });
      return;
    }
    const sessionId = request.headers.cookie?.match(
      /(?:^|;\s*)theater_campaign_session=([^;]+)/,
    )?.[1];
    if (sessionId) {
      dependencies.database
        .prepare("DELETE FROM local_sessions WHERE id = ?")
        .run(sessionId);
    }
    response.clearCookie("theater_campaign_session", {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
    });
    response.status(204).end();
  });

  app.get(
    "/api/v1/campaigns/current/hex-grid",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const godMode = request.query.godMode === "true";
      const hexState = getCampaignHexState(
        dependencies.database,
        request.perspective!.campaignId,
        request.perspective!.playerCountryId,
        { godMode, filterFogOfWar: true },
      );

      const west = request.query.west ? Number(request.query.west) : undefined;
      const south = request.query.south
        ? Number(request.query.south)
        : undefined;
      const east = request.query.east ? Number(request.query.east) : undefined;
      const north = request.query.north
        ? Number(request.query.north)
        : undefined;

      let hexCells = hexState.hexCells;
      if (
        west !== undefined &&
        south !== undefined &&
        east !== undefined &&
        north !== undefined &&
        !isNaN(west) &&
        !isNaN(south) &&
        !isNaN(east) &&
        !isNaN(north)
      ) {
        hexCells = listHexCellsInBounds({ west, south, east, north });
      }

      response.status(200).json({
        ...hexState,
        hexCells,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/formations/:formationId/move",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          targetHexId: z.string().min(1).max(64),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_FORMATION_MOVE",
            message: "A valid targetHexId is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";
      const result = moveFormation(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        formationId: formationIdParam,
        targetHexId: parsed.data.targetHexId,
        playerCountryId: request.perspective!.playerCountryId,
      });
      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "FORMATION_MOVE_FAILED",
            message:
              result.reason ?? "Formation movement could not be completed.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response.status(200).json({
        ok: true,
        contested: result.contested,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/formations/:formationId/movement-order",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          targetHexId: z.string().min(1).max(64),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_MOVEMENT_ORDER_PAYLOAD",
            message: "A valid targetHexId is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";
      const result = issueFormationMovementOrder(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        formationId: formationIdParam,
        targetHexId: parsed.data.targetHexId,
        playerCountryId: request.perspective!.playerCountryId,
      });
      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "MOVEMENT_ORDER_FAILED",
            message:
              result.reason ?? "Multi-turn movement order could not be issued.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response.status(200).json({
        ok: true,
        route: result.route,
        formation: result.formation,
        contested: result.contested,
        requestId: response.locals.requestId,
      });
    },
  );

  app.delete(
    "/api/v1/campaigns/current/formations/:formationId/movement-order",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";
      const result = cancelFormationMovementOrder(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        formationId: formationIdParam,
        playerCountryId: request.perspective!.playerCountryId,
      });
      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "CANCEL_MOVEMENT_ORDER_FAILED",
            message: result.reason ?? "Movement order could not be cancelled.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response.status(200).json({
        ok: true,
        formation: result.formation,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/formations/:formationId/path",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          targetHexId: z.string().min(1).max(64),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_PATH_REQUEST",
            message: "A valid targetHexId is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";

      const formationRow = dependencies.database
        .prepare(
          `SELECT id, hex_id, unit_type, action_points, max_action_points, embarked_on_id FROM campaign_formations WHERE campaign_id = ? AND id = ?`,
        )
        .get(request.perspective!.campaignId, formationIdParam) as
        | {
            id: string;
            hex_id: string;
            unit_type: FormationUnitType;
            action_points: number;
            max_action_points: number;
            embarked_on_id: string | null;
          }
        | undefined;

      if (!formationRow) {
        response.status(404).json({
          error: {
            code: "FORMATION_NOT_FOUND",
            message: "Formation not found.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const startHexDef = getHexCellDefinition(formationRow.hex_id);
      const targetHexDef = getHexCellDefinition(parsed.data.targetHexId);

      const pathResult = findFormationHexPath({
        startAxial: startHexDef.axial,
        targetAxial: targetHexDef.axial,
        unitType: formationRow.unit_type,
        isEmbarked: !!formationRow.embarked_on_id,
        currentAP: formationRow.action_points,
        maxAP: formationRow.max_action_points,
      });

      response.status(200).json({
        ...pathResult,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/formations/recruit",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          unitType: z.string().min(1),
          hexId: z.string().min(1),
          customName: z.string().max(64).optional(),
          side: z.enum(["blufor", "opfor", "neutral"]).optional(),
          countryId: z.string().max(64).optional(),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_RECRUITMENT_PAYLOAD",
            message: "Invalid recruitment parameters.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const result = recruitFormation(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        unitType: parsed.data.unitType as FormationUnitType,
        hexId: parsed.data.hexId,
        customName: parsed.data.customName,
        side: parsed.data.side,
        countryId: parsed.data.countryId,
      });

      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "FORMATION_RECRUIT_FAILED",
            message:
              result.reason ?? "Formation recruitment could not be completed.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      response.status(201).json({
        ok: true,
        formation: result.formation,
        requestId: response.locals.requestId,
      });
    },
  );

  app.patch(
    "/api/v1/campaigns/current/formations/:formationId",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";

      const parsed = z
        .object({
          name: z.string().max(128).optional(),
          customComposition: z
            .object({
              formationType: z.string().min(1),
              countryId: z.string().optional(),
              side: z.enum(["blufor", "opfor", "neutral"]).optional(),
              callsignPrefix: z.string().optional(),
              totalVessels: z.number().optional(),
              totalSubmarines: z.number().optional(),
              totalAircraft: z.number().optional(),
              totalVehicles: z.number().optional(),
              flagshipName: z.string().optional(),
              summary: z.string().optional(),
              units: z.array(
                z.object({
                  id: z.string().min(1),
                  name: z.string().min(1),
                  unitClass: z.string().min(1),
                  classIniRef: z.string().min(1),
                  category: z.enum([
                    "vessel",
                    "submarine",
                    "aircraft",
                    "land_unit",
                  ]),
                  subCategory: z.string().optional(),
                  role: z.string().min(1),
                  count: z.number().min(1).max(999),
                  fundsCost: z.number().optional(),
                  productionCost: z.number().optional(),
                  pointValue: z.number().optional(),
                  introducedYear: z.number().optional(),
                  modernizationFamily: z.string().optional(),
                  modernizationLevel: z.number().optional(),
                  modernizationDescription: z.string().optional(),
                  isProxy: z.boolean(),
                  proxyFor: z.string().optional(),
                }),
              ),
            })
            .optional(),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_FORMATION_UPDATE_PAYLOAD",
            message: "Invalid formation update parameters.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const result = updateFormationComposition(
        dependencies.database,
        request.perspective!.campaignId,
        formationIdParam,
        {
          name: parsed.data.name,
          customComposition: parsed.data
            .customComposition as FlotillaComposition,
          playerCountryId: request.perspective!.playerCountryId,
        },
      );

      if (!result.ok) {
        const isInsufficientFunds = result.error.includes("Insufficient funds");
        response.status(isInsufficientFunds ? 409 : 404).json({
          error: {
            code: isInsufficientFunds
              ? "INSUFFICIENT_FUNDS"
              : "FORMATION_UPDATE_FAILED",
            message: result.error ?? "Formation could not be updated.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      response.status(200).json({
        ok: true,
        formation: result.formation,
        fundsRemaining: result.fundsRemaining,
        deltaFunds: result.deltaFunds,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/formations/:formationId/embark",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          sealiftFormationId: z.string().min(1).max(128),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_EMBARK_PAYLOAD",
            message: "A valid sealiftFormationId is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";
      const result = embarkFormation(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        groundFormationId: formationIdParam,
        sealiftFormationId: parsed.data.sealiftFormationId,
        playerCountryId: request.perspective!.playerCountryId,
      });
      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "EMBARK_FAILED",
            message: result.reason ?? "Embarkation could not be completed.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response
        .status(200)
        .json({ ok: true, requestId: response.locals.requestId });
    },
  );

  app.post(
    "/api/v1/campaigns/current/formations/:formationId/disembark",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          targetHexId: z.string().min(1).max(64),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_DISEMBARK_PAYLOAD",
            message: "A valid targetHexId is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";
      const result = disembarkFormation(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        groundFormationId: formationIdParam,
        targetHexId: parsed.data.targetHexId,
        playerCountryId: request.perspective!.playerCountryId,
      });
      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "DISEMBARK_FAILED",
            message: result.reason ?? "Disembarkation could not be completed.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response
        .status(200)
        .json({ ok: true, requestId: response.locals.requestId });
    },
  );

  app.delete(
    "/api/v1/campaigns/current/formations/:formationId/movement-order/dismiss",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";
      const result = dismissCompletedMovementOrder(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        formationId: formationIdParam,
        playerCountryId: request.perspective!.playerCountryId,
      });
      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "ORDER_DISMISS_FAILED",
            message: result.reason ?? "Order could not be dismissed.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response
        .status(200)
        .json({ ok: true, requestId: response.locals.requestId });
    },
  );

  app.post(
    "/api/v1/campaigns/current/formations/:formationId/refuel-rearm",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";
      const result = refuelAndRearmFormation(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        formationId: formationIdParam,
        playerCountryId: request.perspective!.playerCountryId,
      });
      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "REFUEL_REARM_FAILED",
            message: result.reason ?? "Refueling could not be completed.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response.status(200).json({
        ok: true,
        fundsCost: result.fundsCost,
        fuelCost: result.fuelCost,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/formations/:formationId/rest-refit",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";
      const result = restAndRefitFormation(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        formationId: formationIdParam,
        playerCountryId: request.perspective!.playerCountryId,
      });
      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "REST_REFIT_FAILED",
            message: result.reason ?? "Rest & refit could not be granted.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response
        .status(200)
        .json({ ok: true, requestId: response.locals.requestId });
    },
  );

  app.post(
    "/api/v1/campaigns/current/formations/:formationId/train",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          turns: z.number().int().min(1).max(10).default(1),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_TRAINING_PAYLOAD",
            message: "A valid training duration is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const formationIdParam =
        typeof request.params.formationId === "string"
          ? request.params.formationId
          : "";
      const result = orderCombatTraining(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        formationId: formationIdParam,
        turns: parsed.data.turns,
        playerCountryId: request.perspective!.playerCountryId,
      });
      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "TRAINING_ORDER_FAILED",
            message: result.reason ?? "Training order could not be issued.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      response
        .status(200)
        .json({ ok: true, requestId: response.locals.requestId });
    },
  );

  app.post(
    "/api/v1/campaigns/current/hex-cells/:hexId/engage",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const hexIdParam =
        typeof request.params.hexId === "string" ? request.params.hexId : "";
      const parsed = z
        .object({
          missionTitle: z.string().max(128).optional(),
        })
        .safeParse(request.body ?? {});

      const result = generateSeaPowerHexBattle(dependencies.database, {
        campaignId: request.perspective!.campaignId,
        hexId: hexIdParam,
        ...(parsed.success && parsed.data.missionTitle
          ? { missionTitle: parsed.data.missionTitle }
          : {}),
      });
      response.status(200).json({
        ...result,
        requestId: response.locals.requestId,
      });
    },
  );

  // 1. Military Market: Get Catalog and Pending Deliveries
  app.get(
    "/api/v1/campaigns/current/market/catalog",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const pendingOrders = getPendingMarketOrders(
        dependencies.database,
        request.perspective!.campaignId,
      );
      response.status(200).json({
        ok: true,
        catalog: COLD_WAR_MARKET_CATALOG,
        pendingOrders,
        requestId: response.locals.requestId,
      });
    },
  );

  // 2. Military Market: Purchase Surplus Asset
  app.post(
    "/api/v1/campaigns/current/market/purchase",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          listingId: z.string().min(1),
          targetHexId: z.string().min(1),
          customName: z.string().optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_MARKET_PURCHASE_PAYLOAD",
            message: "A valid listing ID and target port hex ID are required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      try {
        const order = purchaseMarketUnit(
          dependencies.database,
          request.perspective!.campaignId,
          request.perspective!.playerCountryId,
          parsed.data.listingId,
          parsed.data.targetHexId,
          parsed.data.customName,
        );
        response.status(200).json({
          ok: true,
          order,
          requestId: response.locals.requestId,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to purchase surplus unit.";
        response.status(400).json({
          error: {
            code: "MARKET_PURCHASE_FAILED",
            message,
            requestId: response.locals.requestId,
          },
        });
      }
    },
  );

  // 3. Hex Regional Investment: Upgrade Tier
  app.post(
    "/api/v1/campaigns/current/hex-cells/:hexId/investment/upgrade",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const hexIdParam =
        typeof request.params.hexId === "string" ? request.params.hexId : "";
      try {
        const result = upgradeHexInvestment(
          dependencies.database,
          request.perspective!.campaignId,
          hexIdParam,
        );
        response.status(200).json({
          ok: true,
          ...result,
          requestId: response.locals.requestId,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to upgrade hex investment tier.";
        response.status(400).json({
          error: {
            code: "HEX_INVESTMENT_UPGRADE_FAILED",
            message,
            requestId: response.locals.requestId,
          },
        });
      }
    },
  );

  // 4. Diplomacy: Get Active Treaties
  app.get(
    "/api/v1/campaigns/current/diplomacy/treaties",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const treaties = getActiveDiplomaticTreaties(
        dependencies.database,
        request.perspective!.campaignId,
      );
      response.status(200).json({
        ok: true,
        treaties,
        requestId: response.locals.requestId,
      });
    },
  );

  // 5. Diplomacy: Establish Treaty
  app.post(
    "/api/v1/campaigns/current/diplomacy/treaties",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const parsed = z
        .object({
          treatyType: z.enum([
            "ceasefire",
            "non_aggression",
            "tribute",
            "alliance",
            "mutual_defense",
          ]),
          targetCountryId: z.string().min(1),
          durationTurns: z.number().int().min(1).max(30).default(5),
          terms: z.record(z.string(), z.unknown()).optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_DIPLOMACY_PAYLOAD",
            message: "A valid treaty type and target country ID are required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      try {
        const treaty = establishDiplomaticTreaty(
          dependencies.database,
          request.perspective!.campaignId,
          parsed.data.treatyType as TreatyType,
          request.perspective!.playerCountryId,
          parsed.data.targetCountryId,
          parsed.data.durationTurns,
          parsed.data.terms ?? {},
        );
        response.status(200).json({
          ok: true,
          treaty,
          requestId: response.locals.requestId,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to establish diplomatic treaty.";
        response.status(400).json({
          error: {
            code: "DIPLOMACY_ESTABLISH_FAILED",
            message,
            requestId: response.locals.requestId,
          },
        });
      }
    },
  );

  app.get(
    "/api/v1/campaigns/current/ai/ollama/status",
    requireCampaignSession,
    async (_request, response) => {
      const status = await checkOllamaStatus();
      response.json({
        ok: true,
        status,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/diplomacy/negotiate",
    requireCampaignSession,
    async (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const body = request.body as {
        targetCountryId?: string;
        treatyType?: string;
        durationTurns?: number;
        offeredTributeFunds?: number;
        tribute?: TributePackage;
      };

      if (!body.targetCountryId || !body.treatyType || !body.durationTurns) {
        response.status(400).json({
          error: {
            code: "INVALID_NEGOTIATION_INPUT",
            message: "Missing targetCountryId, treatyType, or durationTurns.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      try {
        const negotiation = await negotiateDiplomaticProposal(
          dependencies.database,
          request.perspective!.campaignId,
          {
            proposingCountryId: request.perspective!.playerCountryId,
            targetCountryId: body.targetCountryId,
            treatyType: body.treatyType as TreatyType,
            durationTurns: Number(body.durationTurns),
            offeredTributeFunds:
              typeof body.offeredTributeFunds === "number"
                ? body.offeredTributeFunds
                : undefined,
            tribute: body.tribute,
          },
        );

        response.json({
          ok: true,
          negotiation,
          requestId: response.locals.requestId,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Diplomatic negotiation failed.";
        response.status(400).json({
          error: {
            code: "DIPLOMACY_NEGOTIATION_FAILED",
            message,
            requestId: response.locals.requestId,
          },
        });
      }
    },
  );

  app.get(
    "/api/v1/campaigns/current/diplomacy/cables",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const cables = getDiplomaticCables(
        dependencies.database,
        request.perspective!.campaignId,
      );
      const unreadCount = cables.filter((c) => !c.isRead).length;
      response.json({
        ok: true,
        cables,
        unreadCount,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/diplomacy/cables/mark-read",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const body = request.body as { cableIds?: string[] };
      const updatedCount = markDiplomaticCablesAsRead(
        dependencies.database,
        request.perspective!.campaignId,
        body.cableIds,
      );
      response.json({
        ok: true,
        updatedCount,
        requestId: response.locals.requestId,
      });
    },
  );

  app.get(
    "/api/v1/campaigns/current/diplomacy/world-news",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const dispatches = getWorldNewsDispatches(
        dependencies.database,
        request.perspective!.campaignId,
        30,
      );
      response.json({
        ok: true,
        dispatches,
        requestId: response.locals.requestId,
      });
    },
  );

  app.get(
    "/api/v1/campaigns/current/diplomacy/eligibility",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }
      const targetCountryId = request.query.targetCountryId as string;
      const treatyType = request.query.treatyType as TreatyType;

      if (!targetCountryId || !treatyType) {
        response.status(400).json({
          error: {
            code: "MISSING_QUERY_PARAMS",
            message:
              "targetCountryId and treatyType query params are required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const durationTurns = request.query.durationTurns
        ? Number(request.query.durationTurns)
        : 90;
      const offeredTributeFunds = request.query.offeredTributeFunds
        ? Number(request.query.offeredTributeFunds)
        : 0;

      const odds = calculateTreatyOdds(
        dependencies.database,
        request.perspective!.campaignId,
        request.perspective!.playerCountryId,
        targetCountryId,
        treatyType,
        durationTurns,
        offeredTributeFunds,
      );

      response.json({
        ok: true,
        eligible: !odds.isHardRedline,
        reason: odds.redlineReason,
        odds,
        requestId: response.locals.requestId,
      });
    },
  );

  app.get(
    "/api/v1/campaigns/current/diplomacy/relations",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const targetCountryId = request.query.targetCountryId as
        string | undefined;
      if (!targetCountryId) {
        response.status(400).json({
          error: {
            code: "MISSING_TARGET_COUNTRY",
            message: "targetCountryId query param is required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const relations = getBilateralRelationshipDetails(
        dependencies.database,
        request.perspective!.campaignId,
        request.perspective!.playerCountryId,
        targetCountryId,
      );

      response.json({
        ok: true,
        relations,
        requestId: response.locals.requestId,
      });
    },
  );

  app.get(
    "/api/v1/campaigns/current/diplomacy/odds",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const targetCountryId = request.query.targetCountryId as
        string | undefined;
      const treatyType = request.query.treatyType as TreatyType | undefined;
      const durationTurns = request.query.durationTurns
        ? Number(request.query.durationTurns)
        : 90;

      if (!targetCountryId || !treatyType) {
        response.status(400).json({
          error: {
            code: "MISSING_QUERY_PARAMS",
            message:
              "targetCountryId and treatyType query params are required.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      let tributePackage: TributePackage = {
        mode: (request.query.tributeMode as "offer" | "demand") || "offer",
        funds: request.query.offeredTributeFunds
          ? Number(request.query.offeredTributeFunds)
          : 0,
        fuel: request.query.offeredTributeFuel
          ? Number(request.query.offeredTributeFuel)
          : 0,
        production: request.query.offeredTributeProduction
          ? Number(request.query.offeredTributeProduction)
          : 0,
        techSharing: request.query.techSharing === "true",
        transferredFormationId: request.query.transferredFormationId as
          string | undefined,
        cededHexId: request.query.cededHexId as string | undefined,
      };

      if (request.query.tributeJson) {
        try {
          tributePackage = JSON.parse(request.query.tributeJson as string);
        } catch {
          // ignore
        }
      }

      const odds = calculateTreatyOdds(
        dependencies.database,
        request.perspective!.campaignId,
        request.perspective!.playerCountryId,
        targetCountryId,
        treatyType,
        durationTurns,
        tributePackage,
      );

      response.json({
        ok: true,
        odds,
        eligible: !odds.isHardRedline,
        reason: odds.redlineReason,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/diplomacy/counter-offer/accept",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const body = request.body as {
        targetCountryId?: string;
        treatyType?: string;
        durationTurns?: number;
        demandedFunds?: number;
        demandedFuel?: number;
        demandedProduction?: number;
        conditionSummary?: string;
      };

      if (!body.targetCountryId || !body.treatyType) {
        response.status(400).json({
          error: {
            code: "INVALID_COUNTER_OFFER_INPUT",
            message: "Missing targetCountryId or treatyType.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const durationTurns =
        Number(body.durationTurns) > 0 ? Number(body.durationTurns) : 30;

      const result = acceptDiplomaticCounterOffer(
        dependencies.database,
        request.perspective!.campaignId,
        {
          proposingCountryId: request.perspective!.playerCountryId,
          targetCountryId: body.targetCountryId,
          treatyType: body.treatyType as TreatyType,
          durationTurns,
          demandedFunds:
            typeof body.demandedFunds === "number"
              ? Math.max(0, body.demandedFunds)
              : undefined,
          demandedFuel:
            typeof body.demandedFuel === "number"
              ? Math.max(0, body.demandedFuel)
              : undefined,
          demandedProduction:
            typeof body.demandedProduction === "number"
              ? Math.max(0, body.demandedProduction)
              : undefined,
          conditionSummary: body.conditionSummary,
        },
      );

      if (!result.ok) {
        response.status(400).json({
          error: {
            code: "COUNTER_OFFER_ACCEPTANCE_FAILED",
            message: result.error ?? "Failed to accept counter-offer.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      response.json({
        ok: true,
        ratifiedTreaty: result.ratifiedTreaty,
        falloutCables: result.falloutCables,
        updatedRelations: result.updatedRelations,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/diplomacy/counter-offer/decline",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const body = request.body as {
        targetCountryId?: string;
        treatyType?: string;
        reason?: string;
      };

      if (!body.targetCountryId || !body.treatyType) {
        response.status(400).json({
          error: {
            code: "INVALID_DECLINE_INPUT",
            message: "Missing targetCountryId or treatyType.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const result = declineDiplomaticCounterOffer(
        dependencies.database,
        request.perspective!.campaignId,
        {
          decliningCountryId: request.perspective!.playerCountryId,
          targetCountryId: body.targetCountryId,
          treatyType: body.treatyType as TreatyType,
          reason: body.reason,
        },
      );

      response.json({
        ok: true,
        cableRecorded: result.cableRecorded,
        updatedRelations: result.updatedRelations,
        requestId: response.locals.requestId,
      });
    },
  );

  app.get(
    "/api/v1/campaigns/current/covert-ops",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const operations = getCovertOperations(
        dependencies.database,
        request.perspective!.campaignId,
      );
      response.json({
        ok: true,
        catalog: COVERT_OPS_CATALOG,
        operations,
        requestId: response.locals.requestId,
      });
    },
  );

  app.get(
    "/api/v1/campaigns/current/ai-turn-logs",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const turn = request.query.turn ? Number(request.query.turn) : undefined;
      const logs = getCampaignAiTurnLogs(
        dependencies.database,
        request.perspective!.campaignId,
        turn,
      );
      response.json({
        ok: true,
        logs,
        requestId: response.locals.requestId,
      });
    },
  );

  app.post(
    "/api/v1/campaigns/current/covert-ops/launch",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const body = request.body as {
        targetCountryId?: string;
        targetHexId?: string;
        opType?: CovertOpType;
      };

      if (!body.targetCountryId || !body.targetHexId || !body.opType) {
        response.status(400).json({
          error: {
            code: "INVALID_COVERT_OP_INPUT",
            message: "Missing targetCountryId, targetHexId, or opType.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      try {
        const result = executeCovertOperation(
          dependencies.database,
          request.perspective!.campaignId,
          {
            sourceCountryId: request.perspective!.playerCountryId,
            targetCountryId: body.targetCountryId,
            targetHexId: body.targetHexId,
            opType: body.opType,
          },
        );

        response.json({
          ...result,
          requestId: response.locals.requestId,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to launch covert operation.";
        response.status(400).json({
          error: {
            code: "COVERT_OP_LAUNCH_FAILED",
            message,
            requestId: response.locals.requestId,
          },
        });
      }
    },
  );

  app.get(
    "/api/v1/campaigns/current/tensions",
    requireCampaignSession,
    (request, response) => {
      if (!dependencies.database) {
        response.status(503).json({
          error: {
            code: "CAMPAIGN_STORE_UNAVAILABLE",
            message: "Campaign storage is not available.",
            requestId: response.locals.requestId,
          },
        });
        return;
      }

      const tension = getCampaignTension(
        dependencies.database,
        request.perspective!.campaignId,
      );
      response.json({
        ok: true,
        tension,
        requestId: response.locals.requestId,
      });
    },
  );

  const webBuildPath = resolve(process.cwd(), "dist", "web");
  if (existsSync(webBuildPath)) {
    app.use(express.static(webBuildPath, { etag: false, maxAge: 0 }));
    app.use((request, response, next) => {
      if (request.method === "GET" && !request.path.startsWith("/api/")) {
        response.sendFile(resolve(webBuildPath, "index.html"));
        return;
      }
      next();
    });
  }

  const notFound: RequestHandler = (_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource does not exist.",
        requestId: response.locals.requestId,
      },
    });
  };
  app.use(notFound);

  const errors: ErrorRequestHandler = (error, _request, response, next) => {
    void next;
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Request body must contain valid JSON.",
          requestId: response.locals.requestId,
        },
      });
      return;
    }
    console.error("Unhandled request error.", error);
    response.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "The server could not complete the request.",
        requestId: response.locals.requestId,
      },
    });
  };
  app.use(errors);

  return app;
}
