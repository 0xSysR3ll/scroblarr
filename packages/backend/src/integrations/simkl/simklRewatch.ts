import { MediaEvent } from "@scroblarr/shared";

export type SimklAccountType = "free" | "pro" | "vip";

const SUCCESSFUL_REWATCH_STATUSES = new Set(["active", "completed", "closed"]);

const activeSessionIds = new Map<string, number>();

export function isSimklRewatchPlan(
  accountType: string | null | undefined
): boolean {
  return accountType === "pro" || accountType === "vip";
}

export function normalizeSimklAccountType(
  value: unknown
): SimklAccountType | null {
  if (value === "free" || value === "pro" || value === "vip") {
    return value;
  }
  return null;
}

export function isSuccessfulSimklRewatchStatus(
  status: string | null | undefined
): boolean {
  return !!status && SUCCESSFUL_REWATCH_STATUSES.has(status);
}

function titleFallbackKey(title: string, year: number | undefined): string {
  return year != null ? `${title}:${year}` : title;
}

/**
 * Candidate cache keys for one media item, highest-priority first.
 * Lookups try every candidate so a pin stored under title still matches
 * after TMDB enrichment (and the reverse).
 */
export function buildSimklRewatchCacheKeyCandidates(
  userId: string,
  event: MediaEvent
): string[] {
  const keys: string[] = [];

  if (event.media.type === "episode") {
    if (event.media.tmdbSeriesId != null) {
      keys.push(`${userId}:show:tmdb:${event.media.tmdbSeriesId}`);
    }
    if (event.media.title) {
      keys.push(
        `${userId}:show:${titleFallbackKey(event.media.title, event.media.year)}`
      );
    }
    keys.push(`${userId}:show:${event.media.id}`);
  } else {
    if (event.media.imdbMovieId) {
      keys.push(`${userId}:movie:imdb:${event.media.imdbMovieId}`);
    }
    if (event.media.tmdbMovieId != null) {
      keys.push(`${userId}:movie:tmdb:${event.media.tmdbMovieId}`);
    }
    if (event.media.tvdbMovieId != null) {
      keys.push(`${userId}:movie:tvdb:${event.media.tvdbMovieId}`);
    }
    if (event.media.title) {
      keys.push(
        `${userId}:movie:${titleFallbackKey(event.media.title, event.media.year)}`
      );
    }
    keys.push(`${userId}:movie:${event.media.id}`);
  }

  return [...new Set(keys)];
}

export function buildSimklRewatchCacheKey(
  userId: string,
  event: MediaEvent
): string {
  return buildSimklRewatchCacheKeyCandidates(userId, event)[0];
}

export function getCachedSimklRewatchId(cacheKey: string): number | undefined {
  return activeSessionIds.get(cacheKey);
}

export function getCachedSimklRewatchIdForEvent(
  userId: string,
  event: MediaEvent
): number | undefined {
  for (const key of buildSimklRewatchCacheKeyCandidates(userId, event)) {
    const pinned = activeSessionIds.get(key);
    if (typeof pinned === "number") {
      return pinned;
    }
  }
  return undefined;
}

export function setCachedSimklRewatchId(
  cacheKey: string,
  rewatchId: number
): void {
  activeSessionIds.set(cacheKey, rewatchId);
}

export function setCachedSimklRewatchIdForEvent(
  userId: string,
  event: MediaEvent,
  rewatchId: number
): void {
  for (const key of buildSimklRewatchCacheKeyCandidates(userId, event)) {
    activeSessionIds.set(key, rewatchId);
  }
}

export function clearCachedSimklRewatchId(cacheKey: string): void {
  activeSessionIds.delete(cacheKey);
}

export function clearSimklRewatchSessionCacheForUser(userId: string): void {
  const prefix = `${userId}:`;
  for (const key of activeSessionIds.keys()) {
    if (key.startsWith(prefix)) {
      activeSessionIds.delete(key);
    }
  }
}

export function clearSimklRewatchSessionCache(): void {
  activeSessionIds.clear();
}
