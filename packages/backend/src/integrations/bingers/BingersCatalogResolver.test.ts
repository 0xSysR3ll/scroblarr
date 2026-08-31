import type { MediaItem } from "@scroblarr/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BingersCatalogResolver } from "./BingersCatalogResolver";

describe("BingersCatalogResolver", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves a movie via search + metadata external IDs", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "movie-1",
                kind: "movie",
                metadata: "abc123",
                card: { originalTitle: "Interstellar", year: 2014 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@abc123.json")) {
        return new Response(
          JSON.stringify({
            id: "movie-1",
            kind: "movie",
            year: 2014,
            external_ids: [
              { id: "tt0816692", source: "imdb" },
              { id: "157336", source: "tmdb" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    const media: MediaItem = {
      id: "m1",
      type: "movie",
      title: "Interstellar",
      year: 2014,
      imdbMovieId: "tt0816692",
      tmdbMovieId: 157336,
    };

    await expect(resolver.resolveEntity(media)).resolves.toEqual({
      entityKind: "movie",
      entityId: "movie-1",
      titleId: "movie-1",
    });
  });

  it("resolves an episode via versions + season grain", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "show-1",
                kind: "show",
                metadata: "meta1",
                card: { originalTitle: "Outer Banks", year: 2020 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "show-1",
            kind: "show",
            year: 2020,
            external_ids: [{ id: "100757", source: "tmdb", type: "tv" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/versions.json")) {
        return new Response(
          JSON.stringify({
            files: { seasons: { "1": "seasonTok" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/season-1@seasonTok.json")) {
        return new Response(
          JSON.stringify({
            season: 1,
            episodes: [
              { id: "ep-1", n: 1 },
              { id: "ep-2", n: 2 },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    const media: MediaItem = {
      id: "e1",
      type: "episode",
      title: "Outer Banks",
      year: 2020,
      seasonNumber: 1,
      episodeNumber: 2,
      tmdbSeriesId: 100757,
    };

    await expect(resolver.resolveEntity(media)).resolves.toEqual({
      entityKind: "episode",
      entityId: "ep-2",
      titleId: "show-1",
    });
  });

  it("throws when no external IDs or title+year match (no blind first-hit fallback)", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "wrong-1",
                kind: "movie",
                metadata: "abc",
                card: { originalTitle: "Totally Different", year: 1999 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@abc.json")) {
        return new Response(
          JSON.stringify({
            id: "wrong-1",
            kind: "movie",
            year: 1999,
            external_ids: [{ id: "tt9999999", source: "imdb" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
        year: 2014,
        imdbMovieId: "tt0816692",
      })
    ).rejects.toThrow(/Could not resolve Bingers movie entity/i);
  });

  it("falls back to title+year when external IDs do not match", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "movie-1",
                kind: "movie",
                metadata: "abc",
                card: { originalTitle: "Interstellar", year: 2014 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@abc.json")) {
        return new Response(
          JSON.stringify({
            id: "movie-1",
            kind: "movie",
            year: 2014,
            external_ids: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
        year: 2014,
        imdbMovieId: "tt0816692",
      })
    ).resolves.toEqual({
      entityKind: "movie",
      entityId: "movie-1",
      titleId: "movie-1",
    });
  });

  it("rethrows rate-limit and auth errors from metadata fetch", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "movie-1",
                kind: "movie",
                metadata: "abc",
                card: { originalTitle: "Interstellar", year: 2014 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@abc.json")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "rate_limited",
              message: "slow down",
              retryAfterSeconds: 30,
            },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
        year: 2014,
        imdbMovieId: "tt0816692",
      })
    ).rejects.toMatchObject({ isRateLimited: true, status: 429 });
  });

  it("throws when episode season is missing from versions", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [{ id: "show-1", kind: "show", metadata: "meta1" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "show-1",
            kind: "show",
            external_ids: [{ id: "100757", source: "tmdb" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/versions.json")) {
        return new Response(JSON.stringify({ files: { seasons: {} } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "e1",
        type: "episode",
        title: "Outer Banks",
        seasonNumber: 9,
        episodeNumber: 1,
        tmdbSeriesId: 100757,
      })
    ).rejects.toThrow(/no season 9/i);
  });

  it("rejects unsupported media types", async () => {
    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "s1",
        type: "series",
        title: "Example Series",
      } as unknown as MediaItem)
    ).rejects.toThrow(/Unsupported media type: series/i);
  });

  it("requires season and episode numbers for episodes", async () => {
    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "e1",
        type: "episode",
        title: "Example Show",
      })
    ).rejects.toThrow(/seasonNumber and episodeNumber/i);
  });

  it("resolves a show via TVDB series id metadata", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "show-1",
                kind: "show",
                metadata: "meta1",
                card: { originalTitle: "Locke & Key", year: 2020 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "show-1",
            kind: "show",
            year: 2020,
            external_ids: [{ id: "361594", source: "tvdb", type: "series" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/versions.json")) {
        return new Response(
          JSON.stringify({ files: { seasons: { "1": "seasonTok" } } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/season-1@seasonTok.json")) {
        return new Response(
          JSON.stringify({
            season: 1,
            episodes: [{ id: "ep-1", n: 1 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "e1",
        type: "episode",
        title: "Locke & Key",
        year: 2020,
        seasonNumber: 1,
        episodeNumber: 1,
        tvdbSeriesId: 361594,
      })
    ).resolves.toEqual({
      entityKind: "episode",
      entityId: "ep-1",
      titleId: "show-1",
    });
  });

  it("resolves a show via unique exact title match when IDs are missing", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "show-1",
                kind: "show",
                metadata: "meta1",
                card: { originalTitle: "Locke & Key", year: 2020 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "show-1",
            kind: "show",
            year: 2020,
            external_ids: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/versions.json")) {
        return new Response(
          JSON.stringify({ files: { seasons: { "1": "seasonTok" } } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/season-1@seasonTok.json")) {
        return new Response(
          JSON.stringify({
            season: 1,
            episodes: [{ id: "ep-1", n: 1 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "e1",
        type: "episode",
        title: "Locke & Key",
        seasonNumber: 1,
        episodeNumber: 1,
        tvdbEpisodeId: 9300505,
      })
    ).resolves.toEqual({
      entityKind: "episode",
      entityId: "ep-1",
      titleId: "show-1",
    });
  });

  it("does not use title-only fallback when year is present but unmatched", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "show-1",
                kind: "show",
                metadata: "meta1",
                card: { originalTitle: "Locke & Key", year: 2020 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "show-1",
            kind: "show",
            year: 2020,
            external_ids: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "e1",
        type: "episode",
        title: "Locke & Key",
        year: 2021,
        seasonNumber: 1,
        episodeNumber: 1,
        tvdbEpisodeId: 9300505,
      })
    ).rejects.toThrow(/Could not resolve Bingers show entity/i);
  });

  it("does not use title-only fallback when multiple shows share the title", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "show-uk",
                kind: "show",
                metadata: "meta-uk",
                card: { originalTitle: "The Office", year: 2001 },
              },
              {
                id: "show-us",
                kind: "show",
                metadata: "meta-us",
                card: { originalTitle: "The Office", year: 2005 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta-uk.json")) {
        return new Response(
          JSON.stringify({
            id: "show-uk",
            kind: "show",
            year: 2001,
            external_ids: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta-us.json")) {
        return new Response(
          JSON.stringify({
            id: "show-us",
            kind: "show",
            year: 2005,
            external_ids: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "e1",
        type: "episode",
        title: "The Office",
        seasonNumber: 1,
        episodeNumber: 1,
      })
    ).rejects.toThrow(/Could not resolve Bingers show entity/i);
  });

  it("throws when the show cannot be matched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ results: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
      )
    );

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "e1",
        type: "episode",
        title: "Missing Show",
        seasonNumber: 1,
        episodeNumber: 1,
      })
    ).rejects.toThrow(/Could not resolve Bingers show entity/i);
  });

  it("throws when the episode number is missing from the season grain", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "show-1",
                kind: "show",
                metadata: "meta1",
                card: { originalTitle: "Outer Banks", year: 2020 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "show-1",
            kind: "show",
            external_ids: [{ id: "100757", source: "tmdb" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/versions.json")) {
        return new Response(
          JSON.stringify({ files: { seasons: { "1": "seasonTok" } } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/season-1@seasonTok.json")) {
        return new Response(
          JSON.stringify({ season: 1, episodes: [{ id: "ep-1", n: 1 }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "e1",
        type: "episode",
        title: "Outer Banks",
        seasonNumber: 1,
        episodeNumber: 9,
        tmdbSeriesId: 100757,
      })
    ).rejects.toThrow(/S1E9/i);
  });

  it("requires a non-empty title for catalog search", async () => {
    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "   ",
      })
    ).rejects.toThrow(/Title is required/i);
  });

  it("ignores metadata fetch failures for individual candidates", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "bad-1",
                kind: "movie",
                metadata: "bad-meta",
                card: { originalTitle: "Wrong", year: 2014 },
              },
              {
                id: "movie-1",
                kind: "movie",
                metadata: "good-meta",
                card: { originalTitle: "Interstellar", year: 2014 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@bad-meta.json")) {
        return new Response("boom", { status: 500 });
      }
      if (url.includes("/metadata@good-meta.json")) {
        return new Response(
          JSON.stringify({
            id: "movie-1",
            kind: "movie",
            year: 2014,
            external_ids: [{ id: "tt0816692", source: "imdb" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
        year: 2014,
        imdbMovieId: "tt0816692",
      })
    ).resolves.toEqual({
      entityKind: "movie",
      entityId: "movie-1",
      titleId: "movie-1",
    });
  });

  it("matches movies via TVDB ids and localized title fallbacks", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "movie-1",
                kind: "movie",
                metadata: "meta1",
                card: {
                  originalTitle: "Different",
                  year: 2014,
                  titlesI18n: { en: "Interstellar" },
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "movie-1",
            kind: "movie",
            year: 2014,
            external_ids: [{ id: "12345", source: "tvdb" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
        year: 2014,
        tvdbMovieId: 12345,
      })
    ).resolves.toEqual({
      entityKind: "movie",
      entityId: "movie-1",
      titleId: "movie-1",
    });
  });

  it("falls back to localized titles when metadata ids do not match", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "movie-1",
                kind: "movie",
                metadata: "meta1",
                card: {
                  originalTitle: "Different",
                  year: 2014,
                  titlesI18n: { en: "Interstellar" },
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "movie-1",
            kind: "movie",
            year: 2014,
            external_ids: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
        year: 2014,
        imdbMovieId: "tt0816692",
      })
    ).resolves.toEqual({
      entityKind: "movie",
      entityId: "movie-1",
      titleId: "movie-1",
    });
  });

  it("maps catalog request timeouts to descriptive errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      })
    );

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
      })
    ).rejects.toThrow(/catalog request timed out/i);
  });

  it("rethrows unexpected catalog fetch errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network failure");
      })
    );

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
      })
    ).rejects.toThrow("network failure");
  });

  it("handles search responses without a results array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
      )
    );

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Unknown Movie",
        year: 2020,
      })
    ).rejects.toThrow(/Could not resolve Bingers movie entity/i);
  });

  it("handles metadata entries with missing external id values", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "movie-1",
                kind: "movie",
                metadata: "meta1",
                card: { originalTitle: "Interstellar", year: 2014 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "movie-1",
            kind: "movie",
            year: 2014,
            external_ids: [
              { source: "imdb", id: null },
              { source: "themoviedb.com", id: null },
              { source: "tvdb", id: null },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
        year: 2014,
        imdbMovieId: "tt0816692",
        tmdbMovieId: 157336,
        tvdbMovieId: 12345,
      })
    ).resolves.toEqual({
      entityKind: "movie",
      entityId: "movie-1",
      titleId: "movie-1",
    });
  });

  it("falls back to title matching when metadata omits external_ids", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "movie-1",
                kind: "movie",
                metadata: "meta1",
                card: { originalTitle: "Interstellar", year: 2014 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "movie-1",
            kind: "movie",
            year: 2014,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
        year: 2014,
      })
    ).resolves.toEqual({
      entityKind: "movie",
      entityId: "movie-1",
      titleId: "movie-1",
    });
  });

  it("does not resolve from a title-only match without year or external ids", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/search/titles")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "movie-1",
                kind: "movie",
                metadata: "meta1",
                card: { originalTitle: "Interstellar" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/metadata@meta1.json")) {
        return new Response(
          JSON.stringify({
            id: "movie-1",
            kind: "movie",
            external_ids: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolver = new BingersCatalogResolver();
    await expect(
      resolver.resolveEntity({
        id: "m1",
        type: "movie",
        title: "Interstellar",
      })
    ).rejects.toThrow(/could not resolve/i);
  });
});
