import type { MediaItem } from "@scroblarr/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BingersCatalogResolver } from "./BingersCatalogResolver";

describe("BingersCatalogResolver", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves a movie via search + metadata external IDs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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

  it("throws when episode season is missing from versions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
});
