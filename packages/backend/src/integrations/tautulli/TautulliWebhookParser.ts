import { MediaEvent, MediaItem, MediaStatus } from "@scroblarr/shared";

export interface TautulliWebhookPayload {
  action?: string;
  user?: string;
  username?: string;
  media_type?: string;
  title?: string;
  year?: string | number;
  show_name?: string;
  show_year?: string | number;
  episode_name?: string;
  season_num?: string | number;
  episode_num?: string | number;
  imdb_id?: string;
  thetvdb_id?: string | number;
  themoviedb_id?: string | number;
  duration_ms?: string | number;
  view_offset?: string | number;
  poster_url?: string;
  thumb?: string;
  guid?: string;
  server_machine_id?: string;
}

export class TautulliWebhookParser {
  static parse(
    payload: TautulliWebhookPayload,
    plexServerUrl?: string
  ): MediaEvent | null {
    const username = firstNonEmpty(payload.username, payload.user);
    if (!username) {
      return null;
    }

    const status = this.mapActionToStatus(asString(payload.action));
    if (!status) {
      return null;
    }

    const media = this.parseMediaItem(payload, plexServerUrl);
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

  static getServerMachineId(
    payload: TautulliWebhookPayload
  ): string | undefined {
    return asString(payload.server_machine_id);
  }

  private static mapActionToStatus(
    action: string | undefined
  ): MediaStatus | null {
    if (!action) {
      return null;
    }

    const actionMap: Record<string, MediaStatus> = {
      play: "playing",
      resume: "playing",
      pause: "paused",
      stop: "stopped",
      watched: "scrobble",
    };

    return actionMap[action.toLowerCase()] ?? null;
  }

  private static parseMediaItem(
    payload: TautulliWebhookPayload,
    plexServerUrl?: string
  ): MediaItem | null {
    const mediaType = asString(payload.media_type)?.toLowerCase();
    if (mediaType !== "movie" && mediaType !== "episode") {
      return null;
    }

    const posterUrl = this.getPosterUrl(payload, plexServerUrl);
    const duration = parseOptionalInt(payload.duration_ms);
    const watchedDuration = parseOptionalInt(payload.view_offset);
    const imdbId = parseImdbId(payload.imdb_id);
    const tvdbId = parseOptionalInt(payload.thetvdb_id);
    const tmdbId = parseOptionalInt(payload.themoviedb_id);

    if (mediaType === "movie") {
      const title = firstNonEmpty(payload.title) || "Unknown";
      const year = parseOptionalInt(payload.year);

      return {
        id: `movie-${title}-${year || "unknown"}`,
        type: "movie",
        title,
        year,
        duration,
        watchedDuration,
        tvdbMovieId: tvdbId,
        imdbMovieId: imdbId,
        tmdbMovieId: tmdbId,
        posterUrl,
      };
    }

    const showName =
      firstNonEmpty(payload.show_name, payload.title) || "Unknown";
    const seasonNumber = parseOptionalInt(payload.season_num);
    const episodeNumber = parseOptionalInt(payload.episode_num);
    const year =
      parseOptionalInt(payload.show_year) ?? parseOptionalInt(payload.year);

    return {
      id: `episode-${showName}-${seasonNumber ?? "unknown"}-${episodeNumber ?? "unknown"}`,
      type: "episode",
      title: showName,
      year,
      seasonNumber,
      episodeNumber,
      episodeTitle: firstNonEmpty(payload.episode_name),
      duration,
      watchedDuration,
      tmdbSeriesId: tmdbId,
      posterUrl,
    };
  }

  private static getPosterUrl(
    payload: TautulliWebhookPayload,
    plexServerUrl?: string
  ): string | undefined {
    const posterUrl = firstNonEmpty(payload.poster_url);
    if (posterUrl && /^https?:\/\//i.test(posterUrl)) {
      return posterUrl;
    }

    const thumb = firstNonEmpty(payload.thumb);
    if (!thumb) {
      return undefined;
    }

    if (/^https?:\/\//i.test(thumb)) {
      return thumb;
    }

    if (!plexServerUrl) {
      return undefined;
    }

    try {
      const serverUrl = new URL(plexServerUrl);
      const baseUrl = `${serverUrl.protocol}//${serverUrl.host}${serverUrl.pathname.replace(/\/$/, "")}`;
      const normalizedPath = thumb.startsWith("/") ? thumb : `/${thumb}`;
      return `${baseUrl}${normalizedPath}`;
    } catch {
      return undefined;
    }
  }
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  if (!text || /^\{\w+\}$/.test(text)) {
    return undefined;
  }
  return text;
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = asString(value);
    if (text) {
      return text;
    }
  }
  return undefined;
}

function parseOptionalInt(value: unknown): number | undefined {
  const text = asString(value);
  if (!text || !/^\d+$/.test(text)) {
    return undefined;
  }
  return parseInt(text, 10);
}

function parseImdbId(value: unknown): string | undefined {
  const text = asString(value);
  if (!text) {
    return undefined;
  }
  return /^tt\d+$/i.test(text) ? text : undefined;
}
