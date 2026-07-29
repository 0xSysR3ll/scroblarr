import type { SyncHistory } from "@entities/SyncHistory";
import type { User } from "@entities/User";
import { JellyfinClient } from "@integrations/jellyfin/JellyfinClient";
import { TmdbRateLimitError } from "@integrations/tmdb/TmdbApiError";
import { TmdbClient } from "@integrations/tmdb/TmdbClient";
import { getTmdbAccessToken } from "@integrations/tmdb/tmdbConfig";
import type { SyncHistoryRepository } from "@repositories/SyncHistoryRepository";
import type { MediaItem } from "@scroblarr/shared";
import { isPlexServerUrl } from "@scroblarr/shared";
import { logger } from "@utils/logger";

import { MediaIdEnricher, needsMediaIdEnrichment } from "./MediaIdEnricher";

const POSTER_FETCH_TIMEOUT_MS = 10_000;
const TITLE_MISS_BACKOFF_MS = [
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  24 * 60 * 60_000,
] as const;
const RATE_LIMIT_BACKOFF_MS = 60 * 60_000;

type EnrichedIdFields = Pick<
  SyncHistory,
  | "tmdbMovieId"
  | "tmdbSeriesId"
  | "imdbMovieId"
  | "imdbEpisodeId"
  | "tvdbMovieId"
  | "tvdbEpisodeId"
>;

type EnrichmentAttempt =
  | { kind: "ids"; fields: EnrichedIdFields }
  | { kind: "miss"; attempts: number; nextRetryAt: number }
  | { kind: "rate_limited"; attempts: number; nextRetryAt: number };

/** In-process cache: reuse successful ID enrichment and back off failed title searches. */
const enrichmentAttempts = new Map<string, EnrichmentAttempt>();

export function clearPosterEnrichmentCache(): void {
  enrichmentAttempts.clear();
}

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

function hasExternalIds(syncHistory: SyncHistory): boolean {
  return Boolean(
    syncHistory.tmdbMovieId ||
    syncHistory.tmdbSeriesId ||
    syncHistory.imdbMovieId ||
    syncHistory.imdbEpisodeId ||
    syncHistory.tvdbMovieId ||
    syncHistory.tvdbEpisodeId
  );
}

function isEnrichmentCoolingDown(
  syncHistoryId: string,
  now = Date.now()
): boolean {
  const entry = enrichmentAttempts.get(syncHistoryId);
  if (!entry || entry.kind === "ids") {
    return false;
  }
  return now < entry.nextRetryAt;
}

export function hasPosterLookupData(syncHistory: SyncHistory): boolean {
  if (syncHistory.posterUrl || hasExternalIds(syncHistory)) {
    return true;
  }

  // Title alone can unlock a first TMDB attempt, but not while a prior miss
  // or rate-limit cooldown is active for this SyncHistory record.
  if (!syncHistory.mediaTitle) {
    return false;
  }

  return !isEnrichmentCoolingDown(syncHistory.id);
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
  constructor(
    private readonly syncHistoryRepository?: Pick<SyncHistoryRepository, "save">
  ) {}

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
      let lookup = this.applyCachedEnrichment(syncHistory);

      const mediaItem = toMediaItem(lookup);
      if (mediaItem && needsMediaIdEnrichment(mediaItem)) {
        if (isEnrichmentCoolingDown(syncHistory.id)) {
          return null;
        }

        const enriched = await new MediaIdEnricher(client).enrich(mediaItem);
        lookup = this.mergeEnrichedIds(lookup, enriched);

        if (hasExternalIds(lookup)) {
          this.rememberSuccessfulEnrichment(syncHistory.id, lookup);
          await this.persistEnrichedIds(syncHistory, lookup);
        } else {
          this.rememberFailedTitleSearch(syncHistory.id);
        }
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
        this.rememberRateLimit(syncHistory.id);
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

  private applyCachedEnrichment(syncHistory: SyncHistory): SyncHistory {
    const entry = enrichmentAttempts.get(syncHistory.id);
    if (!entry || entry.kind !== "ids") {
      return syncHistory;
    }

    return {
      ...syncHistory,
      tmdbMovieId: syncHistory.tmdbMovieId ?? entry.fields.tmdbMovieId,
      tmdbSeriesId: syncHistory.tmdbSeriesId ?? entry.fields.tmdbSeriesId,
      imdbMovieId: syncHistory.imdbMovieId ?? entry.fields.imdbMovieId,
      imdbEpisodeId: syncHistory.imdbEpisodeId ?? entry.fields.imdbEpisodeId,
      tvdbMovieId: syncHistory.tvdbMovieId ?? entry.fields.tvdbMovieId,
      tvdbEpisodeId: syncHistory.tvdbEpisodeId ?? entry.fields.tvdbEpisodeId,
    };
  }

  private mergeEnrichedIds(
    syncHistory: SyncHistory,
    enriched: MediaItem
  ): SyncHistory {
    return {
      ...syncHistory,
      tmdbMovieId: enriched.tmdbMovieId?.toString() ?? syncHistory.tmdbMovieId,
      tmdbSeriesId:
        enriched.tmdbSeriesId?.toString() ?? syncHistory.tmdbSeriesId,
      imdbMovieId: enriched.imdbMovieId ?? syncHistory.imdbMovieId,
      imdbEpisodeId: enriched.imdbEpisodeId ?? syncHistory.imdbEpisodeId,
      tvdbMovieId: enriched.tvdbMovieId?.toString() ?? syncHistory.tvdbMovieId,
      tvdbEpisodeId:
        enriched.tvdbEpisodeId?.toString() ?? syncHistory.tvdbEpisodeId,
    };
  }

  private rememberSuccessfulEnrichment(
    syncHistoryId: string,
    lookup: SyncHistory
  ): void {
    enrichmentAttempts.set(syncHistoryId, {
      kind: "ids",
      fields: {
        tmdbMovieId: lookup.tmdbMovieId,
        tmdbSeriesId: lookup.tmdbSeriesId,
        imdbMovieId: lookup.imdbMovieId,
        imdbEpisodeId: lookup.imdbEpisodeId,
        tvdbMovieId: lookup.tvdbMovieId,
        tvdbEpisodeId: lookup.tvdbEpisodeId,
      },
    });
  }

  private async persistEnrichedIds(
    syncHistory: SyncHistory,
    lookup: SyncHistory
  ): Promise<void> {
    if (!this.syncHistoryRepository) {
      return;
    }

    syncHistory.tmdbMovieId = lookup.tmdbMovieId;
    syncHistory.tmdbSeriesId = lookup.tmdbSeriesId;
    syncHistory.imdbMovieId = lookup.imdbMovieId;
    syncHistory.imdbEpisodeId = lookup.imdbEpisodeId;
    syncHistory.tvdbMovieId = lookup.tvdbMovieId;
    syncHistory.tvdbEpisodeId = lookup.tvdbEpisodeId;

    try {
      await this.syncHistoryRepository.save(syncHistory);
    } catch (error) {
      logger.api.warn(
        { error, syncHistoryId: syncHistory.id },
        "Failed to persist TMDB enrichment IDs from poster lookup"
      );
    }
  }

  private rememberFailedTitleSearch(syncHistoryId: string): void {
    const previous = enrichmentAttempts.get(syncHistoryId);
    const attempts =
      previous && previous.kind !== "ids" ? previous.attempts + 1 : 1;
    const backoffIndex = Math.min(
      attempts - 1,
      TITLE_MISS_BACKOFF_MS.length - 1
    );
    enrichmentAttempts.set(syncHistoryId, {
      kind: "miss",
      attempts,
      nextRetryAt: Date.now() + TITLE_MISS_BACKOFF_MS[backoffIndex]!,
    });
  }

  private rememberRateLimit(syncHistoryId: string): void {
    const previous = enrichmentAttempts.get(syncHistoryId);
    const attempts =
      previous && previous.kind !== "ids" ? previous.attempts + 1 : 1;
    enrichmentAttempts.set(syncHistoryId, {
      kind: "rate_limited",
      attempts,
      nextRetryAt: Date.now() + RATE_LIMIT_BACKOFF_MS * attempts,
    });
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
