import { TmdbRateLimitError } from "@integrations/tmdb/TmdbApiError";
import { TmdbClient } from "@integrations/tmdb/TmdbClient";
import type { MediaItem } from "@scroblarr/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaIdEnricher, needsMediaIdEnrichment } from "./MediaIdEnricher";

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

function episode(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "episode-1",
    type: "episode",
    title: "Berlin and the Lady with an Ermine",
    seasonNumber: 2,
    episodeNumber: 1,
    ...overrides,
  };
}

describe("needsMediaIdEnrichment", () => {
  it("is true when an episode or movie has no external IDs", () => {
    expect(needsMediaIdEnrichment(episode())).toBe(true);
    expect(
      needsMediaIdEnrichment({
        id: "m1",
        type: "movie",
        title: "Interstellar",
      })
    ).toBe(true);
  });

  it("is false when identifiers are already present", () => {
    expect(
      needsMediaIdEnrichment(episode({ tvdbEpisodeId: 123, tmdbSeriesId: 1 }))
    ).toBe(false);
    expect(needsMediaIdEnrichment(episode({ imdbEpisodeId: "tt1" }))).toBe(
      false
    );
    expect(needsMediaIdEnrichment(episode({ tmdbSeriesId: 99 }))).toBe(false);
    expect(
      needsMediaIdEnrichment({
        id: "m1",
        type: "movie",
        title: "Interstellar",
        tmdbMovieId: 1,
      })
    ).toBe(false);
  });

  it("is false for unsupported media types", () => {
    expect(
      needsMediaIdEnrichment({
        id: "x",
        type: "clip",
        title: "Clip",
      } as unknown as MediaItem)
    ).toBe(false);
  });
});

describe("MediaIdEnricher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enriches episode IDs from TMDB and remaps season for single-season shows", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 308014,
          name: "Berlin and the Lady with an Ermine",
          originalName: "Berlín y la dama del armiño",
          firstAirDate: "2026-05-15",
        },
      ]),
      getEpisodeExternalIds: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ imdbId: "tt999", tvdbId: 555 }),
      hasTvSeason: vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
      getTvShowDetails: vi.fn().mockResolvedValue({
        id: 308014,
        numberOfSeasons: 1,
      }),
    } as unknown as TmdbClient;

    const enricher = new MediaIdEnricher(client);
    const enriched = await enricher.enrich(episode());

    expect(enriched).toEqual(
      expect.objectContaining({
        tmdbSeriesId: 308014,
        seasonNumber: 1,
        episodeNumber: 1,
        imdbEpisodeId: "tt999",
        tvdbEpisodeId: 555,
      })
    );
    expect(client.getEpisodeExternalIds).toHaveBeenCalledWith(308014, 2, 1);
    expect(client.getEpisodeExternalIds).toHaveBeenCalledWith(308014, 1, 1);
  });

  it("keeps the original season when TMDB has that season", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 146176,
          name: "Berlin",
          originalName: "Berlín",
          firstAirDate: "2023-12-29",
          popularity: 20,
        },
      ]),
      getEpisodeExternalIds: vi.fn().mockResolvedValue({
        imdbId: "tt111",
        tvdbId: 777,
      }),
      hasTvSeason: vi.fn(),
      getTvShowDetails: vi.fn(),
    } as unknown as TmdbClient;

    const enricher = new MediaIdEnricher(client);
    const enriched = await enricher.enrich(
      episode({
        title: "Berlin",
        seasonNumber: 2,
        episodeNumber: 1,
      })
    );

    expect(enriched).toEqual(
      expect.objectContaining({
        tmdbSeriesId: 146176,
        seasonNumber: 2,
        tvdbEpisodeId: 777,
        imdbEpisodeId: "tt111",
      })
    );
    expect(client.getTvShowDetails).not.toHaveBeenCalled();
  });

  it("ignores non-exact title matches like Babylon Berlin", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 146176,
          name: "Berlin",
          originalName: "Berlín",
          firstAirDate: "2023-12-29",
          popularity: 20,
        },
        {
          id: 66980,
          name: "Babylon Berlin",
          originalName: "Babylon Berlin",
          firstAirDate: "2017-10-13",
          popularity: 25,
        },
      ]),
      getEpisodeExternalIds: vi.fn().mockImplementation(async (id: number) => {
        if (id === 146176) {
          return null;
        }
        return { imdbId: "tt5753668", tvdbId: 6361964 };
      }),
      hasTvSeason: vi
        .fn()
        .mockImplementation(async (id: number, season: number) => {
          return id === 66980 && season === 2;
        }),
      getTvShowDetails: vi.fn().mockResolvedValue({
        id: 146176,
        name: "Berlin",
        numberOfSeasons: 1,
      }),
      getTvRecommendations: vi.fn().mockResolvedValue([]),
    } as unknown as TmdbClient;

    const media = episode({
      title: "Berlin",
      seasonNumber: 2,
      episodeNumber: 1,
    });
    const enricher = new MediaIdEnricher(client);
    await expect(enricher.enrich(media)).resolves.toBe(media);
    expect(client.getEpisodeExternalIds).not.toHaveBeenCalledWith(
      66980,
      expect.anything(),
      expect.anything()
    );
  });

  it("resolves old Berlin S2 matches via TMDB sequel recommendations", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 146176,
          name: "Berlin",
          originalName: "Berlín",
          firstAirDate: "2023-12-29",
          popularity: 20,
        },
      ]),
      getEpisodeExternalIds: vi.fn().mockImplementation(async (id: number) => {
        if (id === 308014) {
          return { imdbId: "tt31397887", tvdbId: 10597958 };
        }
        return null;
      }),
      hasTvSeason: vi
        .fn()
        .mockImplementation(async (id: number, season: number) => {
          return id === 308014 && season === 1;
        }),
      getTvShowDetails: vi.fn().mockResolvedValue({
        id: 146176,
        numberOfSeasons: 1,
      }),
      getTvRecommendations: vi.fn().mockResolvedValue([
        {
          id: 218351,
          name: "The Gold",
          firstAirDate: "2023-02-12",
        },
        {
          id: 308014,
          name: "Berlin and the Lady with an Ermine",
          originalName: "Berlín y la dama del armiño",
          firstAirDate: "2026-05-15",
          popularity: 5,
        },
      ]),
    } as unknown as TmdbClient;

    const enricher = new MediaIdEnricher(client);
    const enriched = await enricher.enrich(
      episode({
        title: "Berlin",
        seasonNumber: 2,
        episodeNumber: 1,
      })
    );

    expect(enriched).toEqual(
      expect.objectContaining({
        title: "Berlin",
        seasonNumber: 1,
        episodeNumber: 1,
        tmdbSeriesId: 308014,
        imdbEpisodeId: "tt31397887",
        tvdbEpisodeId: 10597958,
      })
    );
  });

  it("skips sequel recommendations that do not contain the episode season", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 146176,
          name: "Berlin",
          originalName: "Berlín",
          firstAirDate: "2023-12-29",
          popularity: 20,
        },
      ]),
      getEpisodeExternalIds: vi.fn().mockResolvedValue(null),
      hasTvSeason: vi.fn().mockResolvedValue(false),
      getTvShowDetails: vi.fn().mockResolvedValue({
        id: 146176,
        name: "Berlin",
        numberOfSeasons: 1,
      }),
      getTvRecommendations: vi.fn().mockResolvedValue([
        {
          id: 218351,
          name: "The Gold",
          popularity: 10,
        },
      ]),
    } as unknown as TmdbClient;

    const media = episode({
      title: "Berlin",
      seasonNumber: 2,
      episodeNumber: 1,
    });
    const enricher = new MediaIdEnricher(client);
    await expect(enricher.enrich(media)).resolves.toBe(media);
  });

  it("does not remap short parent titles like Berlin to season 1", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 146176,
          name: "Berlin",
          originalName: "Berlín",
          firstAirDate: "2023-12-29",
        },
      ]),
      getEpisodeExternalIds: vi.fn().mockResolvedValue(null),
      hasTvSeason: vi.fn().mockResolvedValue(false),
      getTvShowDetails: vi.fn().mockResolvedValue({
        id: 146176,
        name: "Berlin",
        numberOfSeasons: 1,
      }),
      getTvRecommendations: vi.fn().mockResolvedValue([]),
    } as unknown as TmdbClient;

    const media = episode({
      title: "Berlin",
      seasonNumber: 2,
      episodeNumber: 1,
    });
    const enricher = new MediaIdEnricher(client);
    await expect(enricher.enrich(media)).resolves.toBe(media);
  });

  it("returns null when remapped season does not exist on TMDB", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 308014,
          name: "Berlin and the Lady with an Ermine",
          firstAirDate: "2026-05-15",
        },
      ]),
      getEpisodeExternalIds: vi.fn().mockResolvedValue(null),
      hasTvSeason: vi.fn().mockResolvedValue(false),
      getTvShowDetails: vi.fn().mockResolvedValue({
        id: 308014,
        numberOfSeasons: 1,
      }),
      getTvRecommendations: vi.fn().mockResolvedValue([]),
    } as unknown as TmdbClient;

    const media = episode();
    const enricher = new MediaIdEnricher(client);
    await expect(enricher.enrich(media)).resolves.toBe(media);
  });

  it("enriches with series ID when season exists but episode external IDs are missing", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 146176,
          name: "Berlin",
          originalName: "Berlín",
          firstAirDate: "2023-12-29",
          popularity: 20,
        },
      ]),
      getEpisodeExternalIds: vi.fn().mockResolvedValue(null),
      hasTvSeason: vi.fn().mockResolvedValue(true),
      getTvShowDetails: vi.fn(),
    } as unknown as TmdbClient;

    const media = episode({
      title: "Berlin",
      seasonNumber: 1,
      episodeNumber: 1,
    });
    const enricher = new MediaIdEnricher(client);
    await expect(enricher.enrich(media)).resolves.toEqual(
      expect.objectContaining({
        tmdbSeriesId: 146176,
        seasonNumber: 1,
        episodeNumber: 1,
      })
    );
  });

  it("skips episode enrichment when title or season/episode numbers are missing", async () => {
    const client = {
      searchTv: vi.fn(),
    } as unknown as TmdbClient;
    const enricher = new MediaIdEnricher(client);

    await expect(enricher.enrich(episode({ title: "" }))).resolves.toEqual(
      episode({ title: "" })
    );
    await expect(
      enricher.enrich(episode({ seasonNumber: undefined }))
    ).resolves.toEqual(episode({ seasonNumber: undefined }));
    expect(client.searchTv).not.toHaveBeenCalled();
  });

  it("enriches movie IDs from TMDB search", async () => {
    const client = {
      searchMovie: vi.fn().mockResolvedValue([
        {
          id: 999,
          title: "Interstellar",
          releaseDate: "2010-01-01",
        },
        {
          id: 157336,
          title: "Wrong",
          originalTitle: "Interstellar",
          releaseDate: "2014-11-05",
          popularity: 50,
        },
      ]),
      getMovieExternalIds: vi.fn().mockResolvedValue({
        imdbId: "tt0816692",
      }),
    } as unknown as TmdbClient;

    const enricher = new MediaIdEnricher(client);
    const enriched = await enricher.enrich({
      id: "movie-1",
      type: "movie",
      title: "Interstellar",
      year: 2014,
    });

    expect(enriched).toEqual(
      expect.objectContaining({
        tmdbMovieId: 157336,
        imdbMovieId: "tt0816692",
      })
    );
    expect(enriched.tvdbMovieId).toBeUndefined();
  });

  it("leaves movies unchanged when title is missing or TMDB finds no exact match", async () => {
    const client = {
      searchMovie: vi.fn().mockResolvedValue([
        {
          id: 1,
          title: "Something Else",
          releaseDate: "2014-01-01",
        },
      ]),
    } as unknown as TmdbClient;
    const enricher = new MediaIdEnricher(client);

    await expect(
      enricher.enrich({ id: "m", type: "movie", title: "" })
    ).resolves.toEqual({ id: "m", type: "movie", title: "" });
    await expect(
      enricher.enrich({
        id: "m",
        type: "movie",
        title: "Interstellar",
        year: 2014,
      })
    ).resolves.toEqual({
      id: "m",
      type: "movie",
      title: "Interstellar",
      year: 2014,
    });
  });

  it("leaves media unchanged when TMDB finds no match", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([]),
    } as unknown as TmdbClient;

    const media = episode();
    const enricher = new MediaIdEnricher(client);
    await expect(enricher.enrich(media)).resolves.toBe(media);
  });

  it("prefers year-matched TV results when ranking candidates", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 1,
          name: "Berlin",
          firstAirDate: "2010-01-01",
          popularity: 100,
        },
        {
          id: 146176,
          name: "Berlin",
          originalName: "Berlín",
          firstAirDate: "2023-12-29",
          popularity: 1,
        },
      ]),
      getEpisodeExternalIds: vi.fn().mockImplementation(async (id: number) => {
        if (id === 146176) {
          return { imdbId: "tt16304556", tvdbId: 8865290 };
        }
        return null;
      }),
      hasTvSeason: vi.fn().mockResolvedValue(false),
      getTvShowDetails: vi.fn().mockResolvedValue({
        id: 1,
        numberOfSeasons: 1,
      }),
      getTvRecommendations: vi.fn().mockResolvedValue([]),
    } as unknown as TmdbClient;

    const enricher = new MediaIdEnricher(client);
    const enriched = await enricher.enrich(
      episode({
        title: "Berlin",
        year: 2023,
        seasonNumber: 1,
        episodeNumber: 1,
      })
    );

    expect(enriched.tmdbSeriesId).toBe(146176);
    expect(client.getEpisodeExternalIds).toHaveBeenCalledWith(146176, 1, 1);
  });

  it("handles TMDB rate limits and generic enrichment failures", async () => {
    const rateLimited = {
      searchTv: vi.fn().mockRejectedValue(new TmdbRateLimitError()),
    } as unknown as TmdbClient;
    const genericFailure = {
      searchTv: vi.fn().mockRejectedValue(new Error("network")),
    } as unknown as TmdbClient;

    const media = episode();
    await expect(new MediaIdEnricher(rateLimited).enrich(media)).resolves.toBe(
      media
    );
    await expect(
      new MediaIdEnricher(genericFailure).enrich(media)
    ).resolves.toBe(media);
  });

  it("returns media unchanged from enrich when IDs are already present", async () => {
    const client = {
      searchTv: vi.fn(),
      searchMovie: vi.fn(),
    } as unknown as TmdbClient;
    const enricher = new MediaIdEnricher(client);
    const media = episode({ tmdbSeriesId: 146176 });

    await expect(enricher.enrich(media)).resolves.toBe(media);
    expect(client.searchTv).not.toHaveBeenCalled();
    expect(client.searchMovie).not.toHaveBeenCalled();
  });

  it("reuses season-existence lookups within a single enrichment run", async () => {
    const hasTvSeason = vi.fn().mockResolvedValue(false);
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 146176,
          name: "Berlin",
          firstAirDate: "2023-12-29",
          popularity: 20,
        },
        {
          id: 146176,
          name: "Berlin",
          firstAirDate: "2023-12-29",
          popularity: 19,
        },
      ]),
      getEpisodeExternalIds: vi.fn().mockResolvedValue(null),
      hasTvSeason,
      getTvShowDetails: vi.fn().mockResolvedValue({
        id: 146176,
        name: "Berlin",
        numberOfSeasons: 1,
      }),
      getTvRecommendations: vi.fn().mockResolvedValue([]),
    } as unknown as TmdbClient;

    const media = episode({
      title: "Berlin",
      seasonNumber: 2,
      episodeNumber: 1,
    });
    const enricher = new MediaIdEnricher(client);
    await expect(enricher.enrich(media)).resolves.toBe(media);

    // Same series/season is checked for both duplicate candidates; second hit uses cache.
    expect(hasTvSeason).toHaveBeenCalledTimes(1);
    expect(hasTvSeason).toHaveBeenCalledWith(146176, 2);
  });

  it("skips sequel lookup when requested season exists on the parent show", async () => {
    const client = {
      searchTv: vi.fn().mockResolvedValue([
        {
          id: 146176,
          name: "Berlin",
          firstAirDate: "2023-12-29",
          popularity: 20,
        },
      ]),
      getEpisodeExternalIds: vi.fn().mockResolvedValue(null),
      hasTvSeason: vi.fn().mockResolvedValue(false),
      getTvShowDetails: vi.fn().mockResolvedValue({
        id: 146176,
        name: "Berlin",
        numberOfSeasons: 2,
      }),
      getTvRecommendations: vi.fn(),
    } as unknown as TmdbClient;

    const media = episode({
      title: "Berlin",
      seasonNumber: 2,
      episodeNumber: 1,
    });
    const enricher = new MediaIdEnricher(client);
    await expect(enricher.enrich(media)).resolves.toBe(media);
    expect(client.getTvRecommendations).not.toHaveBeenCalled();
  });
});
