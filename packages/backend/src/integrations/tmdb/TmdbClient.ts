import { TmdbRateLimitError } from "./TmdbApiError";
import { buildTmdbImageUrl } from "./tmdbConfig";
import {
  buildTmdbPosterCacheKey,
  getCachedTmdbPosterPath,
  setCachedTmdbPosterPath,
} from "./TmdbPosterCache";

const TMDB_API_BASE = "https://api.themoviedb.org/3";

interface TmdbMediaDetails {
  poster_path: string | null;
}

interface TmdbFindResult {
  movie_results?: Array<{ poster_path: string | null }>;
  tv_results?: Array<{ poster_path: string | null; id?: number }>;
  tv_episode_results?: Array<{ show_id?: number; still_path?: string | null }>;
}

export interface TmdbPosterLookupInput {
  mediaType: string;
  tmdbMovieId?: string | null;
  tmdbSeriesId?: string | null;
  imdbMovieId?: string | null;
  imdbEpisodeId?: string | null;
  tvdbMovieId?: string | null;
  tvdbEpisodeId?: string | null;
}

export class TmdbClient {
  constructor(private readonly accessToken: string) {}

  async resolvePosterPath(
    input: TmdbPosterLookupInput
  ): Promise<string | null> {
    const cacheKey = buildTmdbPosterCacheKey(input);
    const cachedPosterPath = getCachedTmdbPosterPath(cacheKey);
    if (cachedPosterPath) {
      return cachedPosterPath;
    }

    let posterPath: string | null = null;
    if (input.mediaType === "movie") {
      posterPath = await this.resolveMoviePosterPath(input);
    } else if (input.mediaType === "episode") {
      posterPath = await this.resolveEpisodePosterPath(input);
    }

    if (posterPath) {
      setCachedTmdbPosterPath(cacheKey, posterPath);
    }

    return posterPath;
  }

  async fetchPosterImage(
    posterPath: string
  ): Promise<{ buffer: ArrayBuffer; contentType: string }> {
    const imageUrl = buildTmdbImageUrl(posterPath);
    const response = await fetch(imageUrl, {
      headers: { Accept: "image/*" },
    });

    if (!response.ok) {
      throw new Error(`TMDB image fetch failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();
    return { buffer, contentType };
  }

  private async resolveMoviePosterPath(
    input: TmdbPosterLookupInput
  ): Promise<string | null> {
    if (input.tmdbMovieId) {
      const details = await this.getMovieDetails(input.tmdbMovieId);
      if (details?.poster_path) {
        return details.poster_path;
      }
    }

    if (input.imdbMovieId) {
      const posterPath = await this.findPosterPath(
        input.imdbMovieId,
        "imdb_id",
        "movie"
      );
      if (posterPath) {
        return posterPath;
      }
    }

    if (input.tvdbMovieId) {
      const posterPath = await this.findPosterPath(
        input.tvdbMovieId,
        "tvdb_id",
        "movie"
      );
      if (posterPath) {
        return posterPath;
      }
    }

    return null;
  }

  private async resolveEpisodePosterPath(
    input: TmdbPosterLookupInput
  ): Promise<string | null> {
    if (input.tmdbSeriesId) {
      const details = await this.getTvDetails(input.tmdbSeriesId);
      if (details?.poster_path) {
        return details.poster_path;
      }
    }

    if (input.imdbEpisodeId) {
      const showId = await this.findEpisodeShowId(
        input.imdbEpisodeId,
        "imdb_id"
      );
      if (showId) {
        const details = await this.getTvDetails(showId.toString());
        if (details?.poster_path) {
          return details.poster_path;
        }
      }
    }

    if (input.tvdbEpisodeId) {
      const showId = await this.findEpisodeShowId(
        input.tvdbEpisodeId,
        "tvdb_id"
      );
      if (showId) {
        const details = await this.getTvDetails(showId.toString());
        if (details?.poster_path) {
          return details.poster_path;
        }
      }
    }

    return null;
  }

  private async getMovieDetails(
    movieId: string
  ): Promise<TmdbMediaDetails | null> {
    return this.apiGet<TmdbMediaDetails>(`/movie/${movieId}`);
  }

  private async getTvDetails(
    seriesId: string
  ): Promise<TmdbMediaDetails | null> {
    return this.apiGet<TmdbMediaDetails>(`/tv/${seriesId}`);
  }

  private async findEpisodeShowId(
    externalId: string,
    externalSource: "imdb_id" | "tvdb_id"
  ): Promise<number | null> {
    const result = await this.apiGet<TmdbFindResult>(
      `/find/${encodeURIComponent(externalId)}?external_source=${externalSource}`
    );
    const episode = result?.tv_episode_results?.[0];
    return episode?.show_id ?? null;
  }

  private async findPosterPath(
    externalId: string,
    externalSource: "imdb_id" | "tvdb_id",
    mediaKind: "movie" | "tv"
  ): Promise<string | null> {
    const result = await this.apiGet<TmdbFindResult>(
      `/find/${encodeURIComponent(externalId)}?external_source=${externalSource}`
    );

    if (mediaKind === "movie") {
      return result?.movie_results?.[0]?.poster_path ?? null;
    }

    return result?.tv_results?.[0]?.poster_path ?? null;
  }

  private async apiGet<T>(path: string): Promise<T | null> {
    const response = await fetch(`${TMDB_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (response.status === 429) {
      throw new TmdbRateLimitError();
    }

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}
