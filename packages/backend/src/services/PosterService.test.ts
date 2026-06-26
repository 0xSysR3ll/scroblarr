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

import type { SyncHistory } from "@entities/SyncHistory";
import type { User } from "@entities/User";

import { PosterService } from "./PosterService";

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
});
