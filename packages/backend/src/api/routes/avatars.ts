import { JellyfinClient } from "@integrations/jellyfin/JellyfinClient";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { UserRepository } from "@repositories/UserRepository";
import { isPlexServerUrl } from "@scroblarr/shared";
import { logger } from "@utils/logger";
import { routeParam } from "@utils/routeParams";
import { Router, Request, Response } from "express";

import { auth } from "../middleware/auth";

const router = Router();
const settingsRepository = new SettingsRepository();
const userRepository = new UserRepository();

function canAccessUserAvatar(req: Request, targetUserId: string): boolean {
  if (req.apiKeyAuth) {
    return true;
  }
  const viewer = req.user;
  if (!viewer) {
    return false;
  }
  return viewer.isAdmin || viewer.id === targetUserId;
}

function parseAccessibleUserId(req: Request, res: Response): string | null {
  const userId = routeParam(req.params.userId);
  if (!userId) {
    res.status(400).json({ error: "Missing user id" });
    return null;
  }
  if (!canAccessUserAvatar(req, userId)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return userId;
}

async function sendImageResponse(
  res: Response,
  response: globalThis.Response
): Promise<Response> {
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const imageBuffer = await response.arrayBuffer();
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.send(Buffer.from(imageBuffer));
}

async function proxyRemoteThumb(
  res: Response,
  thumbUrl: string,
  provider: string
): Promise<Response> {
  try {
    const response = await fetch(thumbUrl, {
      headers: {
        Accept: "image/*",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch ${provider} avatar`,
      });
    }

    return await sendImageResponse(res, response);
  } catch (error) {
    logger.api.error({ error, thumbUrl }, `Error proxying ${provider} avatar`);
    return res
      .status(500)
      .json({ error: `Failed to fetch ${provider} avatar` });
  }
}

router.use(auth);

router.get("/jellyfin/:userId", async (req: Request, res: Response) => {
  try {
    const userId = parseAccessibleUserId(req, res);
    if (!userId) {
      return;
    }
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

    const jellyfinClient = new JellyfinClient(
      jellyfinHost,
      undefined,
      allSettings.mediaBrowserType === "emby" ? "emby" : "jellyfin"
    );
    const avatarUrl = `${jellyfinHost}/Users/${user.jellyfinUserId}/Images/Primary`;

    const response = await fetch(avatarUrl, {
      headers: {
        ...jellyfinClient.getAuthHeaders(jellyfinApiKey),
        Accept: "image/*",
      },
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "Failed to fetch avatar" });
    }

    return await sendImageResponse(res, response);
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
    const userId = parseAccessibleUserId(req, res);
    if (!userId) {
      return;
    }
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

      return await sendImageResponse(res, fetchResponse);
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
    const userId = parseAccessibleUserId(req, res);
    if (!userId) {
      return;
    }
    const user = await userRepository.findById(userId);

    if (!user || !user.traktThumb) {
      return res.status(404).json({ error: "User or Trakt avatar not found" });
    }

    return await proxyRemoteThumb(res, user.traktThumb, "Trakt");
  } catch (error) {
    logger.api.error({ error }, "Error fetching Trakt avatar");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/simkl/:userId", async (req: Request, res: Response) => {
  try {
    const userId = parseAccessibleUserId(req, res);
    if (!userId) {
      return;
    }
    const user = await userRepository.findById(userId);

    if (!user || !user.simklThumb) {
      return res.status(404).json({ error: "User or Simkl avatar not found" });
    }

    return await proxyRemoteThumb(res, user.simklThumb, "Simkl");
  } catch (error) {
    logger.api.error({ error }, "Error fetching Simkl avatar");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as avatarRoutes };
