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

export function buildSimklRewatchCacheKey(
  userId: string,
  event: MediaEvent
): string {
  if (event.media.type === "episode") {
    const showKey =
      event.media.tmdbSeriesId?.toString() ||
      event.media.title ||
      event.media.id;
    return `${userId}:show:${showKey}`;
  }

  const movieKey =
    event.media.imdbMovieId ||
    event.media.tmdbMovieId?.toString() ||
    event.media.tvdbMovieId?.toString() ||
    event.media.title ||
    event.media.id;
  return `${userId}:movie:${movieKey}`;
}

export function getCachedSimklRewatchId(cacheKey: string): number | undefined {
  return activeSessionIds.get(cacheKey);
}

export function setCachedSimklRewatchId(
  cacheKey: string,
  rewatchId: number
): void {
  activeSessionIds.set(cacheKey, rewatchId);
}

export function clearCachedSimklRewatchId(cacheKey: string): void {
  activeSessionIds.delete(cacheKey);
}

export function clearSimklRewatchSessionCache(): void {
  activeSessionIds.clear();
}
