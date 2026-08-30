import { SyncHistory } from "@entities/SyncHistory";
import { User } from "@entities/User";
import { isBingersAuthError } from "@integrations/bingers/BingersApiError";
import { BingersClient } from "@integrations/bingers/BingersClient";
import { BingersSessionManager } from "@integrations/bingers/BingersSessionManager";
import { cookieHeaderFromJar } from "@integrations/bingers/cookieJar";
import { ISyncClient, SyncOptions } from "@integrations/common/ISyncClient";
import { SimklClient } from "@integrations/simkl/SimklClient";
import { SimklTokenManager } from "@integrations/simkl/SimklTokenManager";
import { TmdbClient } from "@integrations/tmdb/TmdbClient";
import { getTmdbAccessToken } from "@integrations/tmdb/tmdbConfig";
import { isTraktAuthError } from "@integrations/trakt/TraktApiError";
import { TraktClient } from "@integrations/trakt/TraktClient";
import { TraktTokenManager } from "@integrations/trakt/TraktTokenManager";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { SyncHistoryRepository } from "@repositories/SyncHistoryRepository";
import { UserRepository } from "@repositories/UserRepository";
import { MediaEvent, serializeDestinationResults } from "@scroblarr/shared";
import { logger } from "@utils/logger";

import { MediaIdEnricher, needsMediaIdEnrichment } from "./MediaIdEnricher";
import {
  buildAttemptResult,
  buildGlobalFailureResult,
  getRetryDestinationNamesFromHistory,
  mergeRetryAttemptIntoHistory,
  type SyncAttemptResult,
} from "./syncHistoryDestinationResults";

export type { SyncAttemptResult };

interface SyncDestination {
  name: string;
  client: ISyncClient;
  hasToken: (user: User) => boolean;
  getAccessToken: (user: User) => Promise<string>;
  refreshAccessToken?: (user: User) => Promise<string>;
  getSyncOptions?: (user: User, hasExistingSync: boolean) => SyncOptions;
}

interface SyncEventForUserOptions {
  saveFailedHistory?: boolean;
  destinationNames?: string[];
}

export class SyncService {
  private userRepository: UserRepository;
  private syncHistoryRepository: SyncHistoryRepository;
  private settingsRepository: SettingsRepository;
  private traktTokenManager: TraktTokenManager;
  private simklTokenManager: SimklTokenManager;
  private bingersSessionManager: BingersSessionManager;
  constructor() {
    this.userRepository = new UserRepository();
    this.syncHistoryRepository = new SyncHistoryRepository();
    this.settingsRepository = new SettingsRepository();
    this.traktTokenManager = new TraktTokenManager();
    this.simklTokenManager = new SimklTokenManager();
    this.bingersSessionManager = new BingersSessionManager();
  }

  private async getSyncDestinations(user: User): Promise<SyncDestination[]> {
    const destinations: SyncDestination[] = [];

    if (user.traktClientId && user.traktClientSecret && user.traktAccessToken) {
      try {
        const traktClient = new TraktClient(user.traktClientId);
        destinations.push({
          name: "Trakt",
          client: traktClient,
          hasToken: (u) => !!u.traktAccessToken,
          getAccessToken: async (u) => {
            return await this.traktTokenManager.getValidAccessToken(u.id);
          },
          refreshAccessToken: async (u) => {
            return await this.traktTokenManager.refreshAccessToken(u.id);
          },
        });
      } catch (error) {
        logger.sync.warn(
          { error, userId: user.id },
          "Failed to add Trakt sync destination for user"
        );
      }
    }

    if (user.simklClientId && user.simklAccessToken) {
      try {
        const simklClient = new SimklClient(user.simklClientId);
        destinations.push({
          name: "Simkl",
          client: simklClient,
          hasToken: (u) => !!u.simklAccessToken,
          getAccessToken: async (u) => {
            return await this.simklTokenManager.getValidAccessToken(u.id);
          },
        });
      } catch (error) {
        logger.sync.warn(
          { error, userId: user.id },
          "Failed to add Simkl sync destination for user"
        );
      }
    }

    if (user.bingersCookieJar) {
      try {
        destinations.push({
          name: "Bingers",
          client: new BingersClient(),
          hasToken: (u) => !!u.bingersCookieJar,
          getAccessToken: async (u) => {
            const jar = await this.bingersSessionManager.getValidCookieJar(
              u.id
            );
            return cookieHeaderFromJar(jar);
          },
          refreshAccessToken: async (u) => {
            const jar = await this.bingersSessionManager.getValidCookieJar(
              u.id
            );
            return cookieHeaderFromJar(jar);
          },
        });
      } catch (error) {
        logger.sync.warn(
          { error, userId: user.id },
          "Failed to add Bingers sync destination for user"
        );
      }
    }

    return destinations;
  }

  async syncEvent(event: MediaEvent): Promise<void> {
    if (event.event !== "scrobble") {
      return;
    }

    if (event.media.type !== "episode" && event.media.type !== "movie") {
      return;
    }

    let user: User | null;
    if (event.source === "jellyfin") {
      user = await this.userRepository.findByJellyfinUserId(event.userId);
    } else {
      user = await this.userRepository.findBySourceUsername(
        event.source,
        event.userId
      );
    }

    if (!user) {
      logger.sync.error(
        {
          source: event.source,
          userId: event.userId,
          mediaType: event.media.type,
          mediaTitle: event.media.title,
        },
        "User not found for sync event - configuration issue"
      );
      return;
    }

    await this.syncEventForUser(user, event);
  }

  async retryHistoryItem(historyItem: SyncHistory): Promise<SyncAttemptResult> {
    const user = historyItem.user;
    const source = historyItem.source;
    const mediaType = historyItem.mediaType;

    if (!user) {
      throw new Error("User not found for sync history item");
    }

    if (source !== "plex" && source !== "jellyfin") {
      throw new Error("Sync history item source cannot be retried");
    }

    if (mediaType !== "episode" && mediaType !== "movie") {
      throw new Error("Sync history item media type cannot be retried");
    }

    const sourceUserId =
      source === "jellyfin" ? user.jellyfinUserId : user.plexUsername;
    if (!sourceUserId) {
      throw new Error("User is missing the linked media server account");
    }

    const retryEvent: MediaEvent = {
      event: "scrobble",
      source,
      userId: sourceUserId,
      timestamp: this.getRetryTimestamp(historyItem),
      media: {
        id: this.getRetryMediaId(historyItem),
        type: mediaType,
        title: historyItem.mediaTitle,
        seasonNumber: historyItem.seasonNumber,
        episodeNumber: historyItem.episodeNumber,
        year: historyItem.year,
        tvdbEpisodeId: this.parseOptionalNumber(historyItem.tvdbEpisodeId),
        tvdbMovieId: this.parseOptionalNumber(historyItem.tvdbMovieId),
        imdbMovieId: historyItem.imdbMovieId,
        imdbEpisodeId: historyItem.imdbEpisodeId,
        tmdbMovieId: this.parseOptionalNumber(historyItem.tmdbMovieId),
        tmdbSeriesId: this.parseOptionalNumber(historyItem.tmdbSeriesId),
        posterUrl: historyItem.posterUrl,
      },
    };

    const result = await this.syncEventForUser(user, retryEvent, {
      saveFailedHistory: false,
      destinationNames: getRetryDestinationNamesFromHistory(historyItem),
    });

    if (result.success) {
      mergeRetryAttemptIntoHistory(historyItem, result.destinationResults);
      historyItem.retriedAt = new Date();
      await this.syncHistoryRepository.save(historyItem);
    }

    return result;
  }

  private getRetryTimestamp(historyItem: SyncHistory): Date {
    if (!historyItem.syncedAt) {
      return new Date();
    }

    const timestamp = new Date(historyItem.syncedAt);
    return Number.isFinite(timestamp.getTime()) ? timestamp : new Date();
  }

  private parseOptionalNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private getRetryMediaId(historyItem: SyncHistory): string {
    const mediaId =
      historyItem.originalMediaId ||
      historyItem.tvdbEpisodeId ||
      historyItem.tvdbMovieId ||
      historyItem.imdbEpisodeId ||
      historyItem.imdbMovieId;

    if (!mediaId) {
      throw new Error("Sync history item original media id is unavailable");
    }

    return mediaId;
  }

  private async syncEventForUser(
    user: User,
    event: MediaEvent,
    options: SyncEventForUserOptions = {}
  ): Promise<SyncAttemptResult> {
    const saveFailedHistory = options.saveFailedHistory ?? true;

    if (!user.enabled) {
      logger.sync.warn(
        {
          userId: user.id,
          username:
            event.source === "plex" ? user.plexUsername : user.jellyfinUsername,
          mediaType: event.media.type,
          mediaTitle: event.media.title,
        },
        "User is disabled, skipping sync"
      );
      if (saveFailedHistory) {
        const failureResult = buildGlobalFailureResult(
          "User account is disabled"
        );
        await this.saveSyncHistory(user.id, event, failureResult, false);
      }
      return buildGlobalFailureResult("User account is disabled");
    }

    const syncDestinations = await this.getSyncDestinations(user);

    const targetDestinationNames = options.destinationNames;
    const availableDestinations = syncDestinations.filter((dest) => {
      if (
        targetDestinationNames &&
        !targetDestinationNames.includes(dest.name)
      ) {
        return false;
      }

      return dest.hasToken(user);
    });

    if (availableDestinations.length === 0) {
      logger.sync.warn(
        {
          userId: user.id,
          username:
            event.source === "plex" ? user.plexUsername : user.jellyfinUsername,
          mediaType: event.media.type,
          mediaTitle: event.media.title,
        },
        "User has no sync destinations configured, skipping sync"
      );
      if (saveFailedHistory) {
        const failureResult = buildGlobalFailureResult(
          "No sync destinations configured"
        );
        await this.saveSyncHistory(user.id, event, failureResult, false);
      }
      return buildGlobalFailureResult("No sync destinations configured");
    }

    const userIdentifier =
      event.source === "plex" ? user.plexUsername : user.jellyfinUsername;

    event = await this.enrichMediaIds(event);

    const mediaIdentifiers = {
      tvdbEpisodeId: event.media.tvdbEpisodeId?.toString(),
      tvdbMovieId: event.media.tvdbMovieId?.toString(),
      imdbMovieId: event.media.imdbMovieId,
      imdbEpisodeId: event.media.imdbEpisodeId,
      tmdbMovieId: event.media.tmdbMovieId?.toString(),
      tmdbSeriesId: event.media.tmdbSeriesId?.toString(),
      seasonNumber: event.media.seasonNumber,
      episodeNumber: event.media.episodeNumber,
      mediaTitle: event.media.title,
      year: event.media.year,
    };

    const hasExistingSync = await this.syncHistoryRepository.hasExistingSync(
      user.id,
      event.media.type,
      mediaIdentifiers
    );

    const syncResults: Array<{
      destination: string;
      success: boolean;
      error?: string;
    }> = [];

    let bingersWasRewatch = false;

    for (const destination of availableDestinations) {
      try {
        logger.sync.debug(
          {
            username: userIdentifier,
            mediaType: event.media.type,
            mediaTitle: event.media.title,
            destination: destination.name,
          },
          `Syncing to ${destination.name}`
        );

        const accessToken = await destination.getAccessToken(user);
        let options = destination.getSyncOptions
          ? destination.getSyncOptions(user, hasExistingSync)
          : {};

        if (destination.name === "Bingers") {
          const priorPlays =
            await this.syncHistoryRepository.countSuccessfulDestinationSyncs(
              user.id,
              "Bingers",
              event.media.type,
              mediaIdentifiers
            );
          const allowRewatch =
            event.media.type === "movie"
              ? !!user.bingersMarkMoviesAsRewatched
              : !!user.bingersMarkEpisodesAsRewatched;
          const shouldRewatch = allowRewatch && priorPlays > 0;

          if (priorPlays > 0 && !shouldRewatch) {
            logger.sync.debug(
              {
                username: userIdentifier,
                mediaType: event.media.type,
                mediaTitle: event.media.title,
                destination: destination.name,
              },
              "Skipping Bingers sync; item already synced to Bingers and rewatch is disabled"
            );
            continue;
          }

          bingersWasRewatch = shouldRewatch;
          options = {
            markMoviesAsRewatched:
              shouldRewatch && event.media.type === "movie",
            markEpisodesAsRewatched:
              shouldRewatch && event.media.type === "episode",
            bingersLocalPlayCount: shouldRewatch ? priorPlays + 1 : undefined,
          };
        }

        await this.scrobbleWithOptionalAuthRetry(
          destination,
          user,
          event,
          accessToken,
          options
        );

        const mediaInfo =
          event.media.type === "episode"
            ? event.media.tvdbEpisodeId
              ? `TVDB ID: ${event.media.tvdbEpisodeId}`
              : `S${event.media.seasonNumber}E${event.media.episodeNumber}`
            : event.media.tvdbMovieId
              ? `TVDB ID: ${event.media.tvdbMovieId}`
              : event.media.year
                ? `${event.media.title} (${event.media.year})`
                : event.media.title;

        logger.sync.info(
          {
            username: userIdentifier,
            mediaType: event.media.type,
            mediaTitle: event.media.title,
            mediaInfo,
            destination: destination.name,
          },
          `Scrobbled ${event.media.title} to ${destination.name}`
        );

        syncResults.push({ destination: destination.name, success: true });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        logger.sync.error(
          {
            error,
            userId: user.id,
            username: userIdentifier,
            source: event.source,
            mediaType: event.media.type,
            mediaTitle: event.media.title,
            destination: destination.name,
            tvdbEpisodeId: event.media.tvdbEpisodeId,
            tvdbMovieId: event.media.tvdbMovieId,
          },
          `Failed to sync to ${destination.name}`
        );

        syncResults.push({
          destination: destination.name,
          success: false,
          error: errorMessage,
        });
      }
    }

    const attemptResult = buildAttemptResult(syncResults);

    if (saveFailedHistory) {
      const wasRewatched =
        bingersWasRewatch && attemptResult.destinations.includes("Bingers");
      await this.saveSyncHistory(user.id, event, attemptResult, wasRewatched);
    }

    return attemptResult;
  }

  private async saveSyncHistory(
    userId: string,
    event: MediaEvent,
    attemptResult: SyncAttemptResult,
    wasRewatched?: boolean
  ): Promise<void> {
    try {
      let posterUrl = event.media.posterUrl;
      if (
        event.source === "jellyfin" &&
        event.media.type === "episode" &&
        event.metadata?.itemId
      ) {
        const settings = await this.settingsRepository.getAll();
        if (settings.jellyfinHost) {
          try {
            const { JellyfinClient } =
              await import("@integrations/jellyfin/JellyfinClient");
            const jellyfinClient = new JellyfinClient(settings.jellyfinHost);
            const user = await this.userRepository.findById(userId);

            if (
              user?.jellyfinAccessToken &&
              event.media.seasonNumber !== undefined
            ) {
              const itemId = event.metadata.itemId as string;
              const seasonPosterUrl = await jellyfinClient.getSeasonPosterUrl(
                user.jellyfinAccessToken,
                itemId,
                event.media.seasonNumber
              );
              if (seasonPosterUrl) {
                posterUrl = seasonPosterUrl;
              }
            }
          } catch {
            // Fall back to episode poster
          }
        }
      }

      await this.syncHistoryRepository.create({
        userId,
        mediaType: event.media.type,
        mediaTitle: event.media.title,
        source: event.source,
        originalMediaId: event.media.id,
        tvdbEpisodeId: event.media.tvdbEpisodeId?.toString(),
        tvdbMovieId: event.media.tvdbMovieId?.toString(),
        imdbMovieId: event.media.imdbMovieId,
        imdbEpisodeId: event.media.imdbEpisodeId,
        tmdbMovieId: event.media.tmdbMovieId?.toString(),
        tmdbSeriesId: event.media.tmdbSeriesId?.toString(),
        posterUrl,
        seasonNumber: event.media.seasonNumber,
        episodeNumber: event.media.episodeNumber,
        year: event.media.year,
        success: attemptResult.success,
        errorMessage: attemptResult.errorMessage,
        wasRewatched: wasRewatched ?? false,
        destinations:
          attemptResult.destinations.length > 0
            ? JSON.stringify(attemptResult.destinations)
            : undefined,
        destinationResults: serializeDestinationResults(
          attemptResult.destinationResults
        ),
      });

      const limitSetting =
        await this.settingsRepository.get("syncHistoryLimit");
      const limit = limitSetting ? parseInt(limitSetting, 10) : 100;

      await this.syncHistoryRepository.clearOldByUser(userId, limit);
    } catch (error) {
      logger.sync.error(
        { error, userId, mediaTitle: event.media.title },
        "Failed to save sync history - data loss risk"
      );
    }
  }

  private async scrobbleWithOptionalAuthRetry(
    destination: SyncDestination,
    user: User,
    event: MediaEvent,
    accessToken: string,
    options: SyncOptions
  ): Promise<void> {
    try {
      await destination.client.scrobble(event, accessToken, options);
    } catch (error) {
      if (!destination.refreshAccessToken) {
        throw error;
      }

      const canRetryTrakt = isTraktAuthError(error);
      const canRetryBingers =
        destination.name === "Bingers" && isBingersAuthError(error);
      if (!canRetryTrakt && !canRetryBingers) {
        throw error;
      }

      const refreshedToken = await destination.refreshAccessToken(user);
      await destination.client.scrobble(event, refreshedToken, options);
    }
  }

  private async enrichMediaIds(event: MediaEvent): Promise<MediaEvent> {
    if (!needsMediaIdEnrichment(event.media)) {
      return event;
    }

    const settings = await this.settingsRepository.getAll();
    const tmdbToken = getTmdbAccessToken(settings);
    if (!tmdbToken) {
      logger.sync.debug(
        {
          mediaTitle: event.media.title,
          mediaType: event.media.type,
        },
        "Skipping media ID enrichment; TMDB access token not configured"
      );
      return event;
    }

    const enricher = new MediaIdEnricher(new TmdbClient(tmdbToken));
    const enrichedMedia = await enricher.enrich(event.media);
    if (enrichedMedia === event.media) {
      return event;
    }

    return {
      ...event,
      media: enrichedMedia,
    };
  }
}
