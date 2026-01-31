import { MediaEvent } from "@scroblarr/shared";
import { User } from "@entities/User";
import { UserRepository } from "@repositories/UserRepository";
import { SyncHistoryRepository } from "@repositories/SyncHistoryRepository";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { TVTimeClient } from "@integrations/tvtime/TVTimeClient";
import { TVTimeTokenManager } from "@integrations/tvtime/TVTimeTokenManager";
import { TraktClient } from "@integrations/trakt/TraktClient";
import { TraktTokenManager } from "@integrations/trakt/TraktTokenManager";
import { ISyncClient, SyncOptions } from "@integrations/common/ISyncClient";
import { logger } from "@utils/logger";

interface SyncDestination {
  name: string;
  client: ISyncClient;
  hasToken: (user: User) => boolean;
  getAccessToken: (user: User) => Promise<string>;
  getSyncOptions?: (user: User, hasExistingSync: boolean) => SyncOptions;
}

export class SyncService {
  private userRepository: UserRepository;
  private syncHistoryRepository: SyncHistoryRepository;
  private settingsRepository: SettingsRepository;
  private tvtimeClient: TVTimeClient;
  private tvtimeTokenManager: TVTimeTokenManager;
  private traktTokenManager: TraktTokenManager;
  constructor() {
    this.userRepository = new UserRepository();
    this.syncHistoryRepository = new SyncHistoryRepository();
    this.settingsRepository = new SettingsRepository();
    this.tvtimeClient = new TVTimeClient();
    this.tvtimeTokenManager = new TVTimeTokenManager();
    this.traktTokenManager = new TraktTokenManager();
  }

  private async getSyncDestinations(user: User): Promise<SyncDestination[]> {
    const destinations: SyncDestination[] = [
      {
        name: "TVTime",
        client: this.tvtimeClient,
        hasToken: (u) => !!u.tvtimeAccessToken,
        getAccessToken: async (u) => {
          return await this.tvtimeTokenManager.getValidAccessToken(u.id);
        },
        getSyncOptions: (u, hasExistingSync) => ({
          markMoviesAsRewatched:
            u.tvtimeMarkMoviesAsRewatched && hasExistingSync,
          markEpisodesAsRewatched:
            u.tvtimeMarkEpisodesAsRewatched && hasExistingSync,
        }),
      },
    ];

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
        });
      } catch (error) {
        logger.sync.warn(
          { error, userId: user.id },
          "Failed to add Trakt sync destination for user"
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
      await this.saveSyncHistory(
        user.id,
        event,
        false,
        "User account is disabled",
        false,
        []
      );
      return;
    }

    const syncDestinations = await this.getSyncDestinations(user);

    const availableDestinations = syncDestinations.filter((dest) =>
      dest.hasToken(user)
    );

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
      await this.saveSyncHistory(
        user.id,
        event,
        false,
        "No sync destinations configured",
        false,
        []
      );
      return;
    }

    const userIdentifier =
      event.source === "plex" ? user.plexUsername : user.jellyfinUsername;

    const hasExistingSync = await this.syncHistoryRepository.hasExistingSync(
      user.id,
      event.media.type,
      {
        tvdbEpisodeId: event.media.tvdbEpisodeId?.toString(),
        tvdbMovieId: event.media.tvdbMovieId?.toString(),
        imdbMovieId: event.media.imdbMovieId,
        imdbEpisodeId: event.media.imdbEpisodeId,
      }
    );

    const syncResults: Array<{
      destination: string;
      success: boolean;
      error?: string;
    }> = [];

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
        const options = destination.getSyncOptions
          ? destination.getSyncOptions(user, hasExistingSync)
          : {};

        await destination.client.scrobble(event, accessToken, options);

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

    const allSuccessful = syncResults.every((r) => r.success);
    const atLeastOneSuccess = syncResults.some((r) => r.success);
    const wasRewatched =
      event.media.type === "movie"
        ? user.tvtimeMarkMoviesAsRewatched && hasExistingSync
        : user.tvtimeMarkEpisodesAsRewatched && hasExistingSync;

    const errorMessage = allSuccessful
      ? undefined
      : syncResults
          .filter((r) => !r.success)
          .map((r) => `${r.destination}: ${r.error}`)
          .join("; ");

    const successfulDestinations = syncResults
      .filter((r) => r.success)
      .map((r) => r.destination);

    await this.saveSyncHistory(
      user.id,
      event,
      atLeastOneSuccess,
      errorMessage,
      wasRewatched,
      successfulDestinations
    );
  }

  private async saveSyncHistory(
    userId: string,
    event: MediaEvent,
    success: boolean,
    errorMessage?: string,
    wasRewatched?: boolean,
    destinations?: string[]
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
        success,
        errorMessage,
        wasRewatched: wasRewatched ?? false,
        destinations:
          destinations && destinations.length > 0
            ? JSON.stringify(destinations)
            : undefined,
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
}
