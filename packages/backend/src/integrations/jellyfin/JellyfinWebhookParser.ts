import { MediaEvent, MediaItem, MediaStatus } from "@scroblarr/shared";

export interface JellyfinWebhookPayload {
  notificationType: string;
  username: string;
  userId: string;
  itemType: string;
  itemId: string;
  name: string;
  year?: string;
  seriesName?: string;
  seasonNumber?: string;
  episodeNumber?: string;
  provider_tvdb?: string;
  provider_imdb?: string;
  provider_tmdb?: string;
  thumbnail?: {
    url?: string;
  };
  runtimeTicks?: string;
  playbackPositionTicks?: string;
  playedToCompletion?: string;
  timestamp: string;
}

export class JellyfinWebhookParser {
  static parse(payload: JellyfinWebhookPayload): MediaEvent | null {
    const {
      notificationType,
      userId,
      itemType,
      name,
      year,
      seriesName,
      seasonNumber,
      episodeNumber,
      provider_tvdb,
      provider_imdb,
      provider_tmdb,
      thumbnail,
      runtimeTicks,
      playbackPositionTicks,
      playedToCompletion,
    } = payload;

    if (!userId) {
      return null;
    }

    if (!itemType || (itemType !== "Movie" && itemType !== "Episode")) {
      return null;
    }

    const calculatePlayedToCompletion = (
      playedToCompletion: string | undefined,
      runtimeTicks: string | undefined,
      playbackPositionTicks: string | undefined
    ): boolean => {
      if (playedToCompletion?.toLowerCase() === "true") {
        return true;
      }
      if (playedToCompletion?.toLowerCase() === "false") {
        return false;
      }

      if (runtimeTicks && playbackPositionTicks) {
        const runtime = parseInt(runtimeTicks, 10);
        const position = parseInt(playbackPositionTicks, 10);
        if (!isNaN(runtime) && !isNaN(position) && runtime > 0) {
          const completionPercentage = (position / runtime) * 100;
          return completionPercentage >= 90;
        }
      }

      return false;
    };

    const status = this.mapNotificationTypeToStatus(
      notificationType,
      calculatePlayedToCompletion(
        playedToCompletion,
        runtimeTicks,
        playbackPositionTicks
      )
    );
    if (!status) {
      return null;
    }

    const media = this.parseMediaItem(
      itemType,
      name,
      year,
      seriesName,
      seasonNumber,
      episodeNumber,
      provider_tvdb,
      provider_imdb,
      provider_tmdb,
      thumbnail,
      runtimeTicks,
      playbackPositionTicks
    );
    if (!media) {
      return null;
    }

    return {
      event: status,
      media,
      userId: userId,
      source: "jellyfin" as const,
      timestamp: new Date(),
      metadata: {
        itemId: payload.itemId,
      },
    };
  }

  private static mapNotificationTypeToStatus(
    notificationType: string,
    playedToCompletion: boolean
  ): MediaStatus | null {
    if (notificationType === "PlaybackStart") {
      return "playing";
    }
    if (notificationType === "PlaybackStop") {
      return playedToCompletion ? "scrobble" : "stopped";
    }

    return null;
  }

  private static parseMediaItem(
    itemType: string,
    name: string,
    year: string | undefined,
    seriesName: string | undefined,
    seasonNumber: string | undefined,
    episodeNumber: string | undefined,
    providerTvdb: string | undefined,
    providerImdb: string | undefined,
    providerTmdb: string | undefined,
    thumbnail: { url?: string } | undefined,
    runtimeTicks: string | undefined,
    playbackPositionTicks: string | undefined
  ): MediaItem | null {
    const ticksToMs = (ticks: string | undefined): number | undefined => {
      if (!ticks) {
        return undefined;
      }
      const ticksNum = parseInt(ticks, 10);
      if (isNaN(ticksNum)) {
        return undefined;
      }
      return Math.floor(ticksNum / 10000);
    };

    const extractTvdbId = (
      provider: string | undefined
    ): number | undefined => {
      if (!provider || provider.trim() === "") {
        return undefined;
      }
      const id = parseInt(provider, 10);
      return isNaN(id) ? undefined : id;
    };

    const extractTmdbId = (
      provider: string | undefined
    ): number | undefined => {
      if (!provider || provider.trim() === "") {
        return undefined;
      }
      const id = parseInt(provider, 10);
      return isNaN(id) ? undefined : id;
    };

    const posterUrl = thumbnail?.url;

    if (itemType === "Movie") {
      const tvdbMovieId = extractTvdbId(providerTvdb);
      const tmdbMovieId = extractTmdbId(providerTmdb);
      const imdbMovieId =
        providerImdb && providerImdb.trim() !== "" ? providerImdb : undefined;
      const yearNum = year ? parseInt(year, 10) : undefined;

      return {
        id: `movie-${name}-${yearNum || "unknown"}`,
        type: "movie",
        title: name || "Unknown",
        year: isNaN(yearNum || NaN) ? undefined : yearNum,
        duration: ticksToMs(runtimeTicks),
        watchedDuration: ticksToMs(playbackPositionTicks),
        tvdbMovieId,
        imdbMovieId,
        tmdbMovieId,
        posterUrl,
      };
    }

    if (itemType === "Episode") {
      const tvdbEpisodeId = extractTvdbId(providerTvdb);
      const imdbEpisodeId =
        providerImdb && providerImdb.trim() !== "" ? providerImdb : undefined;
      const seasonNum = seasonNumber ? parseInt(seasonNumber, 10) : undefined;
      const episodeNum = episodeNumber
        ? parseInt(episodeNumber, 10)
        : undefined;

      return {
        id: `episode-${seriesName || "Unknown"}-${seasonNum || "unknown"}-${episodeNum || "unknown"}`,
        type: "episode",
        title: seriesName || "Unknown",
        seasonNumber: isNaN(seasonNum || NaN) ? undefined : seasonNum,
        episodeNumber: isNaN(episodeNum || NaN) ? undefined : episodeNum,
        episodeTitle: name,
        duration: ticksToMs(runtimeTicks),
        watchedDuration: ticksToMs(playbackPositionTicks),
        tvdbEpisodeId,
        imdbEpisodeId,
        posterUrl,
      };
    }

    return null;
  }
}
