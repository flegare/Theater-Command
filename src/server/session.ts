import type { RequestHandler } from "express";
import type { CampaignDatabase } from "../infrastructure/database.js";

export type RequestPerspective = {
  sessionId: string;
  campaignId: string;
  playerCountryId: string;
};

const sessionCookieName = "theater_campaign_session";

export function readSessionId(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== sessionCookieName) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

declare module "express-serve-static-core" {
  interface Request {
    perspective?: RequestPerspective;
  }
}

export function campaignSessionMiddleware(
  database: CampaignDatabase,
): RequestHandler {
  return (request, response, next) => {
    const sessionId = readSessionId(request.headers.cookie);
    const session = sessionId
      ? (database
          .prepare(
            `SELECT campaign_id, player_country_id
             FROM local_sessions
             WHERE id = ?`,
          )
          .get(sessionId) as
          { campaign_id: string; player_country_id: string } | undefined)
      : undefined;

    if (!session || !sessionId) {
      response.status(409).json({
        error: {
          code: "CAMPAIGN_NOT_SELECTED",
          message: "Select a campaign before accessing theater command.",
          requestId: response.locals.requestId,
        },
      });
      return;
    }

    database
      .prepare("UPDATE local_sessions SET last_used_at = ? WHERE id = ?")
      .run(Date.now(), sessionId);
    request.perspective = {
      sessionId,
      campaignId: session.campaign_id,
      playerCountryId: session.player_country_id,
    };
    next();
  };
}

export function sessionCookieNameForServer(): string {
  return sessionCookieName;
}
