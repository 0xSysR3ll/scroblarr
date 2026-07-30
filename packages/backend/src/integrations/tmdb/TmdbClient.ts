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
  number_of_seasons?: number;
  name?: string;
  original_name?: string;
  first_air_date?: string;
}

interface TmdbFindResult {
  movie_results?: Array<{ poster_path: string | null }>;
  tv_results?: Array<{ poster_path: string | null; id?: number }>;
  tv_episode_results?: Array<{ show_id?: number; still_path?: string | null }>;
}

interface TmdbSearchTvResult {
  results?: Array<{
    id: number;
    name?: string;
    original_name?: string;
    first_air_date?: string;
    poster_path?: string | null;
    popularity?: number;
  }>;
}

interface TmdbSearchMovieResult {
  results?: Array<{
    id: number;
    title?: string;
    original_title?: string;
    release_date?: string;
    poster_path?: string | null;
    popularity?: number;
  }>;
}

interface TmdbExternalIds {
  imdb_id?: string | null;
  tvdb_id?: number | null;
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

export interface TmdbTvSearchHit {
  id: number;
  name?: string;
  originalName?: string;
  firstAirDate?: string;
  popularity?: number;
}

export interface TmdbMovieSearchHit {
  id: number;
  title?: string;
  originalTitle?: string;
  releaseDate?: string;
  popularity?: number;
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

  async searchTv(
    query: string,
    year?: number | null
  ): Promise<TmdbTvSearchHit[]> {
    const params = new URLSearchParams({
      query,
      include_adult: "false",
    });
    // Year can be null/NaN from nullable DB columns / webhook payloads.
    if (typeof year === "number" && Number.isFinite(year)) {
      params.set("first_air_date_year", year.toString());
    }

    const result = await this.apiGet<TmdbSearchTvResult>(
      `/search/tv?${params.toString()}`
    );

    return (result?.results ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      originalName: item.original_name,
      firstAirDate: item.first_air_date,
      popularity: item.popularity,
    }));
  }

  async searchMovie(
    query: string,
    year?: number | null
  ): Promise<TmdbMovieSearchHit[]> {
    const params = new URLSearchParams({
      query,
      include_adult: "false",
    });
    // Year can be null/NaN from nullable DB columns / webhook payloads.
    if (typeof year === "number" && Number.isFinite(year)) {
      params.set("year", year.toString());
    }

    const result = await this.apiGet<TmdbSearchMovieResult>(
      `/search/movie?${params.toString()}`
    );

    return (result?.results ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      originalTitle: item.original_title,
      releaseDate: item.release_date,
      popularity: item.popularity,
    }));
  }

  async getTvShowDetails(seriesId: string | number): Promise<{
    id: number;
    name?: string;
    originalName?: string;
    posterPath?: string | null;
    numberOfSeasons?: number;
    firstAirDate?: string;
  } | null> {
    const details = await this.getTvDetails(seriesId.toString());
    if (!details) {
      return null;
    }

    return {
      id: typeof seriesId === "number" ? seriesId : Number(seriesId),
      name: details.name,
      originalName: details.original_name,
      posterPath: details.poster_path,
      numberOfSeasons: details.number_of_seasons,
      firstAirDate: details.first_air_date,
    };
  }

  async getTvRecommendations(
    seriesId: string | number
  ): Promise<TmdbTvSearchHit[]> {
    const result = await this.apiGet<TmdbSearchTvResult>(
      `/tv/${seriesId}/recommendations`
    );

    return (result?.results ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      originalName: item.original_name,
      firstAirDate: item.first_air_date,
      popularity: item.popularity,
    }));
  }

  async getTvExternalIds(seriesId: string | number): Promise<{
    imdbId?: string;
    tvdbId?: number;
  } | null> {
    const result = await this.apiGet<TmdbExternalIds>(
      `/tv/${seriesId}/external_ids`
    );
    if (!result) {
      return null;
    }

    return {
      imdbId: result.imdb_id ?? undefined,
      tvdbId: result.tvdb_id ?? undefined,
    };
  }

  async getMovieExternalIds(
    movieId: string | number
  ): Promise<{ imdbId?: string } | null> {
    // TMDB movie external_ids does not include tvdb_id (TV/episode only).
    const result = await this.apiGet<TmdbExternalIds>(
      `/movie/${movieId}/external_ids`
    );
    if (!result) {
      return null;
    }

    return {
      imdbId: result.imdb_id ?? undefined,
    };
  }

  async getEpisodeExternalIds(
    seriesId: string | number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<{ imdbId?: string; tvdbId?: number } | null> {
    const result = await this.apiGet<TmdbExternalIds>(
      `/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}/external_ids`
    );
    if (!result) {
      return null;
    }

    return {
      imdbId: result.imdb_id ?? undefined,
      tvdbId: result.tvdb_id ?? undefined,
    };
  }

  async hasTvSeason(
    seriesId: string | number,
    seasonNumber: number
  ): Promise<boolean> {
    const season = await this.apiGet<{ season_number?: number }>(
      `/tv/${seriesId}/season/${seasonNumber}`
    );
    return season !== null;
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
