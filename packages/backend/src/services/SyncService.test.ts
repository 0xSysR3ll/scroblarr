import type { MediaEvent } from "@scroblarr/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findBySourceUsername: vi.fn(),
  findByJellyfinUserId: vi.fn(),
  findById: vi.fn(),
}));

const syncHistoryRepositoryMocks = vi.hoisted(() => ({
  hasExistingSync: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  clearOldByUser: vi.fn(),
}));

const settingsRepositoryMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  get: vi.fn(),
}));

const tvtimeClientMocks = vi.hoisted(() => ({
  scrobble: vi.fn(),
}));

const traktClientMocks = vi.hoisted(() => ({
  scrobble: vi.fn(),
}));

const tvtimeTokenManagerMocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
}));

const traktTokenManagerMocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findBySourceUsername = userRepositoryMocks.findBySourceUsername;
    findByJellyfinUserId = userRepositoryMocks.findByJellyfinUserId;
    findById = userRepositoryMocks.findById;
  },
}));

vi.mock("@repositories/SyncHistoryRepository", () => ({
  SyncHistoryRepository: class {
    hasExistingSync = syncHistoryRepositoryMocks.hasExistingSync;
    create = syncHistoryRepositoryMocks.create;
    save = syncHistoryRepositoryMocks.save;
    clearOldByUser = syncHistoryRepositoryMocks.clearOldByUser;
  },
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    getAll = settingsRepositoryMocks.getAll;
    get = settingsRepositoryMocks.get;
  },
}));

vi.mock("@integrations/tvtime/TVTimeClient", () => ({
  TVTimeClient: class {
    scrobble = tvtimeClientMocks.scrobble;
  },
}));

vi.mock("@integrations/trakt/TraktClient", () => ({
  TraktClient: class {
    scrobble = traktClientMocks.scrobble;
  },
}));

vi.mock("@integrations/tvtime/TVTimeTokenManager", () => ({
  TVTimeTokenManager: class {
    getValidAccessToken = tvtimeTokenManagerMocks.getValidAccessToken;
  },
}));

vi.mock("@integrations/trakt/TraktTokenManager", () => ({
  TraktTokenManager: class {
    getValidAccessToken = traktTokenManagerMocks.getValidAccessToken;
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    sync: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}));

import { SyncService } from "./SyncService";

function makeEvent(overrides?: Partial<MediaEvent>): MediaEvent {
  return {
    event: "scrobble",
    source: "plex",
    userId: "plex-user",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    media: {
      id: "m1",
      type: "movie",
      title: "Interstellar",
      year: 2014,
      tvdbMovieId: 123,
      posterUrl: "https://img/poster.jpg",
    },
    ...overrides,
  };
}

describe("SyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsRepositoryMocks.get.mockResolvedValue("100");
    settingsRepositoryMocks.getAll.mockResolvedValue({});
    syncHistoryRepositoryMocks.clearOldByUser.mockResolvedValue(0);
  });

  it("ignores non-scrobble events", async () => {
    const service = new SyncService();
    await service.syncEvent(makeEvent({ event: "playing" }));
    expect(userRepositoryMocks.findBySourceUsername).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.create).not.toHaveBeenCalled();
  });

  it("records failed history when user is disabled", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: false,
      plexUsername: "plex-user",
    });

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        originalMediaId: "m1",
        success: false,
        errorMessage: "User account is disabled",
      })
    );
  });

  it("records failed history when no sync destinations are configured", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      tvtimeAccessToken: null,
      traktAccessToken: null,
    });

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        originalMediaId: "m1",
        success: false,
        errorMessage: "No sync destinations configured",
      })
    );
  });

  it("syncs to TVTime and records rewatched state when previous sync exists", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      tvtimeAccessToken: "tv-token",
      tvtimeMarkMoviesAsRewatched: true,
      tvtimeMarkEpisodesAsRewatched: false,
      traktAccessToken: null,
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(true);
    tvtimeTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "tvtime-valid-token"
    );
    tvtimeClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(tvtimeClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({ event: "scrobble" }),
      "tvtime-valid-token",
      expect.objectContaining({ markMoviesAsRewatched: true })
    );
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        originalMediaId: "m1",
        success: true,
        wasRewatched: true,
        destinations: JSON.stringify(["TVTime"]),
      })
    );
  });

  it("retries a failed history item using the linked media server account", async () => {
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    tvtimeTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "tvtime-valid-token"
    );
    tvtimeClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    const result = await service.retryHistoryItem({
      id: "sync-history-id",
      userId: "u1",
      user: {
        id: "u1",
        enabled: true,
        plexUsername: "plex-user",
        tvtimeAccessToken: "tv-token",
        tvtimeMarkMoviesAsRewatched: false,
        tvtimeMarkEpisodesAsRewatched: false,
        traktAccessToken: null,
      },
      mediaType: "movie",
      mediaTitle: "Interstellar",
      source: "plex",
      originalMediaId: "plex-media-id",
      tvdbMovieId: "123",
      tmdbMovieId: "456",
      posterUrl: "https://img/poster.jpg",
      year: 2014,
      success: false,
      syncedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    expect(result).toEqual({
      success: true,
      destinations: ["TVTime"],
      errorMessage: undefined,
    });
    expect(tvtimeClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "scrobble",
        source: "plex",
        userId: "plex-user",
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
        media: expect.objectContaining({
          id: "plex-media-id",
          type: "movie",
          title: "Interstellar",
          tvdbMovieId: 123,
          tmdbMovieId: 456,
        }),
      }),
      "tvtime-valid-token",
      expect.any(Object)
    );
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        originalMediaId: "plex-media-id",
        success: true,
        destinations: JSON.stringify(["TVTime"]),
      })
    );
    expect(syncHistoryRepositoryMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sync-history-id",
        success: true,
        errorMessage: undefined,
        retriedAt: expect.any(Date),
        destinations: JSON.stringify(["TVTime"]),
      })
    );
  });

  it("retries only the destination that failed on the history item", async () => {
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    tvtimeTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "tvtime-valid-token"
    );
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "trakt-valid-token"
    );
    tvtimeClientMocks.scrobble.mockResolvedValue(undefined);
    traktClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    const result = await service.retryHistoryItem({
      id: "sync-history-id",
      userId: "u1",
      user: {
        id: "u1",
        enabled: true,
        plexUsername: "plex-user",
        tvtimeAccessToken: "tv-token",
        tvtimeMarkMoviesAsRewatched: false,
        tvtimeMarkEpisodesAsRewatched: false,
        traktClientId: "trakt-client-id",
        traktClientSecret: "trakt-secret",
        traktAccessToken: "trakt-token",
      },
      mediaType: "movie",
      mediaTitle: "Interstellar",
      source: "plex",
      originalMediaId: "plex-media-id",
      tvdbMovieId: "123",
      success: false,
      errorMessage: "TVTime: TVTime failed",
      syncedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    expect(result).toEqual({
      success: true,
      destinations: ["TVTime"],
      errorMessage: undefined,
    });
    expect(tvtimeClientMocks.scrobble).toHaveBeenCalledTimes(1);
    expect(traktClientMocks.scrobble).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sync-history-id",
        success: true,
        errorMessage: undefined,
        destinations: JSON.stringify(["TVTime"]),
      })
    );
  });

  it("keeps a retried history item retryable when retry only partially succeeds", async () => {
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    tvtimeTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "tvtime-valid-token"
    );
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "trakt-valid-token"
    );
    tvtimeClientMocks.scrobble.mockResolvedValue(undefined);
    traktClientMocks.scrobble.mockRejectedValue(new Error("Trakt failed"));

    const service = new SyncService();
    const result = await service.retryHistoryItem({
      id: "sync-history-id",
      userId: "u1",
      user: {
        id: "u1",
        enabled: true,
        plexUsername: "plex-user",
        tvtimeAccessToken: "tv-token",
        tvtimeMarkMoviesAsRewatched: false,
        tvtimeMarkEpisodesAsRewatched: false,
        traktClientId: "trakt-client-id",
        traktClientSecret: "trakt-secret",
        traktAccessToken: "trakt-token",
      },
      mediaType: "movie",
      mediaTitle: "Interstellar",
      source: "plex",
      originalMediaId: "plex-media-id",
      tvdbMovieId: "123",
      success: false,
      syncedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    expect(result).toEqual({
      success: true,
      destinations: ["TVTime"],
      errorMessage: "Trakt: Trakt failed",
    });
    expect(syncHistoryRepositoryMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sync-history-id",
        success: false,
        errorMessage: "Trakt: Trakt failed",
        retriedAt: expect.any(Date),
        destinations: JSON.stringify(["TVTime"]),
      })
    );
  });

  it("does not create another history item when a retry fails completely", async () => {
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    tvtimeTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "tvtime-valid-token"
    );
    tvtimeClientMocks.scrobble.mockRejectedValue(new Error("TVTime failed"));

    const service = new SyncService();
    const result = await service.retryHistoryItem({
      id: "sync-history-id",
      userId: "u1",
      user: {
        id: "u1",
        enabled: true,
        plexUsername: "plex-user",
        tvtimeAccessToken: "tv-token",
        tvtimeMarkMoviesAsRewatched: false,
        tvtimeMarkEpisodesAsRewatched: false,
        traktAccessToken: null,
      },
      mediaType: "movie",
      mediaTitle: "Interstellar",
      source: "plex",
      tvdbMovieId: "123",
      success: false,
      syncedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    expect(result).toEqual({
      success: false,
      destinations: [],
      errorMessage: "TVTime: TVTime failed",
    });
    expect(syncHistoryRepositoryMocks.create).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.save).not.toHaveBeenCalled();
  });

  it("records partial failure when one destination fails", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      tvtimeAccessToken: "tv-token",
      tvtimeMarkMoviesAsRewatched: true,
      tvtimeMarkEpisodesAsRewatched: false,
      traktClientId: "trakt-client-id",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(true);
    tvtimeTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "tvtime-valid-token"
    );
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "trakt-valid-token"
    );
    tvtimeClientMocks.scrobble.mockRejectedValue(new Error("TVTime failed"));
    traktClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        originalMediaId: "m1",
        success: true,
        errorMessage: expect.stringContaining("TVTime: TVTime failed"),
        wasRewatched: false,
        destinations: JSON.stringify(["Trakt"]),
      })
    );
  });
});
