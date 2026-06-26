import { auth } from "@middleware/auth";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { SyncHistoryRepository } from "@repositories/SyncHistoryRepository";
import {
  isPlexServerUrl,
  parseDestinationResultsFromHistory,
  parseDestinationResultsJson,
} from "@scroblarr/shared";
import { SyncService } from "@services/SyncService";
import { logger } from "@utils/logger";
import { routeParam } from "@utils/routeParams";
import { Router, Request, Response } from "express";

const router = Router();
const syncHistoryRepository = new SyncHistoryRepository();
const settingsRepository = new SettingsRepository();
const syncService = new SyncService();

async function retryHistoryItemForUser(
  id: string,
  userId: string
): Promise<{
  status: number;
  body: {
    id: string;
    success: boolean;
    destinations: string[];
    errorMessage?: string;
    error?: string;
  };
}> {
  const historyItem = await syncHistoryRepository.findById(id, userId);
  if (!historyItem) {
    return {
      status: 404,
      body: {
        id,
        success: false,
        destinations: [],
        error: "Sync history item not found",
      },
    };
  }

  if (historyItem.success && !historyItem.errorMessage) {
    return {
      status: 400,
      body: {
        id,
        success: false,
        destinations: [],
        error:
          "Only failed or partially failed sync history items can be retried",
      },
    };
  }

  if (historyItem.source !== "plex" && historyItem.source !== "jellyfin") {
    return {
      status: 400,
      body: {
        id,
        success: false,
        destinations: [],
        error: "Sync history item source cannot be retried",
      },
    };
  }

  if (
    historyItem.mediaType !== "episode" &&
    historyItem.mediaType !== "movie"
  ) {
    return {
      status: 400,
      body: {
        id,
        success: false,
        destinations: [],
        error: "Sync history item media type cannot be retried",
      },
    };
  }

  if (!historyItem.user) {
    return {
      status: 404,
      body: {
        id,
        success: false,
        destinations: [],
        error: "User not found",
      },
    };
  }

  const linkedMediaUser =
    historyItem.source === "jellyfin"
      ? historyItem.user.jellyfinUserId
      : historyItem.user.plexUsername;
  if (!linkedMediaUser) {
    return {
      status: 400,
      body: {
        id,
        success: false,
        destinations: [],
        error: "User is missing the linked media server account",
      },
    };
  }

  const result = await syncService.retryHistoryItem(historyItem);
  return {
    status: 200,
    body: {
      id,
      ...result,
    },
  };
}

router.get("/history", auth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const mediaType = req.query.mediaType as string | undefined;
    const success =
      req.query.success !== undefined
        ? req.query.success === "true"
        : undefined;
    const source = req.query.source as string | undefined;

    if (page < 1) {
      return res.status(400).json({ error: "Page must be greater than 0" });
    }
    if (pageSize < 1 || pageSize > 100) {
      return res
        .status(400)
        .json({ error: "Page size must be between 1 and 100" });
    }

    const filters: {
      mediaType?: string;
      success?: boolean;
      source?: string;
    } = {};
    if (mediaType && (mediaType === "episode" || mediaType === "movie")) {
      filters.mediaType = mediaType;
    }
    if (success !== undefined) {
      filters.success = success;
    }
    if (source && (source === "plex" || source === "jellyfin")) {
      filters.source = source;
    }

    const sortBy = (req.query.sortBy as string) || "syncedAt";
    const sortOrder = (req.query.sortOrder as "ASC" | "DESC") || "DESC";

    const { data: history, total } =
      await syncHistoryRepository.findByUserPaginated(
        user.id,
        page,
        pageSize,
        Object.keys(filters).length > 0 ? filters : undefined,
        sortBy,
        sortOrder
      );

    const historyWithUserInfo = history.map((item) => {
      let destinations: string[] | undefined;
      if (item.destinations) {
        try {
          destinations = JSON.parse(item.destinations);
        } catch {
          destinations = undefined;
        }
      }
      const destinationResults =
        parseDestinationResultsJson(item.destinationResults) ??
        (item.success ? parseDestinationResultsFromHistory(item) : undefined);
      return {
        id: item.id,
        userId: item.userId,
        username: item.user.displayName || item.user.plexUsername,
        mediaType: item.mediaType,
        mediaTitle: item.mediaTitle,
        source: item.source,
        originalMediaId: item.originalMediaId,
        tvdbEpisodeId: item.tvdbEpisodeId,
        tvdbMovieId: item.tvdbMovieId,
        imdbMovieId: item.imdbMovieId,
        imdbEpisodeId: item.imdbEpisodeId,
        tmdbMovieId: item.tmdbMovieId,
        tmdbSeriesId: item.tmdbSeriesId,
        posterUrl: item.posterUrl,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        year: item.year,
        success: item.success,
        errorMessage: item.errorMessage,
        wasRewatched: item.wasRewatched,
        destinations,
        destinationResults,
        syncedAt: item.syncedAt,
        retriedAt: item.retriedAt,
      };
    });

    return res.json({
      data: historyWithUserInfo,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.api.error({ error }, "Error fetching sync history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/history", auth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const ids = req.body.ids as string[] | undefined;

    if (ids && Array.isArray(ids) && ids.length > 0) {
      const deleted = await syncHistoryRepository.deleteByIds(ids, user.id);
      return res.json({ success: true, deleted });
    } else {
      await syncHistoryRepository.clearByUser(user.id);
      return res.json({ success: true });
    }
  } catch (error) {
    logger.api.error({ error }, "Error deleting sync history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/history/:id/retry", auth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Missing id" });
    }

    const result = await retryHistoryItemForUser(id, user.id);
    if (result.status !== 200) {
      return res.status(result.status).json({ error: result.body.error });
    }
    return res.json(result.body);
  } catch (error) {
    logger.api.error({ error }, "Error retrying sync history item");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/history/retry", auth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const ids = req.body.ids as string[] | undefined;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "At least one id is required" });
    }
    if (ids.length > 100) {
      return res
        .status(400)
        .json({ error: "Cannot retry more than 100 items" });
    }

    const uniqueIds = [...new Set(ids.filter((id) => typeof id === "string"))];
    if (uniqueIds.length === 0) {
      return res.status(400).json({ error: "At least one id is required" });
    }

    const results = [];
    for (const id of uniqueIds) {
      const result = await retryHistoryItemForUser(id, user.id);
      results.push(result.body);
    }

    const retried = results.filter((result) => result.success).length;
    const failed = results.length - retried;

    return res.json({
      success: retried > 0,
      retried,
      failed,
      results,
    });
  } catch (error) {
    logger.api.error({ error }, "Error bulk retrying sync history items");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/history/:id", auth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Missing id" });
    }

    const deleted = await syncHistoryRepository.deleteById(id, user.id);
    if (!deleted) {
      return res.status(404).json({ error: "Sync history item not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    logger.api.error({ error }, "Error deleting sync history item");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/statistics", auth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const statistics = await syncHistoryRepository.getStatisticsByUser(user.id);
    return res.json(statistics);
  } catch (error) {
    logger.api.error({ error }, "Error fetching sync statistics");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/poster/:id", auth, async (req: Request, res: Response) => {
  try {
    const viewer = req.user;
    if (!viewer) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Missing id" });
    }
    const syncHistory = await syncHistoryRepository.findById(id);

    if (!syncHistory) {
      return res.status(404).json({ error: "Sync history item not found" });
    }

    const canAccess =
      req.apiKeyAuth || viewer.isAdmin || syncHistory.userId === viewer.id;
    if (!canAccess) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!syncHistory.posterUrl) {
      return res.status(404).json({ error: "No poster URL available" });
    }

    const user = syncHistory.user;
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const posterUrl = syncHistory.posterUrl;

    if (isPlexServerUrl(posterUrl)) {
      if (!user.plexAccessToken) {
        return res.status(403).json({
          error: "Plex authentication required",
        });
      }

      try {
        const settings = await settingsRepository.getAll();
        if (!settings.plexServerUrl) {
          return res.status(500).json({
            error: "Plex server not configured",
          });
        }

        const url = new URL(posterUrl);
        const thumbPath = url.pathname;

        const serverUrl = settings.plexServerUrl.replace(/\/$/, "");
        const imageUrl = `${serverUrl}${thumbPath}`;

        const response = await fetch(imageUrl, {
          headers: {
            "X-Plex-Token": user.plexAccessToken,
          },
        });

        if (!response.ok) {
          return res.status(response.status).json({
            error: "Failed to fetch poster image",
          });
        }

        const contentType =
          response.headers.get("content-type") || "image/jpeg";
        const imageBuffer = await response.arrayBuffer();

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(Buffer.from(imageBuffer));
      } catch (error) {
        logger.api.error({ error, posterUrl }, "Error proxying Plex poster");
        return res.status(500).json({ error: "Failed to fetch poster image" });
      }
    }

    if (syncHistory.source === "jellyfin") {
      if (!user.jellyfinAccessToken) {
        return res.status(403).json({
          error: "Jellyfin authentication required",
        });
      }

      try {
        const settings = await settingsRepository.getAll();
        if (!settings.jellyfinHost) {
          return res.status(500).json({
            error: "Jellyfin server not configured",
          });
        }

        const { JellyfinClient } =
          await import("@integrations/jellyfin/JellyfinClient");
        const jellyfinClient = new JellyfinClient(settings.jellyfinHost);

        const { buffer, contentType } = await jellyfinClient.fetchImage(
          user.jellyfinAccessToken,
          posterUrl
        );

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(Buffer.from(buffer));
      } catch (error) {
        logger.api.error(
          { error, posterUrl },
          "Error proxying Jellyfin poster"
        );
        return res.status(500).json({ error: "Failed to fetch poster image" });
      }
    }

    try {
      const response = await fetch(posterUrl, {
        headers: { Accept: "image/*" },
      });
      if (!response.ok) {
        return res.status(response.status).json({
          error: "Failed to fetch poster image",
        });
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const imageBuffer = await response.arrayBuffer();

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(Buffer.from(imageBuffer));
    } catch (error) {
      logger.api.error({ error, posterUrl }, "Error proxying generic poster");
      return res.status(500).json({ error: "Failed to fetch poster image" });
    }
  } catch (error) {
    logger.api.error({ error }, "Error fetching poster");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as syncRoutes };
