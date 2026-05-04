/**
 * Simple in-memory cache for API responses with TTL.
 * Used to avoid refetching integration status/profile on every navigation.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiry) {
    if (entry) store.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T): void {
  store.set(key, {
    data,
    expiry: Date.now() + CACHE_TTL_MS,
  });
}

export function invalidateCached(key: string): void {
  store.delete(key);
}

export function invalidateCachedPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
