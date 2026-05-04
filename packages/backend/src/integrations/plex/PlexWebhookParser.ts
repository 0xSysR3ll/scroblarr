import { MediaEvent, MediaItem, MediaStatus } from "@scroblarr/shared";

export interface PlexWebhookPayload {
  event: string;
  user: boolean | { username: string; title?: string };
  owner?: boolean;
  Account?: {
    id: number;
    thumb?: string;
    title: string;
  };
  Server?: {
    title: string;
    uuid: string;
  };
  Player?: {
    local: boolean;
    publicAddress?: string;
    title: string;
    uuid: string;
  };
  Metadata: {
    type: "movie" | "episode" | "clip";
    title?: string;
    grandparentTitle?: string;
    parentTitle?: string;
    year?: number;
    index?: number;
    parentIndex?: number;
    duration?: number;
    viewOffset?: number;
    Guid?: Array<{ id: string }> | string;
    guid?: string;
    primaryGuid?: string;
    subtype?: string;
    ratingKey?: string;
    thumb?: string;
    art?: string;
    grandparentThumb?: string;
    parentThumb?: string;
  };
}

export class PlexWebhookParser {
  static parse(
    payload: PlexWebhookPayload,
    plexServerUrl?: string
  ): MediaEvent | null {
    const { event, user, Account, Metadata } = payload;

    if (!Metadata) {
      return null;
    }
    if (Metadata.type === "clip") {
      return null;
    }

    let username: string | null = null;
    if (Account?.title) {
      username = Account.title;
    } else if (typeof user === "object" && user?.username) {
      username = user.username;
    }

    if (!username) {
      return null;
    }

    const status = this.mapEventToStatus(event);
    if (!status) {
      return null;
    }

    const media = this.parseMediaItem(Metadata, plexServerUrl);
    if (!media) {
      return null;
    }

    return {
      event: status,
      media,
      userId: username,
      source: "plex" as const,
      timestamp: new Date(),
    };
  }

  private static mapEventToStatus(event: string): MediaStatus | null {
    const eventMap: Record<string, MediaStatus> = {
      "media.play": "playing",
      "media.pause": "paused",
      "media.stop": "stopped",
      "media.scrobble": "scrobble",
    };

    return eventMap[event] || null;
  }

  private static parseMediaItem(
    metadata: PlexWebhookPayload["Metadata"],
    plexServerUrl?: string
  ): MediaItem | null {
    const getPosterUrl = (): string | undefined => {
      if (!plexServerUrl) {
        return undefined;
      }

      try {
        const serverUrl = new URL(plexServerUrl);
        const baseUrl = `${serverUrl.protocol}//${serverUrl.host}${serverUrl.pathname.replace(/\/$/, "")}`;

        let thumbPath: string | undefined;
        if (metadata.type === "episode") {
          thumbPath = metadata.grandparentThumb || metadata.thumb;
        } else {
          thumbPath = metadata.thumb;
        }

        if (thumbPath) {
          const normalizedPath = thumbPath.startsWith("/")
            ? thumbPath
            : `/${thumbPath}`;
          return `${baseUrl}${normalizedPath}`;
        }
      } catch {
        // Ignore URL parsing errors
      }

      return undefined;
    };

    const extractIds = (): {
      tvdbId?: number;
      imdbId?: string;
      tmdbId?: number;
    } => {
      const ids: { tvdbId?: number; imdbId?: string; tmdbId?: number } = {};

      const extractFromGuid = (guid: string) => {
        if (guid.startsWith("tvdb://")) {
          const match = guid.match(/tvdb:\/\/(\d+)/);
          if (match) {
            ids.tvdbId = parseInt(match[1], 10);
          }
        } else if (guid.startsWith("imdb://")) {
          const match = guid.match(/imdb:\/\/(tt\d+)/);
          if (match) {
            ids.imdbId = match[1];
          }
        } else if (guid.startsWith("tmdb://")) {
          const match = guid.match(/tmdb:\/\/(\d+)/);
          if (match) {
            ids.tmdbId = parseInt(match[1], 10);
          }
        }
      };

      if (Array.isArray(metadata.Guid)) {
        metadata.Guid.forEach((g) => {
          if (typeof g === "object" && g.id) {
            extractFromGuid(g.id);
          } else if (typeof g === "string") {
            extractFromGuid(g);
          }
        });
      } else if (typeof metadata.Guid === "string") {
        extractFromGuid(metadata.Guid);
      }

      if (typeof metadata.guid === "string") {
        extractFromGuid(metadata.guid);
      }

      if (typeof metadata.primaryGuid === "string") {
        extractFromGuid(metadata.primaryGuid);
      }

      return ids;
    };

    const posterUrl = getPosterUrl();
    if (metadata.type === "movie") {
      const { tvdbId, imdbId, tmdbId } = extractIds();

      return {
        id: `${metadata.type}-${metadata.title}-${metadata.year || "unknown"}`,
        type: "movie",
        title: metadata.title || "Unknown",
        year: metadata.year,
        duration: metadata.duration,
        watchedDuration: metadata.viewOffset,
        tvdbMovieId: tvdbId,
        imdbMovieId: imdbId,
        tmdbMovieId: tmdbId,
        posterUrl,
      };
    }

    if (metadata.type === "episode") {
      const { tvdbId, imdbId } = extractIds();

      return {
        id: `${metadata.type}-${metadata.grandparentTitle}-${metadata.parentIndex}-${metadata.index}`,
        type: "episode",
        title: metadata.grandparentTitle || "Unknown",
        seasonNumber: metadata.parentIndex,
        episodeNumber: metadata.index,
        episodeTitle: metadata.parentTitle,
        duration: metadata.duration,
        watchedDuration: metadata.viewOffset,
        tvdbEpisodeId: tvdbId,
        imdbEpisodeId: imdbId,
        posterUrl,
      };
    }

    return null;
  }
}
