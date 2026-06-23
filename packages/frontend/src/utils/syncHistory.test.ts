import type { SyncHistoryItem } from "@services/api";
import type { TFunction } from "i18next";
import { describe, expect, it, vi, afterEach } from "vitest";

import {
  formatMediaTitle,
  formatRelativeTime,
  getDestinationResults,
  getPosterUrl,
  getSyncStatus,
  isRetryableSyncItem,
  shouldShowRewatchedBadge,
} from "./syncHistory";

function syncItem(overrides: Partial<SyncHistoryItem> = {}): SyncHistoryItem {
  return {
    id: "history-1",
    userId: "user-1",
    username: "alice",
    mediaType: "episode",
    mediaTitle: "Example Show",
    source: "plex",
    success: true,
    syncedAt: "2026-01-01T12:00:00.000Z",
    destinations: ["Trakt", "TVTime"],
    ...overrides,
  };
}

describe("sync history utils", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses structured destination results when present", () => {
    expect(
      getDestinationResults(
        syncItem({
          destinations: ["Simkl"],
          destinationResults: {
            TVTime: { status: "success" },
            Trakt: { status: "success" },
            Simkl: { status: "failed", error: "could not match" },
          },
        })
      )
    ).toEqual([
      { name: "TVTime", status: "success" },
      { name: "Trakt", status: "success" },
      {
        name: "Simkl",
        status: "failed",
        errorMessage: "could not match",
      },
    ]);
    expect(
      getSyncStatus(
        syncItem({
          destinations: ["Simkl"],
          destinationResults: {
            TVTime: { status: "success" },
            Trakt: { status: "success" },
            Simkl: { status: "failed", error: "could not match" },
          },
        })
      )
    ).toBe("partial");
  });

  it("classifies structured sync status for full success and full failure", () => {
    expect(
      getSyncStatus(
        syncItem({
          destinationResults: {
            TVTime: { status: "success" },
            Trakt: { status: "success" },
          },
        })
      )
    ).toBe("success");

    expect(
      getSyncStatus(
        syncItem({
          success: true,
          destinationResults: {
            TVTime: { status: "failed", error: "down" },
            Trakt: { status: "failed", error: "401" },
          },
        })
      )
    ).toBe("failed");
  });

  it("returns only destinations present in structured results", () => {
    expect(
      getDestinationResults(
        syncItem({
          destinationResults: {
            TVTime: { status: "success" },
          },
        })
      )
    ).toEqual([{ name: "TVTime", status: "success" }]);
  });

  it("marks all-failed structured items as retryable", () => {
    expect(
      isRetryableSyncItem(
        syncItem({
          success: true,
          destinationResults: {
            TVTime: { status: "failed", error: "down" },
          },
        })
      )
    ).toBe(true);
  });

  it("classifies sync status from success and error state", () => {
    expect(getSyncStatus(syncItem())).toBe("success");
    expect(getSyncStatus(syncItem({ errorMessage: "TVTime: duplicate" }))).toBe(
      "partial"
    );
    expect(getSyncStatus(syncItem({ success: false }))).toBe("failed");
  });

  it("marks failed and partial items as retryable", () => {
    expect(isRetryableSyncItem(syncItem())).toBe(false);
    expect(
      isRetryableSyncItem(syncItem({ errorMessage: "TVTime: duplicate" }))
    ).toBe(true);
    expect(isRetryableSyncItem(syncItem({ success: false }))).toBe(true);
  });

  it("returns successful destinations from legacy fields without errors", () => {
    expect(getDestinationResults(syncItem())).toEqual([
      { name: "TVTime", status: "success" },
      { name: "Trakt", status: "success" },
    ]);
  });

  it("maps destination-specific partial failures", () => {
    expect(
      getDestinationResults(
        syncItem({
          destinations: ["Trakt"],
          errorMessage: "TVTime: already marked watched",
        })
      )
    ).toEqual([
      {
        name: "TVTime",
        status: "failed",
        errorMessage: "already marked watched",
      },
      { name: "Trakt", status: "success" },
    ]);
  });

  it("maps Simkl destination failures", () => {
    expect(
      getDestinationResults(
        syncItem({
          destinations: ["Trakt", "TVTime"],
          errorMessage: "Simkl: rate limited",
        })
      )
    ).toEqual([
      { name: "TVTime", status: "success" },
      { name: "Trakt", status: "success" },
      {
        name: "Simkl",
        status: "failed",
        errorMessage: "rate limited",
      },
    ]);
  });

  it("maps mixed-order destination failures to the right destination", () => {
    expect(
      getDestinationResults(
        syncItem({
          success: false,
          destinations: [],
          errorMessage: "Simkl: error1; Trakt: error2; TVTime: error3",
        })
      )
    ).toEqual([
      {
        name: "TVTime",
        status: "failed",
        errorMessage: "error3",
      },
      {
        name: "Trakt",
        status: "failed",
        errorMessage: "error2",
      },
      {
        name: "Simkl",
        status: "failed",
        errorMessage: "error1",
      },
    ]);
  });

  it("only shows rewatched badges for successful TVTime syncs", () => {
    expect(shouldShowRewatchedBadge(syncItem({ wasRewatched: true }))).toBe(
      true
    );
    expect(
      shouldShowRewatchedBadge(
        syncItem({ destinations: ["Trakt"], wasRewatched: true })
      )
    ).toBe(false);
  });

  it("proxies Jellyfin poster URLs through the backend", () => {
    expect(
      getPosterUrl(
        syncItem({
          id: "poster-1",
          posterUrl: "https://jellyfin.example.test/image.jpg",
          source: "jellyfin",
        })
      )
    ).toBe("/api/v1/sync/poster/poster-1");
  });

  it("formats episode and movie titles with complete metadata", () => {
    expect(
      formatMediaTitle(
        syncItem({
          mediaTitle: "Example Show",
          seasonNumber: 2,
          episodeNumber: 5,
        })
      )
    ).toBe("Example Show S2E5");

    expect(
      formatMediaTitle(
        syncItem({
          mediaType: "movie",
          mediaTitle: "Example Movie",
          year: 2026,
        })
      )
    ).toBe("Example Movie (2026)");
  });

  it("formats media titles with missing metadata", () => {
    expect(formatMediaTitle(syncItem({ mediaTitle: "Example Show" }))).toBe(
      "Example Show"
    );

    expect(
      formatMediaTitle(
        syncItem({
          mediaType: "movie",
          mediaTitle: "Example Movie",
        })
      )
    ).toBe("Example Movie");
  });

  it("formats relative times with translation fallbacks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:30:00.000Z"));
    const t = vi.fn(
      (key: string, options: { count: number; defaultValue: string }) => {
        expect(key).toBe("sync.time.minutesAgo");
        expect(options.count).toBe(30);
        return options.defaultValue.replace("{{count}}", String(options.count));
      }
    ) as unknown as TFunction;

    expect(formatRelativeTime("2026-01-01T12:00:00.000Z", t)).toBe("30m ago");
  });
});
