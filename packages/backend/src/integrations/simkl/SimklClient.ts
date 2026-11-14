import {
  ISyncClient,
  ScrobbleResult,
  SyncOptions,
} from "@integrations/common/ISyncClient";
import { MediaEvent } from "@scroblarr/shared";
import { logger } from "@utils/logger";

import {
  getSimklHeaders,
  SIMKL_API_BASE_URL,
  withSimklQueryParams,
} from "./SimklApi";
import {
  isSuccessfulSimklRewatchStatus,
  normalizeSimklAccountType,
  type SimklAccountType,
} from "./simklRewatch";

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
  rewatch_id?: number;
}

interface SimklEpisode {
  number?: number;
  watched_at: string;
  ids?: Pick<SimklIds, "tvdb">;
  rewatch_id?: number;
}

interface SimklShow {
  title?: string;
  year?: number;
  ids?: SimklIds;
  rewatch_id?: number;
  use_tvdb_anime_seasons?: boolean;
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
    statuses?: Array<{
      request?: unknown;
      response?: {
        rewatch_id?: number;
        rewatch_status?: string;
      };
      rewatch_id?: number;
      rewatch_status?: string;
    }>;
  };
  not_found?: {
    movies?: unknown[];
    shows?: unknown[];
    episodes?: unknown[];
  };
}

type PreparedHistoryEntry =
  | { kind: "movie"; allowRewatch: boolean; movie: SimklMovie }
  | { kind: "show"; allowRewatch: boolean; show: SimklShow }
  | { kind: "episode"; allowRewatch: boolean; episode: SimklEpisode };

export type SimklBatchItemResult =
  { success: true; result: ScrobbleResult } | { success: false; error: Error };

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
    options?: SyncOptions
  ): Promise<ScrobbleResult> {
    const entry = this.prepareHistoryEntry(event, options);
    const payload = this.payloadFromEntries([entry]);
    return this.submitHistory(payload, accessToken, entry.allowRewatch, event);
  }

  /**
   * Submit many history items in as few /sync/history calls as possible
   * (one per allow_rewatch mode). Per-item success follows not_found.
   */
  async scrobbleMany(
    items: Array<{ event: MediaEvent; options?: SyncOptions }>,
    accessToken: string
  ): Promise<SimklBatchItemResult[]> {
    if (items.length === 0) {
      return [];
    }

    const results: SimklBatchItemResult[] = new Array(items.length);
    const prepared: Array<{
      event: MediaEvent;
      entry: PreparedHistoryEntry;
      index: number;
    }> = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index]!;
      try {
        prepared.push({
          event: item.event,
          entry: this.prepareHistoryEntry(item.event, item.options),
          index,
        });
      } catch (error) {
        results[index] = {
          success: false,
          error:
            error instanceof Error
              ? error
              : new Error("Failed to build Simkl history payload"),
        };
      }
    }

    const groups = [
      prepared.filter((item) => item.entry.allowRewatch),
      prepared.filter((item) => !item.entry.allowRewatch),
    ];

    for (const group of groups) {
      if (group.length === 0) {
        continue;
      }

      const allowRewatch = group[0]!.entry.allowRewatch;
      const payload = this.payloadFromEntries(group.map((item) => item.entry));

      try {
        const response = await this.post(
          allowRewatch ? "/sync/history?allow_rewatch=yes" : "/sync/history",
          accessToken,
          payload
        );
        const result = (await response.json()) as SimklHistoryResponse;
        const notFound = {
          movies: [...(result.not_found?.movies ?? [])],
          shows: [...(result.not_found?.shows ?? [])],
          episodes: [...(result.not_found?.episodes ?? [])],
        };

        for (const item of group) {
          if (this.consumeNotFoundMatch(item.entry, notFound)) {
            logger.simkl.error(
              {
                payload: this.payloadFromEntries([item.entry]),
                result,
                mediaType: item.event.media.type,
                mediaTitle: item.event.media.title,
              },
              "Simkl could not match history payload"
            );
            results[item.index] = {
              success: false,
              error: new Error("Simkl could not match the media item"),
            };
            continue;
          }

          const rewatch = this.extractRewatchFieldsForEntry(result, item.entry);
          results[item.index] = {
            success: true,
            result: {
              wasRewatched: isSuccessfulSimklRewatchStatus(
                rewatch.rewatchStatus
              ),
              simklRewatchId: rewatch.rewatchId,
            },
          };
        }

        const leftover =
          notFound.movies.length +
          notFound.shows.length +
          notFound.episodes.length;
        if (leftover > 0) {
          logger.simkl.error(
            { leftover, result, payload },
            "Simkl returned unmatched not_found entries in batch"
          );
          for (const item of group) {
            if (results[item.index]?.success) {
              results[item.index] = {
                success: false,
                error: new Error("Simkl could not match the media item"),
              };
            }
          }
        }
      } catch (error) {
        const err =
          error instanceof Error ? error : new Error("Unknown Simkl error");
        for (const item of group) {
          results[item.index] = { success: false, error: err };
        }
      }
    }

    // Every index is assigned by prepare catch or group processing.
    return results as SimklBatchItemResult[];
  }

  async getUserProfile(accessToken: string): Promise<{
    id: number | null;
    username: string | null;
    image: string | null;
    accountType: SimklAccountType | null;
  }> {
    const response = await this.post(
      "/users/settings",
      accessToken,
      undefined,
      false
    );

    const settings = (await response.json()) as {
      user?: { name?: string; avatar?: string };
      account?: { id?: number; type?: string };
    };

    return {
      id: settings.account?.id ?? null,
      username: settings.user?.name ?? null,
      image: settings.user?.avatar ?? null,
      accountType: normalizeSimklAccountType(settings.account?.type),
    };
  }

  private prepareHistoryEntry(
    event: MediaEvent,
    options?: SyncOptions
  ): PreparedHistoryEntry {
    const allowRewatch = this.allowRewatchForEvent(event, options);

    if (event.media.type === "movie") {
      return {
        kind: "movie",
        allowRewatch,
        movie: this.buildMovie(event, options),
      };
    }

    if (event.media.type === "episode") {
      const hasSeasonEpisode =
        event.media.seasonNumber !== undefined &&
        event.media.episodeNumber !== undefined;

      if (hasSeasonEpisode) {
        return {
          kind: "show",
          allowRewatch,
          show: this.buildShow(event, options),
        };
      }

      if (event.media.tvdbEpisodeId) {
        const episode: SimklEpisode = {
          watched_at: this.formatWatchedAt(event.timestamp),
          ids: { tvdb: event.media.tvdbEpisodeId },
        };
        if (options?.simklRewatchId) {
          episode.rewatch_id = options.simklRewatchId;
        }
        return { kind: "episode", allowRewatch, episode };
      }

      throw new Error(
        "Episode requires season/episode numbers or a TVDB episode ID"
      );
    }

    throw new Error(`Unsupported media type: ${event.media.type}`);
  }

  private buildMovie(event: MediaEvent, options?: SyncOptions): SimklMovie {
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
    if (options?.simklRewatchId) {
      movie.rewatch_id = options.simklRewatchId;
    }

    return movie;
  }

  private buildShow(event: MediaEvent, options?: SyncOptions): SimklShow {
    const showIds: SimklIds = {};
    if (event.media.tmdbSeriesId) {
      showIds.tmdb = event.media.tmdbSeriesId;
    }
    if (event.media.tvdbSeriesId) {
      showIds.tvdb = event.media.tvdbSeriesId;
    }
    if (event.media.imdbSeriesId) {
      showIds.imdb = event.media.imdbSeriesId;
    }

    if (Object.keys(showIds).length === 0 && !event.media.title) {
      throw new Error(
        "Show title or series IDs are required for Simkl episode scrobble"
      );
    }

    const episode: SimklEpisode = {
      number: event.media.episodeNumber,
      watched_at: this.formatWatchedAt(event.timestamp),
    };

    const show: SimklShow = {
      year: event.media.year,
      use_tvdb_anime_seasons: true,
      ids: Object.keys(showIds).length > 0 ? showIds : undefined,
      seasons: [
        {
          number: event.media.seasonNumber!,
          episodes: [episode],
        },
      ],
    };
    if (event.media.title) {
      show.title = event.media.title;
    }
    if (options?.simklRewatchId) {
      show.rewatch_id = options.simklRewatchId;
    }

    return show;
  }

  private payloadFromEntries(
    entries: PreparedHistoryEntry[]
  ): SimklHistoryPayload {
    const payload: SimklHistoryPayload = {};
    for (const entry of entries) {
      if (entry.kind === "movie") {
        payload.movies = payload.movies ?? [];
        payload.movies.push(entry.movie);
      } else if (entry.kind === "show") {
        payload.shows = payload.shows ?? [];
        payload.shows.push(entry.show);
      } else {
        payload.episodes = payload.episodes ?? [];
        payload.episodes.push(entry.episode);
      }
    }
    return payload;
  }

  private allowRewatchForEvent(
    event: MediaEvent,
    options?: SyncOptions
  ): boolean {
    return event.media.type === "movie"
      ? !!options?.markMoviesAsRewatched
      : !!options?.markEpisodesAsRewatched;
  }

  private async submitHistory(
    payload: SimklHistoryPayload,
    accessToken: string,
    allowRewatch: boolean,
    event: MediaEvent
  ): Promise<ScrobbleResult> {
    const endpoint = allowRewatch
      ? "/sync/history?allow_rewatch=yes"
      : "/sync/history";
    const response = await this.post(endpoint, accessToken, payload);
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

    const rewatch = this.extractRewatchFields(result);
    return {
      wasRewatched: isSuccessfulSimklRewatchStatus(rewatch.rewatchStatus),
      simklRewatchId: rewatch.rewatchId,
    };
  }

  private consumeNotFoundMatch(
    entry: PreparedHistoryEntry,
    notFound: {
      movies: unknown[];
      shows: unknown[];
      episodes: unknown[];
    }
  ): boolean {
    if (entry.kind === "movie") {
      return this.consumeMatch(notFound.movies, (item) =>
        this.movieMatch(entry.movie, item)
      );
    }
    if (entry.kind === "show") {
      return this.consumeMatch(notFound.shows, (item) =>
        this.showMatch(entry.show, item)
      );
    }
    return this.consumeMatch(notFound.episodes, (item) =>
      this.episodeMatch(entry.episode, item)
    );
  }

  private consumeMatch(
    bucket: unknown[],
    matches: (item: unknown) => boolean
  ): boolean {
    const index = bucket.findIndex(matches);
    if (index < 0) {
      return false;
    }
    bucket.splice(index, 1);
    return true;
  }

  private movieMatch(sent: SimklMovie, received: unknown): boolean {
    if (!received || typeof received !== "object") {
      return false;
    }
    const receivedMovie = received as SimklMovie & {
      ids?: Record<string, unknown>;
      type?: string;
    };
    if (receivedMovie.type && receivedMovie.type !== "movie") {
      return false;
    }
    if (
      sent.watched_at &&
      receivedMovie.watched_at &&
      sent.watched_at !== receivedMovie.watched_at
    ) {
      return false;
    }
    const receivedIds = receivedMovie.ids
      ? this.normalizeIds(receivedMovie.ids)
      : undefined;
    return (
      this.idsOverlap(sent.ids, receivedIds) ||
      (!!sent.title &&
        sent.title === receivedMovie.title &&
        sent.year === receivedMovie.year)
    );
  }

  private episodeMatch(sent: SimklEpisode, received: unknown): boolean {
    if (!received || typeof received !== "object") {
      return false;
    }
    const receivedEpisode = received as SimklEpisode & {
      ids?: Record<string, unknown>;
      type?: string;
    };
    if (receivedEpisode.type && receivedEpisode.type !== "episode") {
      return false;
    }
    if (
      sent.watched_at &&
      receivedEpisode.watched_at &&
      sent.watched_at !== receivedEpisode.watched_at
    ) {
      return false;
    }
    const receivedIds = receivedEpisode.ids
      ? this.normalizeIds(receivedEpisode.ids)
      : undefined;
    return this.idsOverlap(sent.ids, receivedIds);
  }

  private showMatch(sent: SimklShow, received: unknown): boolean {
    if (!received || typeof received !== "object") {
      return false;
    }

    const receivedShow = received as SimklShow;
    const sentEpisode = sent.seasons?.[0]?.episodes?.[0];
    const receivedEpisode = receivedShow.seasons?.[0]?.episodes?.[0];
    return (
      sent.title === receivedShow.title &&
      sent.seasons?.[0]?.number === receivedShow.seasons?.[0]?.number &&
      sentEpisode?.number === receivedEpisode?.number &&
      sentEpisode?.watched_at === receivedEpisode?.watched_at
    );
  }

  private idsOverlap(
    sent?: SimklIds | Pick<SimklIds, "tvdb">,
    received?: SimklIds | Pick<SimklIds, "tvdb">
  ): boolean {
    if (!sent || !received) {
      return false;
    }
    if (sent.tvdb != null && sent.tvdb === received.tvdb) {
      return true;
    }
    const sentFull = sent as SimklIds;
    const receivedFull = received as SimklIds;
    if (sentFull.tmdb != null && sentFull.tmdb === receivedFull.tmdb) {
      return true;
    }
    if (sentFull.imdb != null && sentFull.imdb === receivedFull.imdb) {
      return true;
    }
    return false;
  }

  private extractRewatchFields(result: SimklHistoryResponse): {
    rewatchId?: number;
    rewatchStatus?: string;
  } {
    const statuses = result.added?.statuses;
    if (!Array.isArray(statuses)) {
      return {};
    }

    for (const status of statuses) {
      const nested = status.response;
      const rewatchId = nested?.rewatch_id ?? status.rewatch_id;
      const rewatchStatus = nested?.rewatch_status ?? status.rewatch_status;
      if (typeof rewatchId === "number" || typeof rewatchStatus === "string") {
        return {
          rewatchId: typeof rewatchId === "number" ? rewatchId : undefined,
          rewatchStatus:
            typeof rewatchStatus === "string" ? rewatchStatus : undefined,
        };
      }
    }

    return {};
  }

  private extractRewatchFieldsForEntry(
    result: SimklHistoryResponse,
    entry: PreparedHistoryEntry
  ): { rewatchId?: number; rewatchStatus?: string } {
    const statuses = result.added?.statuses;
    if (!Array.isArray(statuses) || statuses.length === 0) {
      return {};
    }

    for (const status of statuses) {
      if (
        status.request === undefined ||
        !this.statusRequestMatchesEntry(entry, status.request)
      ) {
        continue;
      }

      const nested = status.response;
      const rewatchId = nested?.rewatch_id ?? status.rewatch_id;
      const rewatchStatus = nested?.rewatch_status ?? status.rewatch_status;
      if (typeof rewatchId === "number" || typeof rewatchStatus === "string") {
        return {
          rewatchId: typeof rewatchId === "number" ? rewatchId : undefined,
          rewatchStatus:
            typeof rewatchStatus === "string" ? rewatchStatus : undefined,
        };
      }
    }

    // Do not fall back to another item's status in a batch.
    return {};
  }

  /**
   * Simkl echoes request objects with extras (type, rating) and may coerce
   * numeric ids to strings / omit seasons. Match on stable identity fields.
   */
  private statusRequestMatchesEntry(
    entry: PreparedHistoryEntry,
    request: unknown
  ): boolean {
    if (!request || typeof request !== "object") {
      return false;
    }

    if (entry.kind === "movie") {
      return this.movieMatch(entry.movie, request);
    }
    if (entry.kind === "episode") {
      return this.episodeMatch(entry.episode, request);
    }

    const received = request as {
      title?: string;
      year?: number;
      ids?: SimklIds;
      type?: string;
    };
    if (received.type && received.type !== "show") {
      return false;
    }
    if (entry.show.title !== received.title) {
      return false;
    }
    if (
      entry.show.year != null &&
      received.year != null &&
      entry.show.year !== received.year
    ) {
      return false;
    }
    if (entry.show.ids && received.ids) {
      return this.idsOverlap(entry.show.ids, this.normalizeIds(received.ids));
    }
    return !entry.show.ids;
  }

  private normalizeIds(ids: Record<string, unknown>): SimklIds {
    const normalized: SimklIds = {};
    if (typeof ids.imdb === "string") {
      normalized.imdb = ids.imdb;
    }
    if (ids.tmdb != null && ids.tmdb !== "") {
      const tmdb = Number(ids.tmdb);
      if (Number.isFinite(tmdb)) {
        normalized.tmdb = tmdb;
      }
    }
    if (ids.tvdb != null && ids.tvdb !== "") {
      const tvdb = Number(ids.tvdb);
      if (Number.isFinite(tvdb)) {
        normalized.tvdb = tvdb;
      }
    }
    return normalized;
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
