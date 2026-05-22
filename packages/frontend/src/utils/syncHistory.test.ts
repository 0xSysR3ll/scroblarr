import type { SyncHistoryItem } from "@services/api";
import type { TFunction } from "i18next";
import { describe, expect, it, vi, afterEach } from "vitest";

import {
  formatMediaTitle,
  formatRelativeTime,
  getDestinationResults,
  getPosterUrl,
  getSyncStatus,
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

  it("classifies sync status from success and error state", () => {
    expect(getSyncStatus(syncItem())).toBe("success");
    expect(getSyncStatus(syncItem({ errorMessage: "TVTime: duplicate" }))).toBe(
      "partial"
    );
    expect(getSyncStatus(syncItem({ success: false }))).toBe("failed");
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

  it("formats episode and movie titles with missing metadata", () => {
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

  it("formats relative times with translation fallbacks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:30:00.000Z"));
    const t = vi.fn((_key: string, options: { defaultValue: string }) => {
      return options.defaultValue.replace("{{count}}", "30");
    }) as unknown as TFunction;

    expect(formatRelativeTime("2026-01-01T12:00:00.000Z", t)).toBe("30m ago");
  });
});
