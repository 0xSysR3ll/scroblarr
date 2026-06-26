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
});
