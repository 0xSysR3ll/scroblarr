import { BingersApiError } from "@integrations/bingers/BingersApiError";
import { TraktApiError } from "@integrations/trakt/TraktApiError";
import type { MediaEvent } from "@scroblarr/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findBySourceUsername: vi.fn(),
  findByJellyfinUserId: vi.fn(),
  findById: vi.fn(),
}));

const syncHistoryRepositoryMocks = vi.hoisted(() => ({
  hasExistingSync: vi.fn(),
  countSuccessfulDestinationSyncs: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  clearOldByUser: vi.fn(),
}));

const settingsRepositoryMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  get: vi.fn(),
}));

const traktClientMocks = vi.hoisted(() => ({
  scrobble: vi.fn(),
}));

const simklClientMocks = vi.hoisted(() => ({
  scrobble: vi.fn(),
}));

const traktTokenManagerMocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

const simklTokenManagerMocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
}));

const bingersClientMocks = vi.hoisted(() => ({
  scrobble: vi.fn(),
}));

const bingersClientCtorThrows = vi.hoisted(() => ({ value: false }));

const bingersSessionManagerMocks = vi.hoisted(() => ({
  getValidCookieJar: vi.fn(),
}));

const mediaIdEnricherMocks = vi.hoisted(() => ({
  enrich: vi.fn(async (media: unknown) => media),
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
    countSuccessfulDestinationSyncs =
      syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs;
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

vi.mock("@integrations/trakt/TraktClient", () => ({
  TraktClient: class {
    scrobble = traktClientMocks.scrobble;
  },
}));

vi.mock("@integrations/simkl/SimklClient", () => ({
  SimklClient: class {
    scrobble = simklClientMocks.scrobble;
  },
}));

vi.mock("@integrations/bingers/BingersClient", () => ({
  BingersClient: class {
    constructor() {
      if (bingersClientCtorThrows.value) {
        throw new Error("Bingers client init failed");
      }
    }
    scrobble = bingersClientMocks.scrobble;
  },
}));

vi.mock("@integrations/trakt/TraktTokenManager", () => ({
  TraktTokenManager: class {
    getValidAccessToken = traktTokenManagerMocks.getValidAccessToken;
    refreshAccessToken = traktTokenManagerMocks.refreshAccessToken;
  },
}));

vi.mock("@integrations/simkl/SimklTokenManager", () => ({
  SimklTokenManager: class {
    getValidAccessToken = simklTokenManagerMocks.getValidAccessToken;
  },
}));

vi.mock("@integrations/bingers/BingersSessionManager", () => ({
  BingersSessionManager: class {
    getValidCookieJar = bingersSessionManagerMocks.getValidCookieJar;
  },
}));

vi.mock("@integrations/bingers/cookieJar", () => ({
  cookieHeaderFromJar: () => "session_token=bingers-cookie",
}));

vi.mock("./MediaIdEnricher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./MediaIdEnricher")>();
  return {
    ...actual,
    MediaIdEnricher: class {
      enrich = mediaIdEnricherMocks.enrich;
    },
  };
});

const jellyfinClientMocks = vi.hoisted(() => ({
  getSeasonPosterUrl: vi.fn(),
  constructedConfigs: [] as Array<{
    baseUrl: string;
    serverKind?: "jellyfin" | "emby";
  }>,
}));

vi.mock("@integrations/jellyfin/JellyfinClient", () => ({
  JellyfinClient: class {
    constructor(
      baseUrl: string,
      _deviceId?: string,
      serverKind?: "jellyfin" | "emby"
    ) {
      jellyfinClientMocks.constructedConfigs.push({ baseUrl, serverKind });
    }
    getSeasonPosterUrl = jellyfinClientMocks.getSeasonPosterUrl;
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
    bingersClientCtorThrows.value = false;
    vi.clearAllMocks();
    jellyfinClientMocks.constructedConfigs.length = 0;
    settingsRepositoryMocks.get.mockResolvedValue("100");
    settingsRepositoryMocks.getAll.mockResolvedValue({});
    syncHistoryRepositoryMocks.clearOldByUser.mockResolvedValue(0);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      0
    );
    mediaIdEnricherMocks.enrich.mockImplementation(async (media) => media);
    jellyfinClientMocks.getSeasonPosterUrl.mockReset();
  });

  it("ignores non-scrobble events", async () => {
    const service = new SyncService();
    await service.syncEvent(makeEvent({ event: "playing" }));
    expect(userRepositoryMocks.findBySourceUsername).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.create).not.toHaveBeenCalled();
  });

  it("resolves Emby events by jellyfinUserId", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-emby",
      enabled: true,
      jellyfinUserId: "emby-user-guid",
      traktAccessToken: null,
    });

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "emby",
        userId: "emby-user-guid",
      })
    );

    expect(userRepositoryMocks.findByJellyfinUserId).toHaveBeenCalledWith(
      "emby-user-guid"
    );
    expect(userRepositoryMocks.findBySourceUsername).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-emby",
        source: "emby",
        success: false,
        errorMessage: "No sync destinations configured",
      })
    );
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

  it("syncs to Simkl when linked and records the destination", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: null,
      simklClientId: "simkl-client-id",
      simklAccessToken: "simkl-token",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    simklTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "simkl-valid-token"
    );
    simklClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(simklClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({ event: "scrobble" }),
      "simkl-valid-token",
      expect.any(Object)
    );
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        originalMediaId: "m1",
        success: true,
        destinations: JSON.stringify(["Simkl"]),
      })
    );
  });

  it("syncs to Bingers when linked and records the destination", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: null,
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      tmdbAccessToken: "tmdb-token",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      0
    );
    bingersSessionManagerMocks.getValidCookieJar.mockResolvedValue({
      session_token: { name: "session_token", value: "x" },
    });
    bingersClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(bingersSessionManagerMocks.getValidCookieJar).toHaveBeenCalledWith(
      "u1"
    );
    expect(bingersClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({ event: "scrobble" }),
      "session_token=bingers-cookie",
      expect.objectContaining({
        bingersLocalPlayCount: undefined,
        markMoviesAsRewatched: false,
      })
    );
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        originalMediaId: "m1",
        success: true,
        destinations: JSON.stringify(["Bingers"]),
        wasRewatched: false,
      })
    );
  });

  it("wires Bingers without TMDB alternate titles when token is missing", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: null,
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({});
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      0
    );
    bingersSessionManagerMocks.getValidCookieJar.mockResolvedValue({
      session_token: { name: "session_token", value: "x" },
    });
    bingersClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(bingersClientMocks.scrobble).toHaveBeenCalled();
  });

  it("still wires Bingers when settings lookup fails", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: null,
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
    });
    settingsRepositoryMocks.getAll.mockRejectedValue(
      new Error("settings unavailable")
    );
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      0
    );
    bingersSessionManagerMocks.getValidCookieJar.mockResolvedValue({
      session_token: { name: "session_token", value: "x" },
    });
    bingersClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(bingersClientMocks.scrobble).toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        destinations: JSON.stringify(["Bingers"]),
        success: true,
      })
    );
  });

  it("uses destination getSyncOptions when provided", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktClientId: "client",
      traktClientSecret: "secret",
      traktAccessToken: "token",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(true);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    const getSyncOptions = vi.fn(() => ({ markAsRewatched: true }));
    vi.spyOn(
      service as unknown as {
        getSyncDestinations: () => Promise<
          Array<{
            name: string;
            client: { scrobble: typeof traktClientMocks.scrobble };
            hasToken: () => boolean;
            getAccessToken: () => Promise<string>;
            getSyncOptions?: (
              user: { id: string },
              hasExistingSync: boolean
            ) => Record<string, unknown>;
          }>
        >;
      },
      "getSyncDestinations"
    ).mockResolvedValue([
      {
        name: "Trakt",
        client: { scrobble: traktClientMocks.scrobble },
        hasToken: () => true,
        getAccessToken: async () => "trakt-token",
        getSyncOptions,
      },
    ]);

    await service.syncEvent(makeEvent());

    expect(getSyncOptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
      true
    );
    expect(traktClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({ event: "scrobble" }),
      "trakt-token",
      { markAsRewatched: true }
    );
  });

  it("continues syncing when Bingers client initialization fails", async () => {
    bingersClientCtorThrows.value = true;
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: "trakt-token",
      traktClientId: "client",
      traktClientSecret: "secret",
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(traktClientMocks.scrobble).toHaveBeenCalled();
    expect(bingersClientMocks.scrobble).not.toHaveBeenCalled();
  });

  it("increments Bingers plays and marks rewatch on repeat scrobbles", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: null,
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
      bingersMarkMoviesAsRewatched: true,
      bingersMarkEpisodesAsRewatched: false,
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(true);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      2
    );
    bingersSessionManagerMocks.getValidCookieJar.mockResolvedValue({
      session_token: { name: "session_token", value: "x" },
    });
    bingersClientMocks.scrobble.mockResolvedValue({ wasRewatched: true });

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(
      syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs
    ).toHaveBeenCalledWith(
      "u1",
      "Bingers",
      "movie",
      expect.objectContaining({ tvdbMovieId: "123" })
    );
    expect(bingersClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({ event: "scrobble" }),
      "session_token=bingers-cookie",
      expect.objectContaining({
        bingersLocalPlayCount: 3,
        markMoviesAsRewatched: true,
      })
    );
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        destinations: JSON.stringify(["Bingers"]),
        wasRewatched: true,
      })
    );
  });

  it("passes allow-rewatch on first Bingers sync so remote history can increment plays", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: null,
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
      bingersMarkMoviesAsRewatched: true,
      bingersMarkEpisodesAsRewatched: false,
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      0
    );
    bingersSessionManagerMocks.getValidCookieJar.mockResolvedValue({
      session_token: { name: "session_token", value: "x" },
    });
    bingersClientMocks.scrobble.mockResolvedValue({ wasRewatched: true });

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(bingersClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({ event: "scrobble" }),
      "session_token=bingers-cookie",
      expect.objectContaining({
        bingersLocalPlayCount: undefined,
        markMoviesAsRewatched: true,
      })
    );
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        destinations: JSON.stringify(["Bingers"]),
        wasRewatched: true,
      })
    );
  });

  it("skips Bingers when rewatch is opted out and the item was already synced", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: null,
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
      bingersMarkMoviesAsRewatched: false,
      bingersMarkEpisodesAsRewatched: false,
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(true);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      2
    );
    bingersSessionManagerMocks.getValidCookieJar.mockResolvedValue({
      session_token: { name: "session_token", value: "x" },
    });
    bingersClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(bingersClientMocks.scrobble).not.toHaveBeenCalled();
    const historyCall =
      syncHistoryRepositoryMocks.create.mock.calls.at(-1)?.[0];
    expect(historyCall?.destinations).toBeUndefined();
  });

  it("does not inflate Bingers play counts when skipped syncs are not recorded", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: null,
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
      bingersMarkMoviesAsRewatched: true,
      bingersMarkEpisodesAsRewatched: false,
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(true);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      1
    );
    bingersSessionManagerMocks.getValidCookieJar.mockResolvedValue({
      session_token: { name: "session_token", value: "x" },
    });
    bingersClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(bingersClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({ event: "scrobble" }),
      "session_token=bingers-cookie",
      expect.objectContaining({
        bingersLocalPlayCount: 2,
        markMoviesAsRewatched: true,
      })
    );
  });

  it("syncs to Bingers on first watch even when the item was synced to another destination", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: "trakt-token",
      traktClientId: "client",
      traktClientSecret: "secret",
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
      bingersMarkMoviesAsRewatched: false,
      bingersMarkEpisodesAsRewatched: false,
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(true);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      0
    );
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);
    bingersSessionManagerMocks.getValidCookieJar.mockResolvedValue({
      session_token: { name: "session_token", value: "x" },
    });
    bingersClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(bingersClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({ event: "scrobble" }),
      "session_token=bingers-cookie",
      expect.objectContaining({
        bingersLocalPlayCount: undefined,
        markMoviesAsRewatched: false,
      })
    );
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        destinations: JSON.stringify(["Trakt", "Bingers"]),
        wasRewatched: false,
      })
    );
  });

  it("increments Bingers episode plays when rewatch is enabled", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: null,
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
      bingersMarkMoviesAsRewatched: false,
      bingersMarkEpisodesAsRewatched: true,
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(true);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      1
    );
    bingersSessionManagerMocks.getValidCookieJar.mockResolvedValue({
      session_token: { name: "session_token", value: "x" },
    });
    bingersClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        media: {
          id: "e1",
          type: "episode",
          title: "Example Show",
          seasonNumber: 1,
          episodeNumber: 2,
        },
      })
    );

    expect(
      syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs
    ).toHaveBeenCalledWith(
      "u1",
      "Bingers",
      "episode",
      expect.objectContaining({
        mediaTitle: "Example Show",
        seasonNumber: 1,
        episodeNumber: 2,
      })
    );
    expect(bingersClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({ event: "scrobble" }),
      "session_token=bingers-cookie",
      expect.objectContaining({
        bingersLocalPlayCount: 2,
        markEpisodesAsRewatched: true,
      })
    );
  });

  it("retries Bingers scrobbles after an auth error", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktAccessToken: null,
      bingersCookieJar:
        '{"session_token":{"name":"session_token","value":"x"}}',
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    syncHistoryRepositoryMocks.countSuccessfulDestinationSyncs.mockResolvedValue(
      0
    );
    bingersSessionManagerMocks.getValidCookieJar
      .mockResolvedValueOnce({
        session_token: { name: "session_token", value: "dead" },
      })
      .mockResolvedValueOnce({
        session_token: { name: "session_token", value: "fresh" },
      });
    bingersClientMocks.scrobble
      .mockRejectedValueOnce(
        new BingersApiError("dead session", 401, { isAuthError: true })
      )
      .mockResolvedValueOnce(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(bingersSessionManagerMocks.getValidCookieJar).toHaveBeenCalledTimes(
      2
    );
    expect(bingersClientMocks.scrobble).toHaveBeenCalledTimes(2);
    expect(bingersClientMocks.scrobble).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: "scrobble" }),
      "session_token=bingers-cookie",
      expect.any(Object)
    );
  });

  it("records partial failure when Simkl fails alongside another destination", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktClientId: "trakt-client-id",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
      simklClientId: "simkl-client-id",
      simklAccessToken: "simkl-token",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "trakt-valid-token"
    );
    simklTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "simkl-valid-token"
    );
    traktClientMocks.scrobble.mockResolvedValue(undefined);
    simklClientMocks.scrobble.mockRejectedValue(new Error("Simkl failed"));

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        errorMessage: expect.stringContaining("Simkl: Simkl failed"),
        destinations: JSON.stringify(["Trakt"]),
        destinationResults: expect.stringContaining(
          '"Simkl":{"status":"failed"'
        ),
      })
    );
  });

  it("retries a failed history item using the linked media server account", async () => {
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "trakt-valid-token"
    );
    traktClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    const result = await service.retryHistoryItem({
      id: "sync-history-id",
      userId: "u1",
      user: {
        id: "u1",
        enabled: true,
        plexUsername: "plex-user",
        traktClientId: "trakt-client-id",
        traktClientSecret: "trakt-secret",
        traktAccessToken: "trakt-token",
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

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        destinations: ["Trakt"],
        errorMessage: undefined,
      })
    );
    expect(traktClientMocks.scrobble).toHaveBeenCalledWith(
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
      "trakt-valid-token",
      expect.any(Object)
    );
    expect(syncHistoryRepositoryMocks.create).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sync-history-id",
        success: true,
        errorMessage: null,
        retriedAt: expect.any(Date),
        destinations: JSON.stringify(["Trakt"]),
      })
    );
  });

  it("retries Emby history items with the linked Jellyfin user id", async () => {
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "trakt-valid-token"
    );
    traktClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    const result = await service.retryHistoryItem({
      id: "emby-history-id",
      userId: "u-emby",
      user: {
        id: "u-emby",
        enabled: true,
        jellyfinUserId: "emby-user-guid",
        traktClientId: "trakt-client-id",
        traktClientSecret: "trakt-secret",
        traktAccessToken: "trakt-token",
      },
      mediaType: "movie",
      mediaTitle: "Emby Movie",
      source: "emby",
      originalMediaId: "emby-media-id",
      tmdbMovieId: "456",
      success: false,
      syncedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        destinations: ["Trakt"],
      })
    );
    expect(traktClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "emby",
        userId: "emby-user-guid",
        media: expect.objectContaining({
          id: "emby-media-id",
          tmdbMovieId: 456,
        }),
      }),
      "trakt-valid-token",
      expect.any(Object)
    );
  });

  it("rejects Emby retries when the linked Jellyfin user id is missing", async () => {
    const service = new SyncService();

    await expect(
      service.retryHistoryItem({
        id: "emby-history-id",
        userId: "u-emby",
        user: {
          id: "u-emby",
          enabled: true,
          jellyfinUserId: undefined,
          traktClientId: "trakt-client-id",
          traktClientSecret: "trakt-secret",
          traktAccessToken: "trakt-token",
        },
        mediaType: "movie",
        mediaTitle: "Emby Movie",
        source: "emby",
        originalMediaId: "emby-media-id",
        success: false,
        syncedAt: new Date("2026-01-01T00:00:00.000Z"),
      } as never)
    ).rejects.toThrow("User is missing the linked media server account");
  });

  it("rejects retries for unsupported history sources", async () => {
    const service = new SyncService();

    await expect(
      service.retryHistoryItem({
        id: "history-id",
        userId: "u1",
        user: {
          id: "u1",
          enabled: true,
          plexUsername: "plex-user",
        },
        mediaType: "movie",
        mediaTitle: "Example",
        source: "unknown",
        originalMediaId: "media-id",
        success: false,
        syncedAt: new Date("2026-01-01T00:00:00.000Z"),
      } as never)
    ).rejects.toThrow("Sync history item source cannot be retried");
  });

  it("does not create another history item when a retry fails completely", async () => {
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "trakt-valid-token"
    );
    traktClientMocks.scrobble.mockRejectedValue(new Error("Trakt failed"));

    const service = new SyncService();
    const result = await service.retryHistoryItem({
      id: "sync-history-id",
      userId: "u1",
      user: {
        id: "u1",
        enabled: true,
        plexUsername: "plex-user",
        traktClientId: "trakt-client-id",
        traktClientSecret: "trakt-secret",
        traktAccessToken: "trakt-token",
      },
      mediaType: "movie",
      mediaTitle: "Interstellar",
      source: "plex",
      tvdbMovieId: "123",
      success: false,
      syncedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        destinations: [],
        errorMessage: "Trakt: Trakt failed",
      })
    );
    expect(syncHistoryRepositoryMocks.create).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.save).not.toHaveBeenCalled();
  });

  it("records partial failure when one destination fails", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktClientId: "trakt-client-id",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
      simklClientId: "simkl-client-id",
      simklAccessToken: "simkl-token",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "trakt-valid-token"
    );
    simklTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "simkl-valid-token"
    );
    traktClientMocks.scrobble.mockRejectedValue(new Error("Trakt failed"));
    simklClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        originalMediaId: "m1",
        success: true,
        errorMessage: expect.stringContaining("Trakt: Trakt failed"),
        destinations: JSON.stringify(["Simkl"]),
        destinationResults: expect.stringContaining(
          '"Trakt":{"status":"failed"'
        ),
      })
    );
  });

  it("merges destinations when retrying a partially failed history item", async () => {
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "trakt-valid-token"
    );
    traktClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    const result = await service.retryHistoryItem({
      id: "sync-history-id",
      userId: "u1",
      user: {
        id: "u1",
        enabled: true,
        plexUsername: "plex-user",
        simklClientId: "simkl-client-id",
        simklAccessToken: "simkl-token",
        traktClientId: "trakt-client-id",
        traktClientSecret: "trakt-secret",
        traktAccessToken: "trakt-token",
      },
      mediaType: "movie",
      mediaTitle: "Interstellar",
      source: "plex",
      originalMediaId: "plex-media-id",
      tvdbMovieId: "123",
      destinations: JSON.stringify(["Simkl"]),
      success: true,
      errorMessage: "Trakt: Trakt token expired or revoked",
      syncedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        destinations: ["Trakt"],
        errorMessage: undefined,
      })
    );
    expect(traktClientMocks.scrobble).toHaveBeenCalledTimes(1);
    expect(syncHistoryRepositoryMocks.create).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sync-history-id",
        success: true,
        errorMessage: null,
        destinations: expect.stringMatching(/Simkl.*Trakt|Trakt.*Simkl/),
      })
    );
  });

  it("retries Trakt sync once after an auth error", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      traktClientId: "trakt-client-id",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("stale-token");
    traktTokenManagerMocks.refreshAccessToken.mockResolvedValue(
      "refreshed-token"
    );
    traktClientMocks.scrobble
      .mockRejectedValueOnce(new TraktApiError("auth failed", 401, true))
      .mockResolvedValueOnce(undefined);

    const service = new SyncService();
    await service.syncEvent(makeEvent());

    expect(traktClientMocks.scrobble).toHaveBeenCalledTimes(2);
    expect(traktClientMocks.scrobble).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "stale-token",
      expect.anything()
    );
    expect(traktClientMocks.scrobble).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "refreshed-token",
      expect.anything()
    );
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        destinations: JSON.stringify(["Trakt"]),
      })
    );
  });

  it("enriches media IDs from TMDB before syncing when identifiers are missing", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      simklClientId: "simkl-client-id",
      simklAccessToken: "simkl-token",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      tmdbAccessToken: "tmdb-token",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    simklTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "simkl-valid-token"
    );
    simklClientMocks.scrobble.mockResolvedValue(undefined);
    mediaIdEnricherMocks.enrich.mockResolvedValue({
      id: "episode-Berlin-2-1",
      type: "episode",
      title: "Berlin",
      seasonNumber: 1,
      episodeNumber: 1,
      tmdbSeriesId: 308014,
      tvdbEpisodeId: 10597958,
      imdbEpisodeId: "tt31397887",
    });

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        media: {
          id: "episode-Berlin-2-1",
          type: "episode",
          title: "Berlin",
          seasonNumber: 2,
          episodeNumber: 1,
        },
      })
    );

    expect(mediaIdEnricherMocks.enrich).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Berlin",
        seasonNumber: 2,
        episodeNumber: 1,
      })
    );
    expect(simklClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({
        media: expect.objectContaining({
          seasonNumber: 1,
          tmdbSeriesId: 308014,
          tvdbEpisodeId: 10597958,
        }),
      }),
      "simkl-valid-token",
      expect.any(Object)
    );
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTitle: "Berlin",
        seasonNumber: 1,
        tmdbSeriesId: "308014",
        tvdbEpisodeId: "10597958",
        imdbEpisodeId: "tt31397887",
        success: true,
      })
    );
  });

  it("skips enrichment when no TMDB token is configured", async () => {
    const previousToken = process.env.TMDB_ACCESS_TOKEN;
    process.env.TMDB_ACCESS_TOKEN = "";
    try {
      userRepositoryMocks.findBySourceUsername.mockResolvedValue({
        id: "u1",
        enabled: true,
        plexUsername: "plex-user",
        simklClientId: "simkl-client-id",
        simklAccessToken: "simkl-token",
      });
      settingsRepositoryMocks.getAll.mockResolvedValue({});
      syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
      simklTokenManagerMocks.getValidAccessToken.mockResolvedValue(
        "simkl-valid-token"
      );
      simklClientMocks.scrobble.mockResolvedValue(undefined);

      const service = new SyncService();
      await service.syncEvent(
        makeEvent({
          media: {
            id: "episode-Berlin-2-1",
            type: "episode",
            title: "Berlin",
            seasonNumber: 2,
            episodeNumber: 1,
          },
        })
      );

      expect(mediaIdEnricherMocks.enrich).not.toHaveBeenCalled();
      expect(simklClientMocks.scrobble).toHaveBeenCalledWith(
        expect.objectContaining({
          media: expect.objectContaining({
            title: "Berlin",
            seasonNumber: 2,
          }),
        }),
        "simkl-valid-token",
        expect.any(Object)
      );
    } finally {
      if (previousToken === undefined) {
        delete process.env.TMDB_ACCESS_TOKEN;
      } else {
        process.env.TMDB_ACCESS_TOKEN = previousToken;
      }
    }
  });

  it("keeps the original event when TMDB enrichment finds nothing", async () => {
    userRepositoryMocks.findBySourceUsername.mockResolvedValue({
      id: "u1",
      enabled: true,
      plexUsername: "plex-user",
      simklClientId: "simkl-client-id",
      simklAccessToken: "simkl-token",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      tmdbAccessToken: "tmdb-token",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    simklTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "simkl-valid-token"
    );
    simklClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        media: {
          id: "episode-Berlin-2-1",
          type: "episode",
          title: "Berlin",
          seasonNumber: 2,
          episodeNumber: 1,
        },
      })
    );

    expect(mediaIdEnricherMocks.enrich).toHaveBeenCalled();
    expect(simklClientMocks.scrobble).toHaveBeenCalledWith(
      expect.objectContaining({
        media: expect.objectContaining({
          seasonNumber: 2,
          title: "Berlin",
        }),
      }),
      "simkl-valid-token",
      expect.any(Object)
    );
  });
  it("uses jellyfinApiKey for Emby season poster enrichment", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-emby",
      enabled: true,
      jellyfinUserId: "emby-user-guid",
      jellyfinAccessToken: undefined,
      traktClientId: "trakt-client",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "u-emby",
      jellyfinAccessToken: undefined,
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      jellyfinApiKey: "server-api-key",
      mediaBrowserType: "emby",
      tmdbAccessToken: undefined,
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);
    jellyfinClientMocks.getSeasonPosterUrl.mockResolvedValue(
      "https://emby.local/Items/season-9/Images/Primary"
    );

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "emby",
        userId: "emby-user-guid",
        media: {
          id: "episode-Show-1-2",
          type: "episode",
          title: "Show",
          seasonNumber: 1,
          episodeNumber: 2,
          posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
        },
        metadata: { itemId: "ep-1" },
      })
    );

    expect(jellyfinClientMocks.getSeasonPosterUrl).toHaveBeenCalledWith(
      "server-api-key",
      "ep-1",
      1,
      expect.any(AbortSignal)
    );
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "https://emby.local",
        serverKind: "emby",
      },
    ]);
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "emby",
        posterUrl: "https://emby.local/Items/season-9/Images/Primary",
        success: true,
      })
    );
  });

  it("uses jellyfin client kind for Jellyfin season poster enrichment", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-jf",
      enabled: true,
      jellyfinUserId: "jf-user",
      jellyfinAccessToken: "jf-token",
      traktClientId: "trakt-client",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "u-jf",
      jellyfinAccessToken: "jf-token",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.local",
      mediaBrowserType: "jellyfin",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);
    jellyfinClientMocks.getSeasonPosterUrl.mockResolvedValue(
      "https://jellyfin.local/Items/season-1/Images/Primary"
    );

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "jellyfin",
        userId: "jf-user",
        media: {
          id: "episode-Show-1-1",
          type: "episode",
          title: "Show",
          seasonNumber: 1,
          episodeNumber: 1,
          posterUrl: "https://jellyfin.local/Items/ep/Images/Primary",
        },
        metadata: { itemId: "ep" },
      })
    );

    expect(jellyfinClientMocks.getSeasonPosterUrl).toHaveBeenCalledWith(
      "jf-token",
      "ep",
      1,
      expect.any(AbortSignal)
    );
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "https://jellyfin.local",
        serverKind: "jellyfin",
      },
    ]);
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "jellyfin",
        posterUrl: "https://jellyfin.local/Items/season-1/Images/Primary",
        success: true,
      })
    );
  });

  it("falls back when Emby season poster lookup throws", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-emby",
      enabled: true,
      jellyfinUserId: "emby-user-guid",
      jellyfinAccessToken: "emby-token",
      traktClientId: "trakt-client",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "u-emby",
      jellyfinAccessToken: "emby-token",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      mediaBrowserType: "emby",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);
    jellyfinClientMocks.getSeasonPosterUrl.mockRejectedValue(new Error("boom"));

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "emby",
        userId: "emby-user-guid",
        media: {
          id: "episode-Show-1-2",
          type: "episode",
          title: "Show",
          seasonNumber: 1,
          episodeNumber: 2,
          posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
        },
        metadata: { itemId: "ep-1" },
      })
    );

    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "emby",
        posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
        success: true,
      })
    );
  });

  it("uses emby client kind when mediaBrowserType is emby for jellyfin events", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-jf",
      enabled: true,
      jellyfinUserId: "jf-user",
      jellyfinAccessToken: "jf-token",
      traktClientId: "trakt-client",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "u-jf",
      jellyfinAccessToken: "jf-token",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      mediaBrowserType: "emby",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);
    jellyfinClientMocks.getSeasonPosterUrl.mockResolvedValue(
      "https://emby.local/Items/season-1/Images/Primary"
    );

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "jellyfin",
        userId: "jf-user",
        media: {
          id: "episode-Show-1-1",
          type: "episode",
          title: "Show",
          seasonNumber: 1,
          episodeNumber: 1,
          posterUrl: "https://emby.local/Items/ep/Images/Primary",
        },
        metadata: { itemId: "ep" },
      })
    );

    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "https://emby.local",
        serverKind: "emby",
      },
    ]);
  });

  it("uses jellyfinApiKey for season posters on HTTP hosts", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-emby",
      enabled: true,
      jellyfinUserId: "emby-user-guid",
      jellyfinAccessToken: undefined,
      traktClientId: "trakt-client",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "u-emby",
      jellyfinAccessToken: undefined,
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "http://emby.local",
      jellyfinApiKey: "server-api-key",
      mediaBrowserType: "emby",
      tmdbAccessToken: undefined,
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);
    jellyfinClientMocks.getSeasonPosterUrl.mockResolvedValue(
      "http://emby.local/Items/season-9/Images/Primary"
    );

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "emby",
        userId: "emby-user-guid",
        media: {
          id: "episode-Show-1-2",
          type: "episode",
          title: "Show",
          seasonNumber: 1,
          episodeNumber: 2,
          posterUrl: "http://emby.local/Items/ep-1/Images/Primary",
        },
        metadata: { itemId: "ep-1" },
      })
    );

    expect(jellyfinClientMocks.getSeasonPosterUrl).toHaveBeenCalledWith(
      "server-api-key",
      "ep-1",
      1,
      expect.any(AbortSignal)
    );
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "emby",
        posterUrl: "http://emby.local/Items/season-9/Images/Primary",
        success: true,
      })
    );
  });

  it("prefers the user access token over jellyfinApiKey for season posters", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-emby",
      enabled: true,
      jellyfinUserId: "emby-user-guid",
      jellyfinAccessToken: "user-token",
      traktClientId: "trakt-client",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "u-emby",
      jellyfinAccessToken: "user-token",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      jellyfinApiKey: "server-api-key",
      mediaBrowserType: "jellyfin",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);
    jellyfinClientMocks.getSeasonPosterUrl.mockResolvedValue(
      "https://emby.local/Items/season-9/Images/Primary"
    );

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "emby",
        userId: "emby-user-guid",
        media: {
          id: "episode-Show-1-2",
          type: "episode",
          title: "Show",
          seasonNumber: 1,
          episodeNumber: 2,
          posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
        },
        metadata: { itemId: "ep-1" },
      })
    );

    expect(jellyfinClientMocks.getSeasonPosterUrl).toHaveBeenCalledWith(
      "user-token",
      "ep-1",
      1,
      expect.any(AbortSignal)
    );
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "https://emby.local",
        serverKind: "emby",
      },
    ]);
  });

  it("skips season poster enrichment when no media-server credentials exist", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-emby",
      enabled: true,
      jellyfinUserId: "emby-user-guid",
      jellyfinAccessToken: undefined,
      traktClientId: "trakt-client",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "u-emby",
      jellyfinAccessToken: undefined,
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      jellyfinApiKey: undefined,
      mediaBrowserType: "emby",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "emby",
        userId: "emby-user-guid",
        media: {
          id: "episode-Show-1-2",
          type: "episode",
          title: "Show",
          seasonNumber: 1,
          episodeNumber: 2,
          posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
        },
        metadata: { itemId: "ep-1" },
      })
    );

    expect(jellyfinClientMocks.getSeasonPosterUrl).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "emby",
        posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
        success: true,
      })
    );
  });

  it("keeps the episode poster when season lookup returns null", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-emby",
      enabled: true,
      jellyfinUserId: "emby-user-guid",
      jellyfinAccessToken: "emby-token",
      traktClientId: "trakt-client",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "u-emby",
      jellyfinAccessToken: "emby-token",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      mediaBrowserType: "emby",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);
    jellyfinClientMocks.getSeasonPosterUrl.mockResolvedValue(null);

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "emby",
        userId: "emby-user-guid",
        media: {
          id: "episode-Show-1-2",
          type: "episode",
          title: "Show",
          seasonNumber: 1,
          episodeNumber: 2,
          posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
        },
        metadata: { itemId: "ep-1" },
      })
    );

    expect(jellyfinClientMocks.getSeasonPosterUrl).toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
      })
    );
  });

  it("skips season poster enrichment when seasonNumber is missing", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-emby",
      enabled: true,
      jellyfinUserId: "emby-user-guid",
      jellyfinAccessToken: "emby-token",
      traktClientId: "trakt-client",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "u-emby",
      jellyfinAccessToken: "emby-token",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      mediaBrowserType: "emby",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "emby",
        userId: "emby-user-guid",
        media: {
          id: "episode-Show-unknown-2",
          type: "episode",
          title: "Show",
          episodeNumber: 2,
          posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
        },
        metadata: { itemId: "ep-1" },
      })
    );

    expect(jellyfinClientMocks.getSeasonPosterUrl).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
      })
    );
  });

  it("skips season poster enrichment when the user lookup returns null", async () => {
    userRepositoryMocks.findByJellyfinUserId.mockResolvedValue({
      id: "u-emby",
      enabled: true,
      jellyfinUserId: "emby-user-guid",
      jellyfinAccessToken: "emby-token",
      traktClientId: "trakt-client",
      traktClientSecret: "trakt-secret",
      traktAccessToken: "trakt-token",
    });
    userRepositoryMocks.findById.mockResolvedValue(null);
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      jellyfinApiKey: undefined,
      mediaBrowserType: "emby",
    });
    syncHistoryRepositoryMocks.hasExistingSync.mockResolvedValue(false);
    traktTokenManagerMocks.getValidAccessToken.mockResolvedValue("trakt-token");
    traktClientMocks.scrobble.mockResolvedValue(undefined);

    const service = new SyncService();
    await service.syncEvent(
      makeEvent({
        source: "emby",
        userId: "emby-user-guid",
        media: {
          id: "episode-Show-1-2",
          type: "episode",
          title: "Show",
          seasonNumber: 1,
          episodeNumber: 2,
          posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
        },
        metadata: { itemId: "ep-1" },
      })
    );

    expect(jellyfinClientMocks.getSeasonPosterUrl).not.toHaveBeenCalled();
    expect(syncHistoryRepositoryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        posterUrl: "https://emby.local/Items/ep-1/Images/Primary",
      })
    );
  });
});
