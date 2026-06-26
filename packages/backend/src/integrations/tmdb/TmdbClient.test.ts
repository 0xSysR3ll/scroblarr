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
});
