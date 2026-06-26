import { afterEach, describe, expect, it, vi } from "vitest";

const tmdbClientMocks = vi.hoisted(() => ({
  resolvePosterPath: vi.fn(),
  fetchPosterImage: vi.fn(),
}));

vi.mock("@integrations/tmdb/TmdbClient", () => ({
  TmdbClient: class {
    resolvePosterPath = tmdbClientMocks.resolvePosterPath;
    fetchPosterImage = tmdbClientMocks.fetchPosterImage;
  },
}));

const jellyfinClientMocks = vi.hoisted(() => ({
  fetchImage: vi.fn(),
}));

vi.mock("@integrations/jellyfin/JellyfinClient", () => ({
  JellyfinClient: class {
    fetchImage = jellyfinClientMocks.fetchImage;
  },
}));

import type { SyncHistory } from "@entities/SyncHistory";
import type { User } from "@entities/User";
import { TmdbRateLimitError } from "@integrations/tmdb/TmdbApiError";

import { hasPosterLookupData, PosterService } from "./PosterService";

function createSyncHistory(overrides: Partial<SyncHistory> = {}): SyncHistory {
  return {
    id: "sync-1",
    userId: "user-1",
    mediaType: "movie",
    mediaTitle: "Example Movie",
    success: true,
    wasRewatched: false,
    syncedAt: new Date(),
    posterUrl: "https://plex.local/library/metadata/1/thumb",
    source: "plex",
    tmdbMovieId: "123",
    ...overrides,
  } as SyncHistory;
}

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    plexAccessToken: "plex-token",
    ...overrides,
  } as User;
}

describe("PosterService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    tmdbClientMocks.resolvePosterPath.mockReset();
    tmdbClientMocks.fetchPosterImage.mockReset();
    jellyfinClientMocks.fetchImage.mockReset();
  });

  it("detects when poster lookup data is available", () => {
    expect(
      hasPosterLookupData(
        createSyncHistory({
          posterUrl: undefined,
          tmdbMovieId: "123",
        })
      )
    ).toBe(true);
    expect(
      hasPosterLookupData(
        createSyncHistory({
          posterUrl: undefined,
          tmdbMovieId: undefined,
          tmdbSeriesId: undefined,
          imdbMovieId: undefined,
          imdbEpisodeId: undefined,
          tvdbMovieId: undefined,
          tvdbEpisodeId: undefined,
        })
      )
    ).toBe(false);
  });

  it("uses the media server poster when it is available", async () => {
    const imageBytes = new Uint8Array([1, 2, 3]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-type" ? "image/jpeg" : null,
        },
        arrayBuffer: async () => imageBytes,
      })
    );

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory(),
      createUser(),
      {
        plexServerUrl: "https://plex.local",
        tmdbAccessToken: "tmdb-token",
      }
    );

    expect(result).toEqual({
      buffer: Buffer.from(imageBytes),
      contentType: "image/jpeg",
    });
    expect(tmdbClientMocks.resolvePosterPath).not.toHaveBeenCalled();
  });

  it("falls back to TMDB when the media server poster is missing", async () => {
    const imageBytes = new Uint8Array([4, 5, 6]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );
    tmdbClientMocks.resolvePosterPath.mockResolvedValue("/tmdb-poster.jpg");
    tmdbClientMocks.fetchPosterImage.mockResolvedValue({
      buffer: imageBytes,
      contentType: "image/webp",
    });

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory(),
      createUser(),
      {
        plexServerUrl: "https://plex.local",
        tmdbAccessToken: "tmdb-token",
      }
    );

    expect(result).toEqual({
      buffer: Buffer.from(imageBytes),
      contentType: "image/webp",
    });
    expect(tmdbClientMocks.resolvePosterPath).toHaveBeenCalledOnce();
  });

  it("uses TMDB when no media server poster URL exists", async () => {
    const imageBytes = new Uint8Array([7, 8, 9]).buffer;
    tmdbClientMocks.resolvePosterPath.mockResolvedValue("/only-tmdb.jpg");
    tmdbClientMocks.fetchPosterImage.mockResolvedValue({
      buffer: imageBytes,
      contentType: "image/png",
    });

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory({ posterUrl: undefined }),
      createUser(),
      { tmdbAccessToken: "tmdb-token" }
    );

    expect(result).toEqual({
      buffer: Buffer.from(imageBytes),
      contentType: "image/png",
    });
  });

  it("returns the media server error when TMDB cannot resolve a poster", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );
    tmdbClientMocks.resolvePosterPath.mockResolvedValue(null);

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory(),
      createUser(),
      {
        plexServerUrl: "https://plex.local",
        tmdbAccessToken: "tmdb-token",
      }
    );

    expect(result).toEqual({
      status: 404,
      message: "Failed to fetch poster image",
    });
  });

  it("proxies generic poster URLs directly", async () => {
    const imageBytes = new Uint8Array([9, 9, 9]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-type" ? "image/png" : null,
        },
        arrayBuffer: async () => imageBytes,
      })
    );

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory({
        posterUrl: "https://cdn.example.test/poster.png",
        source: undefined,
      }),
      createUser(),
      {}
    );

    expect(result).toEqual({
      buffer: Buffer.from(imageBytes),
      contentType: "image/png",
    });
  });

  it("proxies Jellyfin posters through the Jellyfin client", async () => {
    jellyfinClientMocks.fetchImage.mockResolvedValue({
      buffer: new Uint8Array([1, 1]).buffer,
      contentType: "image/jpeg",
    });

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory({
        posterUrl: "https://jellyfin.local/Items/1/Images/Primary",
        source: "jellyfin",
      }),
      createUser({ jellyfinAccessToken: "jf-token" }),
      { jellyfinHost: "https://jellyfin.local" }
    );

    expect(result).toEqual({
      buffer: Buffer.from(new Uint8Array([1, 1])),
      contentType: "image/jpeg",
    });
    expect(jellyfinClientMocks.fetchImage).toHaveBeenCalledWith(
      "jf-token",
      "https://jellyfin.local/Items/1/Images/Primary",
      expect.any(AbortSignal)
    );
  });

  it("returns 404 when no poster source can be resolved", async () => {
    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory({ posterUrl: undefined, tmdbMovieId: undefined }),
      createUser(),
      {}
    );

    expect(result).toEqual({
      status: 404,
      message: "No poster available",
    });
  });

  it("returns Plex auth errors without calling TMDB", async () => {
    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory(),
      createUser({ plexAccessToken: undefined }),
      { plexServerUrl: "https://plex.local" }
    );

    expect(result).toEqual({
      status: 403,
      message: "Plex authentication required",
    });
    expect(tmdbClientMocks.resolvePosterPath).not.toHaveBeenCalled();
  });

  it("returns an error when Plex is not configured", async () => {
    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory(),
      createUser(),
      { tmdbAccessToken: "token" }
    );

    expect(result).toEqual({
      status: 500,
      message: "Plex server not configured",
    });
  });

  it("handles Plex fetch failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory(),
      createUser(),
      { plexServerUrl: "https://plex.local" }
    );

    expect(result).toEqual({
      status: 500,
      message: "Failed to fetch poster image",
    });
  });

  it("returns Jellyfin auth and configuration errors", async () => {
    const service = new PosterService();

    expect(
      await service.fetchPoster(
        createSyncHistory({
          posterUrl: "https://jellyfin.local/image.jpg",
          source: "jellyfin",
        }),
        createUser({ jellyfinAccessToken: undefined }),
        { jellyfinHost: "https://jellyfin.local" }
      )
    ).toEqual({
      status: 403,
      message: "Jellyfin authentication required",
    });

    expect(
      await service.fetchPoster(
        createSyncHistory({
          posterUrl: "https://jellyfin.local/image.jpg",
          source: "jellyfin",
        }),
        createUser({ jellyfinAccessToken: "jf-token" }),
        {}
      )
    ).toEqual({
      status: 500,
      message: "Jellyfin server not configured",
    });
  });

  it("handles Jellyfin and generic fetch failures", async () => {
    jellyfinClientMocks.fetchImage.mockRejectedValue(new Error("network"));
    const service = new PosterService();

    expect(
      await service.fetchPoster(
        createSyncHistory({
          posterUrl: "https://jellyfin.local/image.jpg",
          source: "jellyfin",
        }),
        createUser({ jellyfinAccessToken: "jf-token" }),
        { jellyfinHost: "https://jellyfin.local" }
      )
    ).toEqual({
      status: 500,
      message: "Failed to fetch poster image",
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(
      await service.fetchPoster(
        createSyncHistory({
          posterUrl: "https://cdn.example.test/poster.png",
          source: undefined,
        }),
        createUser(),
        {}
      )
    ).toEqual({
      status: 500,
      message: "Failed to fetch poster image",
    });
  });

  it("returns generic URL failures without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      })
    );

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory({
        posterUrl: "https://cdn.example.test/poster.png",
        source: undefined,
      }),
      createUser(),
      {}
    );

    expect(result).toEqual({
      status: 502,
      message: "Failed to fetch poster image",
    });
  });

  it("logs non-rate-limit TMDB lookup failures", async () => {
    tmdbClientMocks.resolvePosterPath.mockRejectedValue(
      new Error("lookup failed")
    );

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory({ posterUrl: undefined, tmdbMovieId: "123" }),
      createUser(),
      { tmdbAccessToken: "token" }
    );

    expect(result).toEqual({
      status: 404,
      message: "No poster available",
    });
  });

  it("ignores TMDB rate limits and falls back to media server errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );
    tmdbClientMocks.resolvePosterPath.mockRejectedValue(
      new TmdbRateLimitError()
    );

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory(),
      createUser(),
      {
        plexServerUrl: "https://plex.local",
        tmdbAccessToken: "token",
      }
    );

    expect(result).toEqual({
      status: 404,
      message: "Failed to fetch poster image",
    });
  });
});
