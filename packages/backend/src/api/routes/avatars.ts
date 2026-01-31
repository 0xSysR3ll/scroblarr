import { Router, Request, Response } from "express";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { UserRepository } from "@repositories/UserRepository";
import { JellyfinClient } from "@integrations/jellyfin/JellyfinClient";
import { isPlexServerUrl } from "@scroblarr/shared";
import { logger } from "@utils/logger";

const router = Router();
const settingsRepository = new SettingsRepository();
const userRepository = new UserRepository();

router.get("/jellyfin/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await userRepository.findById(userId);

    if (!user || !user.jellyfinThumb || !user.jellyfinUserId) {
      return res
        .status(404)
        .json({ error: "User or Jellyfin avatar not found" });
    }

    const allSettings = await settingsRepository.getAll();
    const jellyfinHost = allSettings.jellyfinHost;
    const jellyfinApiKey = allSettings.jellyfinApiKey;

    if (!jellyfinHost || !jellyfinApiKey) {
      return res.status(503).json({ error: "Jellyfin not configured" });
    }

    const jellyfinClient = new JellyfinClient(jellyfinHost);
    const avatarUrl = `${jellyfinHost}/Users/${user.jellyfinUserId}/Images/Primary`;

    const response = await fetch(avatarUrl, {
      headers: {
        Authorization: jellyfinClient.getAuthHeader(jellyfinApiKey),
        Accept: "image/*",
      },
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "Failed to fetch avatar" });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(Buffer.from(imageBuffer));
  } catch (error) {
    logger.api.error(
      { error, userId: req.params.userId },
      "Error proxying Jellyfin avatar"
    );
    return res.status(500).json({ error: "Failed to proxy avatar" });
  }
});

router.get("/plex/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await userRepository.findById(userId);

    if (!user || !user.plexThumb) {
      return res.status(404).json({ error: "User or Plex avatar not found" });
    }

    const thumbUrl = user.plexThumb;

    try {
      let fetchResponse: globalThis.Response;
      const headers: Record<string, string> = {
        Accept: "image/*",
      };

      if (isPlexServerUrl(thumbUrl)) {
        if (!user.plexAccessToken) {
          return res
            .status(403)
            .json({ error: "Plex authentication required" });
        }

        const settings = await settingsRepository.getAll();
        if (!settings.plexServerUrl) {
          return res.status(500).json({ error: "Plex server not configured" });
        }

        const url = new URL(thumbUrl);
        const thumbPath = url.pathname;

        const serverUrl = settings.plexServerUrl.replace(/\/$/, "");
        const imageUrl = `${serverUrl}${thumbPath}`;

        fetchResponse = await fetch(imageUrl, {
          headers: {
            ...headers,
            "X-Plex-Token": user.plexAccessToken,
          },
        });
      } else {
        fetchResponse = await fetch(thumbUrl, {
          headers,
        });
      }

      if (!fetchResponse.ok) {
        return res.status(fetchResponse.status).json({
          error: "Failed to fetch Plex avatar",
        });
      }

      const contentType =
        fetchResponse.headers.get("content-type") || "image/jpeg";
      const imageBuffer = await fetchResponse.arrayBuffer();

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(Buffer.from(imageBuffer));
    } catch (error) {
      logger.api.error({ error, thumbUrl }, "Error proxying Plex avatar");
      return res.status(500).json({ error: "Failed to fetch Plex avatar" });
    }
  } catch (error) {
    logger.api.error({ error }, "Error fetching Plex avatar");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/trakt/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await userRepository.findById(userId);

    if (!user || !user.traktThumb) {
      return res.status(404).json({ error: "User or Trakt avatar not found" });
    }

    try {
      const response = await fetch(user.traktThumb, {
        headers: {
          Accept: "image/*",
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: "Failed to fetch Trakt avatar",
        });
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const imageBuffer = await response.arrayBuffer();

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(Buffer.from(imageBuffer));
    } catch (error) {
      logger.api.error(
        { error, thumbUrl: user.traktThumb },
        "Error proxying Trakt avatar"
      );
      return res.status(500).json({ error: "Failed to fetch Trakt avatar" });
    }
  } catch (error) {
    logger.api.error({ error }, "Error fetching Trakt avatar");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tvtime/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await userRepository.findById(userId);

    if (!user || !user.tvtimeThumb) {
      return res.status(404).json({ error: "User or TVTime avatar not found" });
    }

    try {
      const response = await fetch(user.tvtimeThumb, {
        headers: {
          Accept: "image/*",
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: "Failed to fetch TVTime avatar",
        });
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const imageBuffer = await response.arrayBuffer();

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(Buffer.from(imageBuffer));
    } catch (error) {
      logger.api.error(
        { error, thumbUrl: user.tvtimeThumb },
        "Error proxying TVTime avatar"
      );
      return res.status(500).json({ error: "Failed to fetch TVTime avatar" });
    }
  } catch (error) {
    logger.api.error({ error }, "Error fetching TVTime avatar");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as avatarRoutes };
