import { afterEach, describe, expect, it, vi } from "vitest";

const tmdbClientMocks = vi.hoisted(() => ({
  resolvePosterPath: vi.fn(),
  fetchPosterImage: vi.fn(),
  searchTv: vi.fn(),
  searchMovie: vi.fn(),
  getEpisodeExternalIds: vi.fn(),
  getMovieExternalIds: vi.fn(),
  getTvShowDetails: vi.fn(),
  hasTvSeason: vi.fn(),
  getTvRecommendations: vi.fn(),
}));

vi.mock("@integrations/tmdb/TmdbClient", () => ({
  TmdbClient: class {
    resolvePosterPath = tmdbClientMocks.resolvePosterPath;
    fetchPosterImage = tmdbClientMocks.fetchPosterImage;
    searchTv = tmdbClientMocks.searchTv;
    searchMovie = tmdbClientMocks.searchMovie;
    getEpisodeExternalIds = tmdbClientMocks.getEpisodeExternalIds;
    getMovieExternalIds = tmdbClientMocks.getMovieExternalIds;
    getTvShowDetails = tmdbClientMocks.getTvShowDetails;
    hasTvSeason = tmdbClientMocks.hasTvSeason;
    getTvRecommendations = tmdbClientMocks.getTvRecommendations;
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

import {
  clearPosterEnrichmentCache,
  hasPosterLookupData,
  PosterService,
} from "./PosterService";

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
    vi.useRealTimers();
    clearPosterEnrichmentCache();
    tmdbClientMocks.resolvePosterPath.mockReset();
    tmdbClientMocks.fetchPosterImage.mockReset();
    tmdbClientMocks.searchTv.mockReset();
    tmdbClientMocks.searchMovie.mockReset();
    tmdbClientMocks.getEpisodeExternalIds.mockReset();
    tmdbClientMocks.getMovieExternalIds.mockReset();
    tmdbClientMocks.getTvShowDetails.mockReset();
    tmdbClientMocks.hasTvSeason.mockReset();
    tmdbClientMocks.getTvRecommendations.mockReset();
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
          mediaTitle: "",
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
          get: () => null,
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
          get: () => null,
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
      contentType: "image/jpeg",
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

  it("enriches episode IDs before TMDB poster lookup when history has only a title", async () => {
    const imageBytes = new Uint8Array([1, 2, 3]).buffer;
    tmdbClientMocks.searchTv.mockResolvedValue([
      {
        id: 308014,
        name: "Berlin and the Lady with an Ermine",
        firstAirDate: "2026-05-15",
        popularity: 20,
      },
    ]);
    tmdbClientMocks.getEpisodeExternalIds
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ imdbId: "tt31397887", tvdbId: 10597958 });
    tmdbClientMocks.hasTvSeason
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    tmdbClientMocks.getTvShowDetails.mockResolvedValue({
      id: 308014,
      numberOfSeasons: 1,
    });
    tmdbClientMocks.resolvePosterPath.mockResolvedValue("/series.jpg");
    tmdbClientMocks.fetchPosterImage.mockResolvedValue({
      buffer: imageBytes,
      contentType: "image/jpeg",
    });

    const service = new PosterService();
    const result = await service.fetchPoster(
      createSyncHistory({
        mediaType: "episode",
        mediaTitle: "Berlin and the Lady with an Ermine",
        posterUrl: undefined,
        tmdbMovieId: undefined,
        tmdbSeriesId: undefined,
        imdbEpisodeId: undefined,
        tvdbEpisodeId: undefined,
        seasonNumber: 2,
        episodeNumber: 1,
      }),
      createUser(),
      { tmdbAccessToken: "tmdb-token" }
    );

    expect(result).toEqual({
      buffer: Buffer.from(imageBytes),
      contentType: "image/jpeg",
    });
    expect(tmdbClientMocks.resolvePosterPath).toHaveBeenCalledWith(
      expect.objectContaining({
        tmdbSeriesId: "308014",
        imdbEpisodeId: "tt31397887",
        tvdbEpisodeId: "10597958",
      })
    );
  });

  it("maps movie and episode IDs through poster enrichment lookup", async () => {
    const imageBytes = new Uint8Array([9, 9, 9]).buffer;
    tmdbClientMocks.resolvePosterPath.mockResolvedValue("/poster.jpg");
    tmdbClientMocks.fetchPosterImage.mockResolvedValue({
      buffer: imageBytes,
      contentType: "image/jpeg",
    });

    const service = new PosterService();

    await service.fetchPoster(
      createSyncHistory({
        posterUrl: undefined,
        tmdbMovieId: undefined,
        tvdbMovieId: "218",
        imdbMovieId: "tt0816692",
      }),
      createUser(),
      { tmdbAccessToken: "tmdb-token" }
    );
    await service.fetchPoster(
      createSyncHistory({
        mediaType: "episode",
        mediaTitle: "Berlin",
        posterUrl: undefined,
        tmdbMovieId: undefined,
        tmdbSeriesId: "146176",
        tvdbEpisodeId: "8865290",
        seasonNumber: 1,
        episodeNumber: 1,
      }),
      createUser(),
      { tmdbAccessToken: "tmdb-token" }
    );
    await service.fetchPoster(
      createSyncHistory({
        mediaType: "clip",
        mediaTitle: "Trailer",
        posterUrl: undefined,
        tmdbMovieId: undefined,
      }),
      createUser(),
      { tmdbAccessToken: "tmdb-token" }
    );

    expect(tmdbClientMocks.resolvePosterPath).toHaveBeenCalled();
    expect(tmdbClientMocks.resolvePosterPath).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tvdbMovieId: "218",
        imdbMovieId: "tt0816692",
      })
    );
    expect(tmdbClientMocks.resolvePosterPath).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tmdbSeriesId: "146176",
        tvdbEpisodeId: "8865290",
      })
    );
  });

  it("treats title-only history as having poster lookup data", () => {
    expect(
      hasPosterLookupData(
        createSyncHistory({
          posterUrl: undefined,
          tmdbMovieId: undefined,
          mediaTitle: "Berlin",
        })
      )
    ).toBe(true);
  });

  it("caches successful title enrichment and skips repeated TMDB searches", async () => {
    const imageBytes = new Uint8Array([4, 5, 6]).buffer;
    tmdbClientMocks.searchMovie.mockResolvedValue([
      {
        id: 157336,
        title: "Interstellar",
        releaseDate: "2014-11-07",
        popularity: 50,
      },
    ]);
    tmdbClientMocks.getMovieExternalIds.mockResolvedValue({
      imdbId: "tt0816692",
    });
    tmdbClientMocks.resolvePosterPath.mockResolvedValue("/interstellar.jpg");
    tmdbClientMocks.fetchPosterImage.mockResolvedValue({
      buffer: imageBytes,
      contentType: "image/jpeg",
    });

    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PosterService({ save });
    const history = createSyncHistory({
      posterUrl: undefined,
      tmdbMovieId: undefined,
      imdbMovieId: undefined,
      mediaTitle: "Interstellar",
      year: 2014,
    });

    await service.fetchPoster(history, createUser(), {
      tmdbAccessToken: "tmdb-token",
    });
    await service.fetchPoster(
      createSyncHistory({
        ...history,
        tmdbMovieId: undefined,
        imdbMovieId: undefined,
      }),
      createUser(),
      { tmdbAccessToken: "tmdb-token" }
    );

    expect(tmdbClientMocks.searchMovie).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        tmdbMovieId: "157336",
        imdbMovieId: "tt0816692",
      })
    );
  });

  it("backs off failed title searches so mediaTitle alone does not re-hit TMDB", async () => {
    vi.useFakeTimers();
    tmdbClientMocks.searchMovie.mockResolvedValue([]);
    tmdbClientMocks.resolvePosterPath.mockResolvedValue(null);

    const service = new PosterService();
    const history = createSyncHistory({
      posterUrl: undefined,
      tmdbMovieId: undefined,
      imdbMovieId: undefined,
      mediaTitle: "Unknown Title",
      year: 2099,
    });

    await service.fetchPoster(history, createUser(), {
      tmdbAccessToken: "tmdb-token",
    });

    expect(hasPosterLookupData(history)).toBe(false);
    await service.fetchPoster(history, createUser(), {
      tmdbAccessToken: "tmdb-token",
    });
    expect(tmdbClientMocks.searchMovie).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60_000);
    expect(hasPosterLookupData(history)).toBe(true);
    await service.fetchPoster(history, createUser(), {
      tmdbAccessToken: "tmdb-token",
    });
    expect(tmdbClientMocks.searchMovie).toHaveBeenCalledTimes(2);
  });
});
