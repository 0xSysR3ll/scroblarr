import { ISyncClient, SyncOptions } from "@integrations/common/ISyncClient";
import { MediaEvent } from "@scroblarr/shared";
import { logger } from "@utils/logger";

import {
  getSimklHeaders,
  SIMKL_API_BASE_URL,
  withSimklQueryParams,
} from "./SimklApi";

type SimklIds = {
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
};

interface SimklMovie {
  title?: string;
  year?: number;
  watched_at?: string;
  ids: SimklIds;
}

interface SimklEpisode {
  number?: number;
  watched_at: string;
  ids?: Pick<SimklIds, "tvdb">;
}

interface SimklShow {
  title: string;
  year?: number;
  ids?: SimklIds;
  seasons?: Array<{
    number: number;
    episodes: SimklEpisode[];
  }>;
}

interface SimklHistoryPayload {
  movies?: SimklMovie[];
  shows?: SimklShow[];
  episodes?: SimklEpisode[];
}

interface SimklHistoryResponse {
  added?: {
    movies?: number;
    shows?: number;
    episodes?: number;
  };
  not_found?: {
    movies?: unknown[];
    shows?: unknown[];
    episodes?: unknown[];
  };
}

export class SimklClient implements ISyncClient {
  private static readonly FETCH_TIMEOUT_MS = 30_000;
  private static readonly MIN_POST_INTERVAL_MS = 1000;
  private static postQueue: Promise<void> = Promise.resolve();
  private static lastPostAt = 0;

  constructor(private readonly clientId: string) {}

  getName(): string {
    return "Simkl";
  }

  async scrobble(
    event: MediaEvent,
    accessToken: string,
    _options?: SyncOptions
  ): Promise<void> {
    if (event.media.type === "episode") {
      await this.addEpisodeToHistory(event, accessToken);
    } else if (event.media.type === "movie") {
      await this.addMovieToHistory(event, accessToken);
    } else {
      throw new Error(`Unsupported media type: ${event.media.type}`);
    }
  }

  async getUserProfile(accessToken: string): Promise<{
    id: number | null;
    username: string | null;
    image: string | null;
  }> {
    const response = await this.post(
      "/users/settings",
      accessToken,
      undefined,
      false
    );

    const settings = (await response.json()) as {
      user?: { name?: string; avatar?: string };
      account?: { id?: number };
    };

    return {
      id: settings.account?.id ?? null,
      username: settings.user?.name ?? null,
      image: settings.user?.avatar ?? null,
    };
  }

  private async addMovieToHistory(
    event: MediaEvent,
    accessToken: string
  ): Promise<void> {
    const ids: SimklIds = {};
    if (event.media.imdbMovieId) {
      ids.imdb = event.media.imdbMovieId;
    }
    if (event.media.tmdbMovieId) {
      ids.tmdb = event.media.tmdbMovieId;
    }
    if (event.media.tvdbMovieId) {
      ids.tvdb = event.media.tvdbMovieId;
    }

    if (Object.keys(ids).length === 0 && !event.media.title) {
      throw new Error(
        "Movie requires at least IMDB ID, TMDB ID, TVDB ID, or title"
      );
    }

    const movie: SimklMovie = {
      watched_at: this.formatWatchedAt(event.timestamp),
      ids,
    };

    if (event.media.title) {
      movie.title = event.media.title;
    }
    if (event.media.year) {
      movie.year = event.media.year;
    }

    await this.addToHistory({ movies: [movie] }, accessToken, event);
  }

  private async addEpisodeToHistory(
    event: MediaEvent,
    accessToken: string
  ): Promise<void> {
    const showIds: SimklIds = {};
    if (event.media.tmdbSeriesId) {
      showIds.tmdb = event.media.tmdbSeriesId;
    }
    const episodeIds: Pick<SimklIds, "tvdb"> = {};
    if (event.media.tvdbEpisodeId) {
      episodeIds.tvdb = event.media.tvdbEpisodeId;
    }

    if (
      !event.media.tvdbEpisodeId &&
      (event.media.seasonNumber === undefined ||
        event.media.episodeNumber === undefined)
    ) {
      throw new Error(
        "Episode requires a TVDB episode ID or season/episode numbers"
      );
    }

    const episode: SimklEpisode = {
      number: event.media.episodeNumber,
      watched_at: this.formatWatchedAt(event.timestamp),
      ids: Object.keys(episodeIds).length > 0 ? episodeIds : undefined,
    };

    const canSubmitDirectEpisode =
      event.media.seasonNumber === undefined && !!event.media.tvdbEpisodeId;
    if (canSubmitDirectEpisode) {
      await this.addToHistory({ episodes: [episode] }, accessToken, event);
      return;
    }

    if (!event.media.title) {
      throw new Error("Show title is required for Simkl episode scrobble");
    }

    const show: SimklShow = {
      title: event.media.title,
      year: event.media.year,
      ids: Object.keys(showIds).length > 0 ? showIds : undefined,
      seasons: [
        {
          number: event.media.seasonNumber!,
          episodes: [episode],
        },
      ],
    };

    await this.addToHistory({ shows: [show] }, accessToken, event);
  }

  private async addToHistory(
    payload: SimklHistoryPayload,
    accessToken: string,
    event: MediaEvent
  ): Promise<void> {
    const response = await this.post("/sync/history", accessToken, payload);
    const result = (await response.json()) as SimklHistoryResponse;

    const notFound =
      (result.not_found?.movies?.length ?? 0) +
      (result.not_found?.shows?.length ?? 0) +
      (result.not_found?.episodes?.length ?? 0);

    if (notFound > 0) {
      logger.simkl.error(
        {
          payload,
          result,
          mediaType: event.media.type,
          mediaTitle: event.media.title,
        },
        "Simkl could not match history payload"
      );
      throw new Error("Simkl could not match the media item");
    }
  }

  private async post(
    endpoint: string,
    accessToken: string,
    payload?: unknown,
    throttle: boolean = true
  ): Promise<Response> {
    const execute = async () => {
      if (throttle) {
        await SimklClient.waitForPostSlot();
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        SimklClient.FETCH_TIMEOUT_MS
      );
      let response: Response;

      try {
        response = await fetch(
          withSimklQueryParams(
            `${SIMKL_API_BASE_URL}${endpoint}`,
            this.clientId
          ),
          {
            method: "POST",
            headers: getSimklHeaders(this.clientId, accessToken),
            body: payload === undefined ? undefined : JSON.stringify(payload),
            signal: controller.signal,
          }
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Simkl API request timed out");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.simkl.error(
          { status: response.status, errorText, endpoint, payload },
          "Simkl API error"
        );
        throw new Error(
          `Simkl API error: ${response.status} - ${this.extractErrorMessage(errorText)}`
        );
      }

      return response;
    };

    if (!throttle) {
      return execute();
    }

    const result = SimklClient.postQueue.then(execute, execute);
    SimklClient.postQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private static async waitForPostSlot(): Promise<void> {
    const elapsed = Date.now() - SimklClient.lastPostAt;
    if (elapsed < SimklClient.MIN_POST_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, SimklClient.MIN_POST_INTERVAL_MS - elapsed)
      );
    }
    SimklClient.lastPostAt = Date.now();
  }

  private formatWatchedAt(timestamp: Date): string {
    return timestamp.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  private extractErrorMessage(errorText: string): string {
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        return errorJson.error;
      }
      if (errorJson.message) {
        return errorJson.message;
      }
    } catch {
      // Not JSON
    }
    return errorText.substring(0, 200);
  }
}
