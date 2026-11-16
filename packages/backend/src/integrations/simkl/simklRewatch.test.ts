import type { MediaEvent } from "@scroblarr/shared";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildSimklRewatchCacheKey,
  buildSimklRewatchCacheKeyCandidates,
  clearCachedSimklRewatchId,
  clearSimklRewatchSessionCache,
  clearSimklRewatchSessionCacheForUser,
  getCachedSimklRewatchId,
  getCachedSimklRewatchIdForEvent,
  isSimklRewatchPlan,
  isSuccessfulSimklRewatchStatus,
  normalizeSimklAccountType,
  setCachedSimklRewatchId,
  setCachedSimklRewatchIdForEvent,
} from "./simklRewatch";

describe("simklRewatch helpers", () => {
  afterEach(() => {
    clearSimklRewatchSessionCache();
  });

  it("recognizes PRO and VIP plans only", () => {
    expect(isSimklRewatchPlan("pro")).toBe(true);
    expect(isSimklRewatchPlan("vip")).toBe(true);
    expect(isSimklRewatchPlan("free")).toBe(false);
    expect(isSimklRewatchPlan(null)).toBe(false);
  });

  it("normalizes account types", () => {
    expect(normalizeSimklAccountType("pro")).toBe("pro");
    expect(normalizeSimklAccountType("unknown")).toBeNull();
  });

  it("treats active/completed/closed as successful rewatch statuses", () => {
    expect(isSuccessfulSimklRewatchStatus("active")).toBe(true);
    expect(isSuccessfulSimklRewatchStatus("completed")).toBe(true);
    expect(isSuccessfulSimklRewatchStatus("closed")).toBe(true);
    expect(isSuccessfulSimklRewatchStatus("too_soon")).toBe(false);
    expect(isSuccessfulSimklRewatchStatus(null)).toBe(false);
  });

  it("pins rewatch ids by show or movie identity", () => {
    const episodeEvent = {
      media: {
        type: "episode",
        tmdbSeriesId: 1399,
        title: "Game of Thrones",
        id: "ep-1",
      },
    } as MediaEvent;
    const key = buildSimklRewatchCacheKey("user-1", episodeEvent);
    expect(key).toBe("user-1:show:tmdb:1399");
    setCachedSimklRewatchId(key, 7482);
    expect(getCachedSimklRewatchId(key)).toBe(7482);
    clearCachedSimklRewatchId(key);
    expect(getCachedSimklRewatchId(key)).toBeUndefined();
  });

  it("namespaces provider ids and includes year in title fallbacks", () => {
    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: { type: "episode", title: "Show", year: 2011, id: "ep-1" },
      } as MediaEvent)
    ).toBe("user-1:show:Show:2011");

    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: { type: "episode", title: "Show", id: "ep-1" },
      } as MediaEvent)
    ).toBe("user-1:show:Show");

    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: { type: "episode", id: "ep-1" },
      } as MediaEvent)
    ).toBe("user-1:show:ep-1");

    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: {
          type: "movie",
          tmdbMovieId: 550,
          title: "Fight Club",
          id: "m1",
        },
      } as MediaEvent)
    ).toBe("user-1:movie:tmdb:550");

    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: {
          type: "movie",
          tvdbMovieId: 42,
          title: "Fight Club",
          id: "m1",
        },
      } as MediaEvent)
    ).toBe("user-1:movie:tvdb:42");

    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: {
          type: "movie",
          imdbMovieId: "tt0137523",
          tmdbMovieId: 550,
          id: "m1",
        },
      } as MediaEvent)
    ).toBe("user-1:movie:imdb:tt0137523");

    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: { type: "movie", title: "Fight Club", year: 1999, id: "m1" },
      } as MediaEvent)
    ).toBe("user-1:movie:Fight Club:1999");

    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: { type: "movie", id: "m1" },
      } as MediaEvent)
    ).toBe("user-1:movie:m1");
  });

  it("resolves a title-pinned show after TMDB enrichment", () => {
    const titleOnly = {
      media: {
        type: "episode",
        title: "Game of Thrones",
        year: 2011,
        id: "ep-1",
      },
    } as MediaEvent;
    setCachedSimklRewatchIdForEvent("user-1", titleOnly, 100);

    const enriched = {
      media: {
        type: "episode",
        tmdbSeriesId: 1399,
        title: "Game of Thrones",
        year: 2011,
        id: "ep-2",
      },
    } as MediaEvent;
    expect(getCachedSimklRewatchIdForEvent("user-1", enriched)).toBe(100);
    expect(buildSimklRewatchCacheKeyCandidates("user-1", enriched)).toEqual([
      "user-1:show:tmdb:1399",
      "user-1:show:Game of Thrones:2011",
      "user-1:show:ep-2",
    ]);
  });

  it("clears only one user's pinned sessions", () => {
    setCachedSimklRewatchId("user-1:movie:imdb:tt1", 1);
    setCachedSimklRewatchId("user-2:movie:imdb:tt2", 2);
    clearSimklRewatchSessionCacheForUser("user-1");
    expect(getCachedSimklRewatchId("user-1:movie:imdb:tt1")).toBeUndefined();
    expect(getCachedSimklRewatchId("user-2:movie:imdb:tt2")).toBe(2);
  });

  it("returns undefined when no candidate key is pinned", () => {
    expect(
      getCachedSimklRewatchIdForEvent("user-1", {
        media: { type: "movie", title: "Missing", id: "m1" },
      } as MediaEvent)
    ).toBeUndefined();
  });
});
