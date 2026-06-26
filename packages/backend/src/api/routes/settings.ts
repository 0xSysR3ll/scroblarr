import {
  testTmdbAccessToken,
  toTmdbConnectionTestError,
} from "@integrations/tmdb/testTmdbAccess";
import { getTmdbAccessToken } from "@integrations/tmdb/tmdbConfig";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { logger } from "@utils/logger";
import { Router, Request, Response } from "express";
import { z } from "zod";

import { adminAuth } from "../middleware/adminAuth";

const router = Router();
const settingsRepository = new SettingsRepository();

const updateSettingsSchema = z.object({
  plexServerUrl: z.string().url().optional(),
  /** Plex Media Server machine identifier; must match webhook `Server.uuid` when set. Empty string clears it. */
  plexServerMachineIdentifier: z
    .union([z.string().min(1), z.literal("")])
    .optional(),
  syncHistoryLimit: z.number().int().min(10).max(10000).optional(),
  jellyfinHost: z.string().optional(),
  jellyfinPort: z.number().int().min(1).max(65535).optional(),
  jellyfinUseSsl: z.boolean().optional(),
  jellyfinUrlBase: z.string().optional(),
  jellyfinApiKey: z.string().optional(),
  apiKey: z.string().min(1).optional(),
  tmdbAccessToken: z.union([z.string().min(1), z.literal("")]).optional(),
});

const testTmdbSchema = z.object({
  tmdbAccessToken: z.string().min(1).optional(),
});

router.use(adminAuth);

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const settings = await settingsRepository.getAll();
    res.json(settings);
  } catch (error) {
    logger.api.error({ error }, "Error fetching settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = updateSettingsSchema.parse(req.body);

    if (validated.plexServerUrl !== undefined) {
      await settingsRepository.set("plexServerUrl", validated.plexServerUrl);
    }

    if (validated.plexServerMachineIdentifier !== undefined) {
      const mid = validated.plexServerMachineIdentifier.trim();
      if (mid === "") {
        await settingsRepository.delete("plexServerMachineIdentifier");
      } else {
        await settingsRepository.set("plexServerMachineIdentifier", mid);
      }
    }

    if (validated.syncHistoryLimit !== undefined) {
      await settingsRepository.set(
        "syncHistoryLimit",
        validated.syncHistoryLimit.toString()
      );
    }

    if (validated.jellyfinHost !== undefined) {
      await settingsRepository.set("jellyfinHost", validated.jellyfinHost);
    }

    if (validated.jellyfinPort !== undefined) {
      await settingsRepository.set(
        "jellyfinPort",
        validated.jellyfinPort.toString()
      );
    }

    if (validated.jellyfinUseSsl !== undefined) {
      await settingsRepository.set(
        "jellyfinUseSsl",
        validated.jellyfinUseSsl.toString()
      );
    }

    if (validated.jellyfinUrlBase !== undefined) {
      await settingsRepository.set(
        "jellyfinUrlBase",
        validated.jellyfinUrlBase
      );
    }

    if (validated.jellyfinApiKey !== undefined) {
      await settingsRepository.set(
        "jellyfinApiKey",
        validated.jellyfinApiKey.trim()
      );
    }

    if (validated.apiKey !== undefined) {
      await settingsRepository.set("apiKey", validated.apiKey.trim());
    }

    if (validated.tmdbAccessToken !== undefined) {
      const token = validated.tmdbAccessToken.trim();
      if (token === "") {
        await settingsRepository.delete("tmdbAccessToken");
      } else {
        await settingsRepository.set("tmdbAccessToken", token);
      }
    }

    const changedKeys = Object.keys(validated);
    logger.api.info(
      {
        changedSettings: changedKeys,
        updatedBy: req.user?.id,
      },
      "Settings updated"
    );

    const settings = await settingsRepository.getAll();
    res.json(settings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: "Validation error", details: error.issues });
      return;
    }
    logger.api.error({ error }, "Error updating settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/tmdb/test",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const validated = testTmdbSchema.parse(req.body ?? {});
      const settings = await settingsRepository.getAll();
      const accessToken =
        validated.tmdbAccessToken?.trim() || getTmdbAccessToken(settings);

      if (!accessToken) {
        res.status(400).json({
          success: false,
          message: "No TMDB access token configured",
        });
        return;
      }

      const result = await testTmdbAccessToken(accessToken);
      if (!result.success) {
        res.status(result.status).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation error", details: error.issues });
        return;
      }

      logger.api.error({ error }, "Error testing TMDB access token");
      const failure = toTmdbConnectionTestError(error);
      res.status(failure.status).json(failure);
    }
  }
);

router.delete("/plex", async (req: Request, res: Response): Promise<void> => {
  try {
    await settingsRepository.deleteMany([
      "plexServerUrl",
      "plexServerMachineIdentifier",
    ]);

    logger.api.info(
      {
        removedBy: req.user?.id,
      },
      "Plex server configuration removed"
    );

    const settings = await settingsRepository.getAll();
    res.json(settings);
  } catch (error) {
    logger.api.error({ error }, "Error removing Plex server configuration");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete(
  "/jellyfin",
  async (req: Request, res: Response): Promise<void> => {
    try {
      await settingsRepository.deleteMany([
        "jellyfinHost",
        "jellyfinPort",
        "jellyfinUseSsl",
        "jellyfinUrlBase",
        "jellyfinApiKey",
      ]);

      logger.api.info(
        {
          removedBy: req.user?.id,
        },
        "Jellyfin server configuration removed"
      );

      const settings = await settingsRepository.getAll();
      res.json(settings);
    } catch (error) {
      logger.api.error(
        { error },
        "Error removing Jellyfin server configuration"
      );
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export { router as settingsRoutes };
