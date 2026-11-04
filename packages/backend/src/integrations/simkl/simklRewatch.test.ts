import type { MediaEvent } from "@scroblarr/shared";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildSimklRewatchCacheKey,
  clearCachedSimklRewatchId,
  clearSimklRewatchSessionCache,
  getCachedSimklRewatchId,
  isSimklRewatchPlan,
  isSuccessfulSimklRewatchStatus,
  normalizeSimklAccountType,
  setCachedSimklRewatchId,
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
    expect(key).toBe("user-1:show:1399");
    setCachedSimklRewatchId(key, 7482);
    expect(getCachedSimklRewatchId(key)).toBe(7482);
    clearCachedSimklRewatchId(key);
    expect(getCachedSimklRewatchId(key)).toBeUndefined();
  });

  it("falls back to title or id when building cache keys", () => {
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
    ).toBe("user-1:movie:550");

    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: {
          type: "movie",
          tvdbMovieId: 42,
          title: "Fight Club",
          id: "m1",
        },
      } as MediaEvent)
    ).toBe("user-1:movie:42");

    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: { type: "movie", title: "Fight Club", id: "m1" },
      } as MediaEvent)
    ).toBe("user-1:movie:Fight Club");

    expect(
      buildSimklRewatchCacheKey("user-1", {
        media: { type: "movie", id: "m1" },
      } as MediaEvent)
    ).toBe("user-1:movie:m1");
  });
});
