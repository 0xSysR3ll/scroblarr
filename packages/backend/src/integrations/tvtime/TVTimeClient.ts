import { MediaEvent } from "@scroblarr/shared";
import { logger } from "@utils/logger";
import { ISyncClient, SyncOptions } from "@integrations/common/ISyncClient";

export interface TVTimeScrobbleOptions {
  markMoviesAsRewatched?: boolean;
  markEpisodesAsRewatched?: boolean;
}

export class TVTimeClient implements ISyncClient {
  private static readonly BASE_URL = "app.tvtime.com";

  constructor() {}

  getName(): string {
    return "TVTime";
  }

  async scrobble(
    event: MediaEvent,
    accessToken: string,
    options?: SyncOptions
  ): Promise<void> {
    const tvtimeOptions: TVTimeScrobbleOptions = {
      markMoviesAsRewatched: options?.markMoviesAsRewatched,
      markEpisodesAsRewatched: options?.markEpisodesAsRewatched,
    };
    if (event.media.type === "episode") {
      await this.scrobbleEpisode(event, accessToken, tvtimeOptions);
    } else if (event.media.type === "movie") {
      await this.scrobbleMovie(event, accessToken, tvtimeOptions);
    } else {
      throw new Error(`Unsupported media type: ${event.media.type}`);
    }
  }

  private async scrobbleEpisode(
    event: MediaEvent,
    accessToken: string,
    options?: TVTimeScrobbleOptions
  ): Promise<void> {
    if (!event.media.tvdbEpisodeId) {
      throw new Error(
        "TVDB episode ID is required for TVTime scrobbling. Make sure Plex metadata includes TVDB GUID."
      );
    }

    const isRewatch = options?.markEpisodesAsRewatched ?? false;
    const apiUrl = `https://api2.tozelabs.com/v2/watched_episodes/episode/${event.media.tvdbEpisodeId}`;
    const encodedUrl = Buffer.from(apiUrl)
      .toString("base64")
      .replace(/=+$/, "");
    const watchUrl = `https://${TVTimeClient.BASE_URL}/sidecar?o_b64=${encodedUrl}&is_rewatch=${isRewatch ? 1 : 0}`;

    const response = await fetch(watchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        Host: `${TVTimeClient.BASE_URL}:80`,
      },
      body: JSON.stringify(""),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.tvtime.error(
        {
          status: response.status,
          errorText,
          tvdbEpisodeId: event.media.tvdbEpisodeId,
          showTitle: event.media.title,
        },
        "TVTime episode watch API error"
      );
      throw new Error(this.buildErrorMessage(response.status, errorText));
    }

    try {
      const result = (await response.json()) as { result?: string };
      if (result.result && result.result !== "OK") {
        logger.tvtime.error(
          { result: result.result, tvdbEpisodeId: event.media.tvdbEpisodeId },
          "TVTime API returned non-OK result"
        );
        throw new Error(`TVTime API returned non-OK result: ${result.result}`);
      }
    } catch (parseError) {
      logger.tvtime.warn(
        { error: parseError, tvdbEpisodeId: event.media.tvdbEpisodeId },
        "Could not parse TVTime scrobble response"
      );
    }
  }

  private async scrobbleMovie(
    event: MediaEvent,
    accessToken: string,
    options?: TVTimeScrobbleOptions
  ): Promise<void> {
    if (!event.media.title) {
      throw new Error("Movie title is required for TVTime scrobbling");
    }

    const movieUuid = await this.getMovieUuid(
      event.media.title,
      event.media.tvdbMovieId,
      event.media.imdbMovieId,
      accessToken
    );
    if (!movieUuid) {
      const idInfo = event.media.tvdbMovieId
        ? ` (TVDB ID: ${event.media.tvdbMovieId})`
        : event.media.imdbMovieId
          ? ` (IMDB ID: ${event.media.imdbMovieId})`
          : "";
      throw new Error(
        `Could not find movie UUID for "${event.media.title}"${idInfo}`
      );
    }

    const isRewatch = options?.markMoviesAsRewatched ?? false;
    const endpoint = isRewatch ? "rewatch" : "watch";
    const apiUrl = `https://msapi.tvtime.com/prod/v1/tracking/${movieUuid}/${endpoint}`;
    const encodedUrl = Buffer.from(apiUrl)
      .toString("base64")
      .replace(/=+$/, "");
    const watchUrl = `https://${TVTimeClient.BASE_URL}/sidecar?o_b64=${encodedUrl}`;

    const response = await fetch(watchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        Host: `${TVTimeClient.BASE_URL}:80`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.tvtime.error(
        {
          status: response.status,
          errorText,
          movieTitle: event.media.title,
          movieUuid,
        },
        "TVTime movie watch API error"
      );
      throw new Error(this.buildErrorMessage(response.status, errorText));
    }

    try {
      const result = (await response.json()) as { status?: string };
      if (result.status && result.status !== "success") {
        logger.tvtime.error(
          { status: result.status, movieUuid, movieTitle: event.media.title },
          "TVTime API returned non-success status"
        );
        throw new Error(
          `TVTime API returned non-success status: ${result.status}`
        );
      }
    } catch (parseError) {
      logger.tvtime.warn(
        { error: parseError, movieUuid, movieTitle: event.media.title },
        "Could not parse TVTime movie scrobble response"
      );
    }
  }

  private async getMovieUuid(
    movieTitle: string,
    tvdbMovieId: number | undefined,
    imdbMovieId: string | undefined,
    accessToken: string
  ): Promise<string | null> {
    const searchApiUrl = `https://search.tvtime.com/v1/search/series,movie`;
    const encodedUrl = Buffer.from(searchApiUrl)
      .toString("base64")
      .replace(/=+$/, "");

    // Search priority: TVDB ID > IMDB ID > Title
    const searchQuery = tvdbMovieId
      ? String(tvdbMovieId)
      : imdbMovieId
        ? imdbMovieId
        : movieTitle;
    const searchLimit = tvdbMovieId || imdbMovieId ? 12 : 24;

    const searchUrl = `https://${TVTimeClient.BASE_URL}/sidecar?o_b64=${encodedUrl}&q=${encodeURIComponent(searchQuery)}&offset=0&limit=${searchLimit}`;

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        Host: `${TVTimeClient.BASE_URL}:80`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.tvtime.error(
        {
          status: response.status,
          errorText,
          movieTitle,
          tvdbMovieId,
          imdbMovieId,
        },
        "TVTime movie search error"
      );
      return null;
    }

    try {
      const search = (await response.json()) as {
        status?: string;
        data?: Array<{ id: number; uuid?: string; imdb_id?: string }>;
      };

      if (search.status !== "success") {
        logger.tvtime.error(
          { status: search.status, movieTitle, tvdbMovieId, imdbMovieId },
          "TVTime movie search returned non-success status"
        );
        return null;
      }

      const movies = search.data || [];

      if (tvdbMovieId) {
        const matched = movies.find(
          (movie) => movie.id === tvdbMovieId && movie.uuid
        );
        if (matched?.uuid) {
          logger.tvtime.debug(
            { movieTitle, tvdbMovieId, movieUuid: matched.uuid, imdbMovieId },
            "Matched movie by TVDB ID"
          );
          return matched.uuid;
        }
      }

      if (imdbMovieId) {
        const matched = movies.find(
          (movie) => movie.imdb_id === imdbMovieId && movie.uuid
        );
        if (matched?.uuid) {
          logger.tvtime.debug(
            { movieTitle, imdbMovieId, movieUuid: matched.uuid, tvdbMovieId },
            "Matched movie by IMDB ID"
          );
          return matched.uuid;
        }
      }

      // Fallback to first result (only reliable when searching by ID, not title)
      if (movies.length > 0 && movies[0].uuid) {
        const searchMethod = tvdbMovieId
          ? "TVDB ID"
          : imdbMovieId
            ? "IMDB ID"
            : "title";
        if (searchMethod === "title") {
          logger.tvtime.warn(
            {
              movieTitle,
              tvdbMovieId,
              imdbMovieId,
              resultCount: movies.length,
            },
            "No ID match found, using first search result (may be incorrect)"
          );
        } else {
          logger.tvtime.debug(
            { movieTitle, searchMethod, movieUuid: movies[0].uuid },
            "Using first result from ID search"
          );
        }
        return movies[0].uuid;
      }

      logger.tvtime.warn(
        { movieTitle, tvdbMovieId, imdbMovieId, resultCount: movies.length },
        `No movie found for "${movieTitle}"${tvdbMovieId ? ` with TVDB ID ${tvdbMovieId}` : imdbMovieId ? ` with IMDB ID ${imdbMovieId}` : ""} in search results`
      );
      return null;
    } catch (parseError) {
      logger.tvtime.error(
        { error: parseError, movieTitle, tvdbMovieId, imdbMovieId },
        "Failed to parse TVTime movie search response"
      );
      return null;
    }
  }

  private decodeJwtPayload(token: string): Record<string, unknown> {
    try {
      if (!token || typeof token !== "string") {
        throw new Error("Token is not a valid string");
      }
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error(
          `Invalid JWT token format: expected 3 parts, got ${parts.length}`
        );
      }
      const payload = parts[1];
      if (!payload) {
        throw new Error("JWT payload is empty");
      }
      const paddedPayload =
        payload + "=".repeat((4 - (payload.length % 4)) % 4);
      const decoded = Buffer.from(paddedPayload, "base64").toString("utf-8");
      return JSON.parse(decoded);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to decode JWT token: ${errorMsg}`);
    }
  }

  private buildErrorMessage(status: number, errorText: string): string {
    const statusMessages: Record<number, string> = {
      400: "Bad Request - Invalid request parameters",
      401: "Unauthorized - Authentication failed",
      403: "Forbidden - Access denied",
      404: "Not Found - Resource not found",
      429: "Too Many Requests - Rate limit exceeded",
      500: "Internal Server Error - TVTime server error",
      502: "Bad Gateway - TVTime service temporarily unavailable",
      503: "Service Unavailable - TVTime service temporarily unavailable",
      504: "Gateway Timeout - TVTime service timeout",
    };

    const statusMessage = statusMessages[status] || `HTTP ${status}`;
    let errorMessage = `TVTime API error: ${statusMessage}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.message) {
        errorMessage = `${errorMessage} - ${errorJson.message}`;
      } else if (errorJson.error) {
        errorMessage = `${errorMessage} - ${errorJson.error}`;
      }
      return errorMessage;
    } catch {
      // Not JSON, might be HTML
    }

    if (errorText.trim().startsWith("<")) {
      const titleMatch = errorText.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const title = titleMatch[1].trim();
        if (title !== statusMessage && !title.includes("Bad Gateway")) {
          errorMessage = `${errorMessage} - ${title}`;
        }
      } else {
        const h1Match = errorText.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match && h1Match[1]) {
          const h1Text = h1Match[1].trim();
          if (h1Text !== statusMessage) {
            errorMessage = `${errorMessage} - ${h1Text}`;
          }
        }
      }
      return errorMessage;
    }

    const cleanText = errorText.trim();
    if (cleanText && cleanText.length < 200 && !cleanText.includes("<html>")) {
      errorMessage = `${errorMessage} - ${cleanText}`;
    }

    return errorMessage;
  }

  async getUserProfile(accessToken: string): Promise<{
    id?: string;
    username?: string;
    email?: string;
    image?: string;
  }> {
    const payload = this.decodeJwtPayload(accessToken);
    const userId = String(payload.id || payload.ID || "");

    if (!userId) {
      logger.tvtime.error({ payload }, "JWT payload missing user ID");
      throw new Error("User ID not found in JWT token");
    }

    const apiUrl = `https://api2.tozelabs.com/v2/user/${userId}/parameters`;
    const encodedUrl = Buffer.from(apiUrl)
      .toString("base64")
      .replace(/=+$/, "");
    const profileUrl = `https://${TVTimeClient.BASE_URL}/sidecar?o_b64=${encodedUrl}`;

    const response = await fetch(profileUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.tvtime.error(
        { status: response.status, errorText: responseText },
        "TVTime profile API error"
      );
      throw new Error(`TVTime API error: ${response.status} - ${responseText}`);
    }

    if (!responseText || responseText.trim() === "") {
      throw new Error("Empty response from TVTime API");
    }

    let data: {
      id?: string;
      login?: string;
      mail?: string;
      all_images?: { square?: string };
      image?: string;
      [key: string]: unknown;
    };
    try {
      data = JSON.parse(responseText) as typeof data;
    } catch (parseError) {
      logger.tvtime.error(
        { error: parseError, responseText },
        "Failed to parse TVTime profile response"
      );
      throw new Error(`Failed to parse TVTime profile response: ${parseError}`);
    }

    return {
      id: data?.id,
      username: data?.login,
      email: data?.mail,
      image: data?.all_images?.square || data?.image,
    };
  }
}
