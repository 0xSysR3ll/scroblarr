import { MediaEvent, MediaItem, MediaStatus } from "@scroblarr/shared";

export interface EmbyWebhookPayload {
  Event?: string;
  Title?: string;
  Description?: string;
  Date?: string;
  User?: {
    Name?: string;
    Id?: string;
  };
  Item?: {
    Id?: string;
    Type?: string;
    Name?: string;
    SeriesName?: string;
    ProductionYear?: number;
    ParentIndexNumber?: number;
    IndexNumber?: number;
    RunTimeTicks?: number;
    ProviderIds?: {
      Tvdb?: string;
      Imdb?: string;
      Tmdb?: string;
      [key: string]: string | undefined;
    };
  };
  PlaybackInfo?: {
    PlayedToCompletion?: boolean;
    PositionTicks?: number;
  };
  Session?: {
    PlayState?: {
      PositionTicks?: number;
    };
  };
}

export class EmbyWebhookParser {
  static parse(
    payload: EmbyWebhookPayload,
    embyHost?: string
  ): MediaEvent | null {
    const eventName = payload.Event;
    const userId = payload.User?.Id;
    const item = payload.Item;

    if (!userId || !item?.Type) {
      return null;
    }

    if (item.Type !== "Movie" && item.Type !== "Episode") {
      return null;
    }

    const runtimeTicks = item.RunTimeTicks;
    const positionTicks =
      payload.PlaybackInfo?.PositionTicks ??
      payload.Session?.PlayState?.PositionTicks;
    const playedToCompletion = this.calculatePlayedToCompletion(
      payload.PlaybackInfo?.PlayedToCompletion,
      runtimeTicks,
      positionTicks
    );

    const status = this.mapEventToStatus(eventName, playedToCompletion);
    if (!status) {
      return null;
    }

    let posterUrl: string | undefined;
    if (embyHost && item.Id) {
      try {
        const base = embyHost.endsWith("/") ? embyHost : `${embyHost}/`;
        posterUrl = new URL(
          `Items/${encodeURIComponent(item.Id)}/Images/Primary`,
          base
        ).toString();
      } catch {
        posterUrl = undefined;
      }
    }

    const media = this.parseMediaItem(item, posterUrl, positionTicks);
    if (!media) {
      return null;
    }

    return {
      event: status,
      media,
      userId,
      source: "emby" as const,
      timestamp: this.parseEventTimestamp(payload.Date),
      metadata: {
        itemId: item.Id,
      },
    };
  }

  private static parseEventTimestamp(date: string | undefined): Date {
    if (!date) {
      return new Date();
    }
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private static calculatePlayedToCompletion(
    playedToCompletion: boolean | undefined,
    runtimeTicks: number | undefined,
    positionTicks: number | undefined
  ): boolean {
    if (playedToCompletion === true) {
      return true;
    }
    if (playedToCompletion === false) {
      return false;
    }

    if (
      runtimeTicks !== undefined &&
      positionTicks !== undefined &&
      runtimeTicks > 0
    ) {
      return (positionTicks / runtimeTicks) * 100 >= 90;
    }

    return false;
  }

  private static mapEventToStatus(
    eventName: string | undefined,
    playedToCompletion: boolean
  ): MediaStatus | null {
    if (eventName === "playback.start") {
      return "playing";
    }
    if (eventName === "playback.stop") {
      return playedToCompletion ? "scrobble" : "stopped";
    }
    return null;
  }

  private static ticksToMs(ticks: number | undefined): number | undefined {
    if (ticks === undefined || Number.isNaN(ticks)) {
      return undefined;
    }
    return Math.floor(ticks / 10000);
  }

  private static parseProviderId(
    providerIds: NonNullable<EmbyWebhookPayload["Item"]>["ProviderIds"],
    key: string
  ): string | undefined {
    if (!providerIds) {
      return undefined;
    }
    const value = providerIds[key];
    return value && value.trim() !== "" ? value : undefined;
  }

  private static parseMediaItem(
    item: NonNullable<EmbyWebhookPayload["Item"]>,
    posterUrl: string | undefined,
    positionTicks: number | undefined
  ): MediaItem | null {
    const providerTvdb = this.parseProviderId(item.ProviderIds, "Tvdb");
    const providerImdb = this.parseProviderId(item.ProviderIds, "Imdb");
    const providerTmdb = this.parseProviderId(item.ProviderIds, "Tmdb");

    if (item.Type === "Movie") {
      const tvdbMovieId = providerTvdb ? parseInt(providerTvdb, 10) : undefined;
      const tmdbMovieId = providerTmdb ? parseInt(providerTmdb, 10) : undefined;

      return {
        id: `movie-${item.Name || "Unknown"}-${item.ProductionYear || "unknown"}`,
        type: "movie",
        title: item.Name || "Unknown",
        year: item.ProductionYear,
        duration: this.ticksToMs(item.RunTimeTicks),
        watchedDuration: this.ticksToMs(positionTicks),
        tvdbMovieId: Number.isNaN(tvdbMovieId) ? undefined : tvdbMovieId,
        imdbMovieId: providerImdb,
        tmdbMovieId: Number.isNaN(tmdbMovieId) ? undefined : tmdbMovieId,
        posterUrl,
      };
    }

    if (item.Type === "Episode") {
      const tvdbEpisodeId = providerTvdb
        ? parseInt(providerTvdb, 10)
        : undefined;

      return {
        id: `episode-${item.SeriesName || "Unknown"}-${item.ParentIndexNumber ?? "unknown"}-${item.IndexNumber ?? "unknown"}`,
        type: "episode",
        title: item.SeriesName || "Unknown",
        year: item.ProductionYear,
        seasonNumber: item.ParentIndexNumber,
        episodeNumber: item.IndexNumber,
        episodeTitle: item.Name,
        duration: this.ticksToMs(item.RunTimeTicks),
        watchedDuration: this.ticksToMs(positionTicks),
        tvdbEpisodeId: Number.isNaN(tvdbEpisodeId) ? undefined : tvdbEpisodeId,
        imdbEpisodeId: providerImdb,
        posterUrl,
      };
    }

    return null;
  }
}
