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
});
