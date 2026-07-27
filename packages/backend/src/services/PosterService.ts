import type { SyncHistory } from "@entities/SyncHistory";
import type { User } from "@entities/User";
import { JellyfinClient } from "@integrations/jellyfin/JellyfinClient";
import { TmdbRateLimitError } from "@integrations/tmdb/TmdbApiError";
import { TmdbClient } from "@integrations/tmdb/TmdbClient";
import { getTmdbAccessToken } from "@integrations/tmdb/tmdbConfig";
import type { MediaItem } from "@scroblarr/shared";
import { isPlexServerUrl } from "@scroblarr/shared";
import { logger } from "@utils/logger";

import { MediaIdEnricher } from "./MediaIdEnricher";

const POSTER_FETCH_TIMEOUT_MS = 10_000;

function posterFetchSignal(): AbortSignal {
  return AbortSignal.timeout(POSTER_FETCH_TIMEOUT_MS);
}

export interface PosterFetchSuccess {
  buffer: Buffer;
  contentType: string;
}

export interface PosterFetchError {
  status: number;
  message: string;
}

export type PosterFetchResult = PosterFetchSuccess | PosterFetchError;

export function hasPosterLookupData(syncHistory: SyncHistory): boolean {
  return Boolean(
    syncHistory.posterUrl ||
    syncHistory.tmdbMovieId ||
    syncHistory.tmdbSeriesId ||
    syncHistory.imdbMovieId ||
    syncHistory.imdbEpisodeId ||
    syncHistory.tvdbMovieId ||
    syncHistory.tvdbEpisodeId ||
    syncHistory.mediaTitle
  );
}

function isPosterFetchSuccess(
  result: PosterFetchResult
): result is PosterFetchSuccess {
  return !("message" in result);
}

function toMediaItem(syncHistory: SyncHistory): MediaItem | null {
  if (syncHistory.mediaType === "movie") {
    return {
      id: syncHistory.originalMediaId || syncHistory.id,
      type: "movie",
      title: syncHistory.mediaTitle,
      year: syncHistory.year,
      tmdbMovieId: syncHistory.tmdbMovieId
        ? Number(syncHistory.tmdbMovieId)
        : undefined,
      imdbMovieId: syncHistory.imdbMovieId,
      tvdbMovieId: syncHistory.tvdbMovieId
        ? Number(syncHistory.tvdbMovieId)
        : undefined,
      posterUrl: syncHistory.posterUrl,
    };
  }

  if (syncHistory.mediaType === "episode") {
    return {
      id: syncHistory.originalMediaId || syncHistory.id,
      type: "episode",
      title: syncHistory.mediaTitle,
      year: syncHistory.year,
      seasonNumber: syncHistory.seasonNumber,
      episodeNumber: syncHistory.episodeNumber,
      tmdbSeriesId: syncHistory.tmdbSeriesId
        ? Number(syncHistory.tmdbSeriesId)
        : undefined,
      imdbEpisodeId: syncHistory.imdbEpisodeId,
      tvdbEpisodeId: syncHistory.tvdbEpisodeId
        ? Number(syncHistory.tvdbEpisodeId)
        : undefined,
      posterUrl: syncHistory.posterUrl,
    };
  }

  return null;
}

export class PosterService {
  async fetchPoster(
    syncHistory: SyncHistory,
    user: User,
    settings: Record<string, string | undefined>
  ): Promise<PosterFetchResult> {
    const posterUrl = syncHistory.posterUrl;
    let mediaServerResult: PosterFetchResult | undefined;

    if (posterUrl) {
      if (isPlexServerUrl(posterUrl)) {
        mediaServerResult = await this.fetchFromPlex(posterUrl, user, settings);
      } else if (syncHistory.source === "jellyfin") {
        mediaServerResult = await this.fetchFromJellyfin(
          posterUrl,
          user,
          settings
        );
      } else {
        mediaServerResult = await this.fetchFromUrl(posterUrl);
      }

      if (isPosterFetchSuccess(mediaServerResult)) {
        return mediaServerResult;
      }
    }

    const tmdbToken = getTmdbAccessToken(settings);
    if (tmdbToken) {
      const tmdbResult = await this.fetchFromTmdb(syncHistory, tmdbToken);
      if (tmdbResult) {
        return tmdbResult;
      }
    }

    if (mediaServerResult) {
      return mediaServerResult;
    }

    return {
      status: 404,
      message: "No poster available",
    };
  }

  private async fetchFromTmdb(
    syncHistory: SyncHistory,
    accessToken: string
  ): Promise<PosterFetchSuccess | null> {
    try {
      const client = new TmdbClient(accessToken);
      let lookup = syncHistory;

      const mediaItem = toMediaItem(syncHistory);
      if (mediaItem) {
        const enriched = await new MediaIdEnricher(client).enrich(mediaItem);
        lookup = {
          ...syncHistory,
          tmdbMovieId:
            enriched.tmdbMovieId?.toString() ?? syncHistory.tmdbMovieId,
          tmdbSeriesId:
            enriched.tmdbSeriesId?.toString() ?? syncHistory.tmdbSeriesId,
          imdbMovieId: enriched.imdbMovieId ?? syncHistory.imdbMovieId,
          imdbEpisodeId: enriched.imdbEpisodeId ?? syncHistory.imdbEpisodeId,
          tvdbMovieId:
            enriched.tvdbMovieId?.toString() ?? syncHistory.tvdbMovieId,
          tvdbEpisodeId:
            enriched.tvdbEpisodeId?.toString() ?? syncHistory.tvdbEpisodeId,
        };
      }

      const posterPath = await client.resolvePosterPath(lookup);
      if (!posterPath) {
        return null;
      }

      const { buffer, contentType } = await client.fetchPosterImage(posterPath);
      return {
        buffer: Buffer.from(buffer),
        contentType,
      };
    } catch (error) {
      if (error instanceof TmdbRateLimitError) {
        logger.api.warn(
          { syncHistoryId: syncHistory.id },
          "TMDB rate limit hit while resolving poster"
        );
      } else {
        logger.api.warn(
          { error, syncHistoryId: syncHistory.id },
          "TMDB poster lookup failed"
        );
      }
      return null;
    }
  }

  private async fetchFromPlex(
    posterUrl: string,
    user: User,
    settings: Record<string, string | undefined>
  ): Promise<PosterFetchResult> {
    if (!user.plexAccessToken) {
      return {
        status: 403,
        message: "Plex authentication required",
      };
    }

    if (!settings.plexServerUrl) {
      return {
        status: 500,
        message: "Plex server not configured",
      };
    }

    try {
      const url = new URL(posterUrl);
      const thumbPath = url.pathname;
      const serverUrl = settings.plexServerUrl.replace(/\/$/, "");
      const imageUrl = `${serverUrl}${thumbPath}`;

      const response = await fetch(imageUrl, {
        headers: {
          "X-Plex-Token": user.plexAccessToken,
        },
        signal: posterFetchSignal(),
      });

      if (!response.ok) {
        return {
          status: response.status,
          message: "Failed to fetch poster image",
        };
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const imageBuffer = await response.arrayBuffer();
      return {
        buffer: Buffer.from(imageBuffer),
        contentType,
      };
    } catch (error) {
      logger.api.error({ error, posterUrl }, "Error proxying Plex poster");
      return {
        status: 500,
        message: "Failed to fetch poster image",
      };
    }
  }

  private async fetchFromJellyfin(
    posterUrl: string,
    user: User,
    settings: Record<string, string | undefined>
  ): Promise<PosterFetchResult> {
    if (!user.jellyfinAccessToken) {
      return {
        status: 403,
        message: "Jellyfin authentication required",
      };
    }

    if (!settings.jellyfinHost) {
      return {
        status: 500,
        message: "Jellyfin server not configured",
      };
    }

    try {
      const jellyfinClient = new JellyfinClient(settings.jellyfinHost);
      const { buffer, contentType } = await jellyfinClient.fetchImage(
        user.jellyfinAccessToken,
        posterUrl,
        posterFetchSignal()
      );

      return {
        buffer: Buffer.from(buffer),
        contentType,
      };
    } catch (error) {
      logger.api.error({ error, posterUrl }, "Error proxying Jellyfin poster");
      return {
        status: 500,
        message: "Failed to fetch poster image",
      };
    }
  }

  private async fetchFromUrl(posterUrl: string): Promise<PosterFetchResult> {
    try {
      const response = await fetch(posterUrl, {
        headers: { Accept: "image/*" },
        signal: posterFetchSignal(),
      });

      if (!response.ok) {
        return {
          status: response.status,
          message: "Failed to fetch poster image",
        };
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const imageBuffer = await response.arrayBuffer();
      return {
        buffer: Buffer.from(imageBuffer),
        contentType,
      };
    } catch (error) {
      logger.api.error({ error, posterUrl }, "Error proxying generic poster");
      return {
        status: 500,
        message: "Failed to fetch poster image",
      };
    }
  }
}
