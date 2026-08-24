import {
  JellyfinWebhookParser,
  JellyfinWebhookPayload,
} from "@integrations/jellyfin/JellyfinWebhookParser";
import {
  PlexWebhookParser,
  PlexWebhookPayload,
} from "@integrations/plex/PlexWebhookParser";
import {
  TautulliWebhookParser,
  TautulliWebhookPayload,
} from "@integrations/tautulli/TautulliWebhookParser";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { SyncService } from "@services/SyncService";
import { logger } from "@utils/logger";
import { timingSafeStringEqual } from "@utils/timingSafeEqual";
import { Router, Request, Response } from "express";
import multer from "multer";

const router = Router();
const syncService = new SyncService();
const settingsRepository = new SettingsRepository();
const upload = multer({ storage: multer.memoryStorage() });

async function getStoredWebhookApiKey(): Promise<string | null> {
  return settingsRepository.get("webhookApiKey");
}

function rejectMissingWebhookKey(res: Response): Response {
  logger.webhook.warn(
    {},
    "Webhook rejected: webhook API key not configured on server"
  );
  return res.status(503).json({ error: "Webhook authentication not ready" });
}

function rejectInvalidWebhookKey(
  res: Response,
  provided: boolean,
  stored: boolean
): Response {
  logger.webhook.warn(
    { hasApiKey: provided, hasStoredKey: stored },
    "Webhook rejected: Missing or invalid webhook API key"
  );
  return res.status(401).json({ error: "Invalid API key" });
}

router.post("/plex", upload.any(), async (req: Request, res: Response) => {
  try {
    const apiKey =
      typeof req.query.apiKey === "string" ? req.query.apiKey : undefined;
    const storedWebhookApiKey = await getStoredWebhookApiKey();

    if (!storedWebhookApiKey) {
      return rejectMissingWebhookKey(res);
    }

    if (!apiKey || !timingSafeStringEqual(apiKey, storedWebhookApiKey)) {
      return rejectInvalidWebhookKey(res, !!apiKey, !!storedWebhookApiKey);
    }

    let payload: PlexWebhookPayload;

    if (req.body && req.body.payload) {
      payload =
        typeof req.body.payload === "string"
          ? (JSON.parse(req.body.payload) as PlexWebhookPayload)
          : (req.body.payload as PlexWebhookPayload);
    } else {
      payload = req.body as PlexWebhookPayload;
    }

    const settings = await settingsRepository.getAll();
    const expectedMachineId = settings.plexServerMachineIdentifier?.trim();
    if (expectedMachineId) {
      const webhookServerUuid = payload.Server?.uuid?.trim();
      if (
        !webhookServerUuid ||
        !timingSafeStringEqual(webhookServerUuid, expectedMachineId)
      ) {
        logger.webhook.warn(
          {
            hasServerBlock: !!payload.Server,
            hasUuid: !!webhookServerUuid,
          },
          "Plex webhook rejected: Server UUID does not match configured Plex server"
        );
        return res.status(401).json({ error: "Invalid server identity" });
      }
    }

    const plexServerUrl = settings.plexServerUrl;
    const event = PlexWebhookParser.parse(payload, plexServerUrl);

    if (!event) {
      return res
        .status(200)
        .json({ success: true, message: "Event not supported" });
    }

    if (event.event === "scrobble") {
      logger.webhook.info(
        {
          eventType: event.event,
          mediaType: event.media.type,
          mediaTitle: event.media.title,
          userId: event.userId,
          source: "plex",
        },
        "Received Plex webhook"
      );
    }

    await syncService.syncEvent(event);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.webhook.error({ error, payload: req.body }, "Plex webhook error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/jellyfin", async (req: Request, res: Response) => {
  try {
    let payload: JellyfinWebhookPayload | Partial<JellyfinWebhookPayload> =
      req.body as JellyfinWebhookPayload;

    if (!payload || Object.keys(payload).length === 0) {
      const contentType = req.headers["content-type"] || "";

      if (typeof req.body === "string" && req.body.trim()) {
        try {
          payload = JSON.parse(req.body) as JellyfinWebhookPayload;
        } catch (parseError) {
          logger.webhook.error(
            { error: parseError, body: req.body, contentType },
            "Failed to parse Jellyfin webhook body as JSON"
          );
          return res.status(400).json({ error: "Invalid JSON payload" });
        }
      } else {
        const rawBody =
          (req as Request & { rawBody?: string }).rawBody || req.body;
        if (rawBody && typeof rawBody === "string") {
          try {
            payload = JSON.parse(rawBody) as JellyfinWebhookPayload;
          } catch (parseError) {
            logger.webhook.error(
              { error: parseError, rawBody, contentType },
              "Failed to parse Jellyfin webhook raw body"
            );
            return res.status(400).json({ error: "Invalid JSON payload" });
          }
        } else {
          logger.webhook.error(
            { body: req.body, contentType, headers: req.headers },
            "Jellyfin webhook body is empty or invalid"
          );
          return res.status(400).json({ error: "Empty or invalid payload" });
        }
      }
    }

    let apiKey =
      typeof req.headers["x-api-key"] === "string"
        ? req.headers["x-api-key"]
        : undefined;
    if (!apiKey) {
      const k = (payload as Record<string, unknown>).apiKey;
      apiKey = typeof k === "string" ? k : undefined;
    }

    const storedWebhookApiKey = await getStoredWebhookApiKey();
    if (!storedWebhookApiKey) {
      return rejectMissingWebhookKey(res);
    }

    if (!apiKey || !timingSafeStringEqual(apiKey, storedWebhookApiKey)) {
      return rejectInvalidWebhookKey(res, !!apiKey, !!storedWebhookApiKey);
    }

    const payloadWithApiKey = payload as Record<string, unknown>;
    if (payloadWithApiKey.apiKey) {
      delete payloadWithApiKey.apiKey;
    }

    const event = JellyfinWebhookParser.parse(
      payload as JellyfinWebhookPayload
    );

    if (!event) {
      return res
        .status(200)
        .json({ success: true, message: "Event not supported" });
    }

    if (event.event === "scrobble") {
      logger.webhook.info(
        {
          eventType: event.event,
          mediaType: event.media.type,
          mediaTitle: event.media.title,
          userId: event.userId,
          source: "jellyfin",
        },
        "Received Jellyfin webhook"
      );
    }

    await syncService.syncEvent(event);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.webhook.error(
      { error, payload: req.body },
      "Jellyfin webhook error"
    );
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/tautulli", async (req: Request, res: Response) => {
  try {
    const contentType = req.headers["content-type"] || "";
    let payload: TautulliWebhookPayload | Partial<TautulliWebhookPayload> =
      req.body as TautulliWebhookPayload;

    if (typeof req.body === "string") {
      if (req.body.trim()) {
        try {
          payload = JSON.parse(req.body) as TautulliWebhookPayload;
        } catch (parseError) {
          logger.webhook.error(
            {
              error: parseError,
              contentType,
              bodyLength: req.body.length,
            },
            "Failed to parse Tautulli webhook body as JSON"
          );
          return res.status(400).json({ error: "Invalid JSON payload" });
        }
      } else {
        payload = {};
      }
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      Object.keys(payload).length === 0
    ) {
      const rawBody =
        (req as Request & { rawBody?: string }).rawBody || req.body;
      if (rawBody && typeof rawBody === "string" && rawBody.trim()) {
        try {
          payload = JSON.parse(rawBody) as TautulliWebhookPayload;
        } catch (parseError) {
          logger.webhook.error(
            {
              error: parseError,
              contentType,
              bodyLength: rawBody.length,
            },
            "Failed to parse Tautulli webhook raw body"
          );
          return res.status(400).json({ error: "Invalid JSON payload" });
        }
      } else {
        logger.webhook.error(
          {
            contentType,
            bodyLength:
              typeof req.body === "string"
                ? req.body.length
                : typeof rawBody === "string"
                  ? rawBody.length
                  : undefined,
          },
          "Tautulli webhook body is empty or invalid"
        );
        return res.status(400).json({ error: "Empty or invalid payload" });
      }
    }

    let apiKey =
      typeof req.headers["x-api-key"] === "string"
        ? req.headers["x-api-key"]
        : undefined;
    if (!apiKey && typeof req.query.apiKey === "string") {
      apiKey = req.query.apiKey;
    }
    if (!apiKey) {
      const k = (payload as Record<string, unknown>).apiKey;
      apiKey = typeof k === "string" ? k : undefined;
    }

    const storedWebhookApiKey = await getStoredWebhookApiKey();
    if (!storedWebhookApiKey) {
      return rejectMissingWebhookKey(res);
    }

    if (!apiKey || !timingSafeStringEqual(apiKey, storedWebhookApiKey)) {
      return rejectInvalidWebhookKey(res, !!apiKey, !!storedWebhookApiKey);
    }

    const payloadWithApiKey = payload as Record<string, unknown>;
    if (payloadWithApiKey.apiKey) {
      delete payloadWithApiKey.apiKey;
    }

    const settings = await settingsRepository.getAll();
    const expectedMachineId = settings.plexServerMachineIdentifier?.trim();
    if (expectedMachineId) {
      const webhookServerUuid = TautulliWebhookParser.getServerMachineId(
        payload as TautulliWebhookPayload
      );
      if (
        !webhookServerUuid ||
        !timingSafeStringEqual(webhookServerUuid, expectedMachineId)
      ) {
        logger.webhook.warn(
          { hasMachineId: !!webhookServerUuid },
          "Tautulli webhook rejected: Server machine ID does not match configured Plex server"
        );
        return res.status(401).json({ error: "Invalid server identity" });
      }
    }

    const event = TautulliWebhookParser.parse(
      payload as TautulliWebhookPayload,
      settings.plexServerUrl
    );

    if (!event) {
      return res
        .status(200)
        .json({ success: true, message: "Event not supported" });
    }

    if (event.event === "scrobble") {
      logger.webhook.info(
        {
          eventType: event.event,
          mediaType: event.media.type,
          mediaTitle: event.media.title,
          userId: event.userId,
          source: "plex",
        },
        "Received Tautulli webhook"
      );
    }

    await syncService.syncEvent(event);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.webhook.error(
      { error, payload: req.body },
      "Tautulli webhook error"
    );
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as webhookRoutes };
