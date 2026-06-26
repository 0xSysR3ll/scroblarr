import { afterEach, describe, expect, it, vi } from "vitest";

import type { TmdbPosterLookupInput } from "./TmdbClient";
import {
  buildTmdbPosterCacheKey,
  clearTmdbPosterCache,
  getCachedTmdbPosterPath,
  setCachedTmdbPosterPath,
} from "./TmdbPosterCache";

const lookupInput: TmdbPosterLookupInput = {
  mediaType: "movie",
  tmdbMovieId: "123",
};

describe("TmdbPosterCache", () => {
  afterEach(() => {
    clearTmdbPosterCache();
  });

  it("builds stable cache keys from lookup identifiers", () => {
    expect(buildTmdbPosterCacheKey(lookupInput)).toBe("movie:123:::::");
  });

  it("stores and returns cached poster paths", () => {
    const key = buildTmdbPosterCacheKey(lookupInput);
    setCachedTmdbPosterPath(key, "/poster.jpg");

    expect(getCachedTmdbPosterPath(key)).toBe("/poster.jpg");
  });

  it("expires cached poster paths after the TTL", () => {
    const key = buildTmdbPosterCacheKey(lookupInput);
    setCachedTmdbPosterPath(key, "/poster.jpg");

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);

    expect(getCachedTmdbPosterPath(key)).toBeNull();
  });
});
