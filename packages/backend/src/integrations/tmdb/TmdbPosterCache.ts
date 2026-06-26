import type { TmdbPosterLookupInput } from "./TmdbClient";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  posterPath: string;
  expiry: number;
}

const posterPathCache = new Map<string, CacheEntry>();

export function buildTmdbPosterCacheKey(input: TmdbPosterLookupInput): string {
  return [
    input.mediaType,
    input.tmdbMovieId ?? "",
    input.tmdbSeriesId ?? "",
    input.imdbMovieId ?? "",
    input.imdbEpisodeId ?? "",
    input.tvdbMovieId ?? "",
    input.tvdbEpisodeId ?? "",
  ].join(":");
}

export function getCachedTmdbPosterPath(key: string): string | null {
  const entry = posterPathCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiry) {
    posterPathCache.delete(key);
    return null;
  }

  return entry.posterPath;
}

export function setCachedTmdbPosterPath(key: string, posterPath: string): void {
  posterPathCache.set(key, {
    posterPath,
    expiry: Date.now() + CACHE_TTL_MS,
  });
}

export function clearTmdbPosterCache(): void {
  posterPathCache.clear();
}
