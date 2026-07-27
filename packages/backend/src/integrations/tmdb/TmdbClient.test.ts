import { afterEach, describe, expect, it, vi } from "vitest";

import { TmdbRateLimitError } from "./TmdbApiError";
import { TmdbClient } from "./TmdbClient";
import { clearTmdbPosterCache } from "./TmdbPosterCache";

describe("TmdbClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearTmdbPosterCache();
  });

  it("resolves movie posters by TMDB id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ poster_path: "/movie-poster.jpg" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    const posterPath = await client.resolvePosterPath({
      mediaType: "movie",
      tmdbMovieId: "123",
    });

    expect(posterPath).toBe("/movie-poster.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/movie/123",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );

    fetchMock.mockClear();
    const cachedPosterPath = await client.resolvePosterPath({
      mediaType: "movie",
      tmdbMovieId: "123",
    });
    expect(cachedPosterPath).toBe("/movie-poster.jpg");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves episode posters from series TMDB id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ poster_path: "/series-poster.jpg" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    const posterPath = await client.resolvePosterPath({
      mediaType: "episode",
      tmdbSeriesId: "456",
    });

    expect(posterPath).toBe("/series-poster.jpg");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/tv/456",
      expect.any(Object)
    );
  });

  it("fetches poster images from the TMDB CDN", async () => {
    const imageBytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "image/jpeg" : null,
      },
      arrayBuffer: async () => imageBytes,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    const result = await client.fetchPosterImage("/poster.jpg");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://image.tmdb.org/t/p/w500/poster.jpg",
      expect.objectContaining({
        headers: { Accept: "image/*" },
      })
    );
    expect(result.contentType).toBe("image/jpeg");
    expect(result.buffer).toBe(imageBytes);
  });

  it("falls back to IMDb find results for movies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ poster_path: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          movie_results: [{ poster_path: "/imdb-movie.jpg" }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    const posterPath = await client.resolvePosterPath({
      mediaType: "movie",
      tmdbMovieId: "123",
      imdbMovieId: "tt1234567",
    });

    expect(posterPath).toBe("/imdb-movie.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves episode posters via IMDb episode lookup", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tv_episode_results: [{ show_id: 789 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ poster_path: "/episode-series.jpg" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    const posterPath = await client.resolvePosterPath({
      mediaType: "episode",
      imdbEpisodeId: "tt7654321",
    });

    expect(posterPath).toBe("/episode-series.jpg");
  });

  it("resolves episode posters via TVDB episode lookup", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tv_episode_results: [{ show_id: 321 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ poster_path: "/tvdb-series.jpg" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    const posterPath = await client.resolvePosterPath({
      mediaType: "episode",
      tvdbEpisodeId: "9230216",
    });

    expect(posterPath).toBe("/tvdb-series.jpg");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.themoviedb.org/3/find/9230216?external_source=tvdb_id",
      expect.any(Object)
    );
  });

  it("falls back to TVDB find results for movies", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        movie_results: [{ poster_path: "/tvdb-movie.jpg" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    const posterPath = await client.resolvePosterPath({
      mediaType: "movie",
      tvdbMovieId: "218",
    });

    expect(posterPath).toBe("/tvdb-movie.jpg");
  });

  it("returns null when TMDB has no match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );

    const client = new TmdbClient("test-token");
    await expect(
      client.resolvePosterPath({
        mediaType: "movie",
        tmdbMovieId: "999",
      })
    ).resolves.toBeNull();
  });

  it("falls back from series TMDB id to IMDb episode lookup", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ poster_path: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tv_episode_results: [{ show_id: 999 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ poster_path: "/fallback-series.jpg" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    const posterPath = await client.resolvePosterPath({
      mediaType: "episode",
      tmdbSeriesId: "123",
      imdbEpisodeId: "tt7654321",
    });

    expect(posterPath).toBe("/fallback-series.jpg");
  });

  it("returns null when TVDB episode lookup finds a show without a poster", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tv_episode_results: [{ show_id: 321 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ poster_path: null }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    await expect(
      client.resolvePosterPath({
        mediaType: "episode",
        tvdbEpisodeId: "9230216",
      })
    ).resolves.toBeNull();
  });

  it("returns null when episode lookup results omit a show id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tv_episode_results: [{}],
        }),
      })
    );

    const client = new TmdbClient("test-token");
    await expect(
      client.resolvePosterPath({
        mediaType: "episode",
        imdbEpisodeId: "tt7654321",
      })
    ).resolves.toBeNull();
  });

  it("returns null when episode lookup finds no TMDB match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );

    const client = new TmdbClient("test-token");
    await expect(
      client.resolvePosterPath({
        mediaType: "episode",
        imdbEpisodeId: "tt7654321",
      })
    ).resolves.toBeNull();
  });

  it("returns null when IMDb episode lookup finds a show without a poster", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tv_episode_results: [{ show_id: 789 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ poster_path: null }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    await expect(
      client.resolvePosterPath({
        mediaType: "episode",
        imdbEpisodeId: "tt7654321",
      })
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.themoviedb.org/3/find/tt7654321?external_source=imdb_id",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.themoviedb.org/3/tv/789",
      expect.any(Object)
    );
  });

  it("returns null when movie fallbacks exhaust all lookup sources", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ poster_path: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          movie_results: [{ poster_path: null }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          movie_results: [{ poster_path: null }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");
    await expect(
      client.resolvePosterPath({
        mediaType: "movie",
        tmdbMovieId: "123",
        imdbMovieId: "tt1234567",
        tvdbMovieId: "218",
      })
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.themoviedb.org/3/movie/123",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.themoviedb.org/3/find/tt1234567?external_source=imdb_id",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.themoviedb.org/3/find/218?external_source=tvdb_id",
      expect.any(Object)
    );
  });

  it("supports TV find results when resolving TV poster paths", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tv_results: [{ poster_path: "/tv-show.jpg" }],
        }),
      })
    );

    const client = new TmdbClient("test-token");
    const findPosterPath = (
      client as unknown as {
        findPosterPath: (
          externalId: string,
          externalSource: "imdb_id" | "tvdb_id",
          mediaKind: "movie" | "tv"
        ) => Promise<string | null>;
      }
    ).findPosterPath.bind(client);

    await expect(findPosterPath("tt9999999", "imdb_id", "tv")).resolves.toBe(
      "/tv-show.jpg"
    );
  });

  it("returns null for TV find results without a poster path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tv_results: [{ poster_path: null }],
        }),
      })
    );

    const client = new TmdbClient("test-token");
    const findPosterPath = (
      client as unknown as {
        findPosterPath: (
          externalId: string,
          externalSource: "imdb_id" | "tvdb_id",
          mediaKind: "movie" | "tv"
        ) => Promise<string | null>;
      }
    ).findPosterPath.bind(client);

    await expect(
      findPosterPath("tt9999999", "imdb_id", "tv")
    ).resolves.toBeNull();
  });

  it("returns null when TV find results are missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
    );

    const client = new TmdbClient("test-token");
    const findPosterPath = (
      client as unknown as {
        findPosterPath: (
          externalId: string,
          externalSource: "imdb_id" | "tvdb_id",
          mediaKind: "movie" | "tv"
        ) => Promise<string | null>;
      }
    ).findPosterPath.bind(client);

    await expect(
      findPosterPath("tt9999999", "imdb_id", "tv")
    ).resolves.toBeNull();
  });

  it("throws for unexpected TMDB API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
    );

    const client = new TmdbClient("test-token");
    await expect(
      client.resolvePosterPath({
        mediaType: "movie",
        tmdbMovieId: "123",
      })
    ).rejects.toThrow("TMDB API error: 500");
  });

  it("throws when TMDB rate limits API requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      })
    );

    const client = new TmdbClient("test-token");
    await expect(
      client.resolvePosterPath({
        mediaType: "movie",
        tmdbMovieId: "123",
      })
    ).rejects.toBeInstanceOf(TmdbRateLimitError);
  });

  it("returns null for unsupported media types", async () => {
    const client = new TmdbClient("test-token");
    await expect(
      client.resolvePosterPath({
        mediaType: "clip",
      })
    ).resolves.toBeNull();
  });

  it("throws when poster image fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );

    const client = new TmdbClient("test-token");
    await expect(client.fetchPosterImage("/missing.jpg")).rejects.toThrow(
      "TMDB image fetch failed: 404"
    );
  });

  it("defaults poster image content type when TMDB omits the header", async () => {
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

    const client = new TmdbClient("test-token");
    await expect(client.fetchPosterImage("/poster.jpg")).resolves.toEqual({
      buffer: imageBytes,
      contentType: "image/jpeg",
    });
  });

  it("searches TV and movies and maps enrichment helpers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: 146176,
              name: "Berlin",
              original_name: "Berlín",
              first_air_date: "2023-12-29",
              popularity: 20,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: 157336,
              title: "Interstellar",
              original_title: "Interstellar",
              release_date: "2014-11-05",
              popularity: 50,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: "Berlin",
          original_name: "Berlín",
          poster_path: "/p.jpg",
          number_of_seasons: 1,
          first_air_date: "2023-12-29",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: "Berlin",
          original_name: "Berlín",
          poster_path: "/p.jpg",
          number_of_seasons: 1,
          first_air_date: "2023-12-29",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: 308014,
              name: "Berlin and the Lady with an Ermine",
              original_name: "Berlín y la dama del armiño",
              first_air_date: "2026-05-15",
              popularity: 23,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          imdb_id: "tt16288804",
          tvdb_id: 413033,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          imdb_id: "tt0816692",
          tvdb_id: 218,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          imdb_id: "tt31397887",
          tvdb_id: 10597958,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ season_number: 1 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TmdbClient("test-token");

    await expect(client.searchTv("Berlin", 2023)).resolves.toEqual([
      {
        id: 146176,
        name: "Berlin",
        originalName: "Berlín",
        firstAirDate: "2023-12-29",
        popularity: 20,
      },
    ]);
    await expect(client.searchMovie("Interstellar", 2014)).resolves.toEqual([
      {
        id: 157336,
        title: "Interstellar",
        originalTitle: "Interstellar",
        releaseDate: "2014-11-05",
        popularity: 50,
      },
    ]);
    await expect(client.getTvShowDetails(146176)).resolves.toEqual({
      id: 146176,
      name: "Berlin",
      originalName: "Berlín",
      posterPath: "/p.jpg",
      numberOfSeasons: 1,
      firstAirDate: "2023-12-29",
    });
    await expect(client.getTvShowDetails("146176")).resolves.toEqual({
      id: 146176,
      name: "Berlin",
      originalName: "Berlín",
      posterPath: "/p.jpg",
      numberOfSeasons: 1,
      firstAirDate: "2023-12-29",
    });
    await expect(client.getTvRecommendations(146176)).resolves.toEqual([
      {
        id: 308014,
        name: "Berlin and the Lady with an Ermine",
        originalName: "Berlín y la dama del armiño",
        firstAirDate: "2026-05-15",
        popularity: 23,
      },
    ]);
    await expect(client.getTvExternalIds(146176)).resolves.toEqual({
      imdbId: "tt16288804",
      tvdbId: 413033,
    });
    await expect(client.getMovieExternalIds(157336)).resolves.toEqual({
      imdbId: "tt0816692",
      tvdbId: 218,
    });
    await expect(client.getEpisodeExternalIds(308014, 1, 1)).resolves.toEqual({
      imdbId: "tt31397887",
      tvdbId: 10597958,
    });
    await expect(client.hasTvSeason(308014, 1)).resolves.toBe(true);
    await expect(client.hasTvSeason(308014, 2)).resolves.toBe(false);
    await expect(client.getTvShowDetails("missing")).resolves.toBeNull();
    await expect(client.getTvExternalIds("missing")).resolves.toBeNull();
    await expect(client.getMovieExternalIds("missing")).resolves.toBeNull();
    await expect(
      client.getEpisodeExternalIds("missing", 1, 1)
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/search/tv?query=Berlin&include_adult=false&first_air_date_year=2023",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/search/movie?query=Interstellar&include_adult=false&year=2014",
      expect.any(Object)
    );
  });

  it("returns empty search results when TMDB payloads omit results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
    );

    const client = new TmdbClient("test-token");
    await expect(client.searchTv("Nope")).resolves.toEqual([]);
    await expect(client.searchMovie("Nope")).resolves.toEqual([]);
    await expect(client.getTvRecommendations(1)).resolves.toEqual([]);
  });

  it("maps null external IDs to undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          imdb_id: null,
          tvdb_id: null,
        }),
      })
    );

    const client = new TmdbClient("test-token");
    await expect(client.getTvExternalIds(1)).resolves.toEqual({
      imdbId: undefined,
      tvdbId: undefined,
    });
    await expect(client.getMovieExternalIds(1)).resolves.toEqual({
      imdbId: undefined,
      tvdbId: undefined,
    });
    await expect(client.getEpisodeExternalIds(1, 1, 1)).resolves.toEqual({
      imdbId: undefined,
      tvdbId: undefined,
    });
  });
});
