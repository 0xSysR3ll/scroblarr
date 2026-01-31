import { Router, Request, Response } from "express";
import multer from "multer";
import {
  PlexWebhookParser,
  PlexWebhookPayload,
} from "@integrations/plex/PlexWebhookParser";
import {
  JellyfinWebhookParser,
  JellyfinWebhookPayload,
} from "@integrations/jellyfin/JellyfinWebhookParser";
import { SyncService } from "@services/SyncService";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { logger } from "@utils/logger";

const router = Router();
const syncService = new SyncService();
const settingsRepository = new SettingsRepository();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/plex", upload.any(), async (req: Request, res: Response) => {
  try {
    const apiKey = req.query.apiKey as string | undefined;
    const storedApiKey = await settingsRepository.get("apiKey");

    if (apiKey && storedApiKey) {
      if (apiKey !== storedApiKey) {
        logger.webhook.warn(
          { hasApiKey: !!apiKey, hasStoredKey: !!storedApiKey },
          "Plex webhook rejected: Invalid API key"
        );
        return res.status(401).json({ error: "Invalid API key" });
      }
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

    const apiKeyFromHeader = req.headers["x-api-key"] as string | undefined;
    let apiKey = apiKeyFromHeader;

    if (!apiKey) {
      const payloadWithApiKey = payload as Record<string, unknown>;
      const bodyApiKey = payloadWithApiKey?.apiKey as string | undefined;
      apiKey = bodyApiKey;
    }

    if (apiKey) {
      const storedApiKey = await settingsRepository.get("apiKey");
      if (storedApiKey && apiKey !== storedApiKey) {
        logger.webhook.warn(
          { hasApiKey: !!apiKey, hasStoredKey: !!storedApiKey },
          "Jellyfin webhook rejected: Invalid API key"
        );
        return res.status(401).json({ error: "Invalid API key" });
      }

      const payloadWithApiKey = payload as Record<string, unknown>;
      if (payloadWithApiKey.apiKey) {
        delete payloadWithApiKey.apiKey;
      }
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

export { router as webhookRoutes };
