import type { MediaEvent, MediaItem } from "@scroblarr/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BingersApiError } from "./BingersApiError";
import type { BingersCatalogResolver } from "./BingersCatalogResolver";
import { BingersClient } from "./BingersClient";

describe("BingersClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeEvent(overrides?: Partial<MediaEvent>): MediaEvent {
    return {
      event: "scrobble",
      source: "plex",
      userId: "plex-user",
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      media: {
        id: "m1",
        type: "movie",
        title: "Interstellar",
        year: 2014,
      },
      ...overrides,
    };
  }

  function mockFetchSequence(
    handlers: Array<
      (url: string, init?: RequestInit) => Response | Promise<Response>
    >
  ) {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const handler = handlers.shift();
      if (!handler) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      return handler(url, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("pushes a watched movie entry with cookie auth", async () => {
    const catalog = {
      resolveEntity: vi.fn().mockResolvedValue({
        entityKind: "movie",
        entityId: "movie-1",
        titleId: "movie-1",
      }),
    } as unknown as BingersCatalogResolver;

    const fetchMock = mockFetchSequence([
      () =>
        new Response(JSON.stringify({ entries: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      () => new Response(null, { status: 200 }),
    ]);

    const client = new BingersClient(catalog);
    await client.scrobble(makeEvent(), "session_token=abc");

    expect(catalog.resolveEntity).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sync/pull");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.bingers.app/sync/push"
    );

    const [, request] = fetchMock.mock.calls[1] as unknown as [
      string,
      { body: string },
    ];
    const body = JSON.parse(request.body);
    expect(body.clientBatchId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(body.ops).toHaveLength(1);
    expect(body.ops[0]).toMatchObject({
      table: "entries",
      pk: { entityKind: "movie", entityId: "movie-1" },
      fields: { watched: true, plays: 1, batchId: null },
    });
  });

  it("skips push when the remote entry is already watched", async () => {
    const catalog = {
      resolveEntity: vi.fn().mockResolvedValue({
        entityKind: "movie",
        entityId: "movie-1",
        titleId: "movie-1",
      }),
    } as unknown as BingersCatalogResolver;

    const fetchMock = mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({
            entries: [
              {
                entityKind: "movie",
                entityId: "movie-1",
                watched: true,
                plays: 3,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        ),
    ]);

    const client = new BingersClient(catalog);
    await client.scrobble(makeEvent(), "session_token=abc");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sync/pull");
  });

  it("uses the higher of local and remote play counts for rewatches", async () => {
    const catalog = {
      resolveEntity: vi.fn().mockResolvedValue({
        entityKind: "movie",
        entityId: "movie-1",
        titleId: "movie-1",
      }),
    } as unknown as BingersCatalogResolver;

    const fetchMock = mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({
            entries: [
              {
                entityKind: "movie",
                entityId: "movie-1",
                watched: true,
                plays: 5,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        ),
      () => new Response(null, { status: 200 }),
    ]);

    const client = new BingersClient(catalog);
    await client.scrobble(makeEvent(), "session_token=abc", {
      markMoviesAsRewatched: true,
      bingersLocalPlayCount: 3,
    });

    const [, request] = fetchMock.mock.calls[1] as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(request.body).ops[0].fields.plays).toBe(6);
  });

  it("rejects empty cookie headers as auth errors", async () => {
    const client = new BingersClient({
      resolveEntity: vi.fn(),
    } as unknown as BingersCatalogResolver);

    await expect(client.scrobble(makeEvent(), "  ")).rejects.toBeInstanceOf(
      BingersApiError
    );
  });

  it("maps 401 responses to BingersApiError", async () => {
    const catalog = {
      resolveEntity: vi.fn().mockResolvedValue({
        entityKind: "movie",
        entityId: "movie-1",
        titleId: "movie-1",
      }),
    } as unknown as BingersCatalogResolver;

    mockFetchSequence([
      () =>
        new Response(JSON.stringify({ entries: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      () => new Response("unauthorized", { status: 401 }),
    ]);

    const client = new BingersClient(catalog);
    await expect(
      client.scrobble(makeEvent(), "session_token=dead")
    ).rejects.toMatchObject({
      name: "BingersApiError",
      status: 401,
      isAuthError: true,
    });
  });

  it("maps non-auth HTTP errors to BingersApiError", async () => {
    const catalog = {
      resolveEntity: vi.fn().mockResolvedValue({
        entityKind: "movie",
        entityId: "movie-1",
        titleId: "movie-1",
      }),
    } as unknown as BingersCatalogResolver;

    mockFetchSequence([
      () =>
        new Response(JSON.stringify({ entries: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      () => new Response("server error", { status: 500 }),
    ]);

    const client = new BingersClient(catalog);
    await expect(
      client.scrobble(makeEvent(), "session_token=abc")
    ).rejects.toMatchObject({
      name: "BingersApiError",
      status: 500,
    });
  });

  it("maps push timeouts to a descriptive error", async () => {
    const catalog = {
      resolveEntity: vi.fn().mockResolvedValue({
        entityKind: "movie",
        entityId: "movie-1",
        titleId: "movie-1",
      }),
    } as unknown as BingersCatalogResolver;

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/sync/pull")) {
        return new Response(JSON.stringify({ entries: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new BingersClient(catalog);
    await expect(
      client.scrobble(makeEvent(), "session_token=abc")
    ).rejects.toThrow("Bingers sync/push timed out");
  });

  it("returns the integration name", () => {
    expect(new BingersClient().getName()).toBe("Bingers");
  });

  it("rejects unsupported media types", async () => {
    const client = new BingersClient({
      resolveEntity: vi.fn(),
    } as unknown as BingersCatalogResolver);

    await expect(
      client.scrobble(
        makeEvent({
          media: {
            id: "s1",
            type: "series",
            title: "Example Series",
          } as unknown as MediaItem,
        }),
        "session_token=abc"
      )
    ).rejects.toThrow(/Unsupported media type: series/i);
  });

  it("pushes episode entries with rewatch play counts", async () => {
    const catalog = {
      resolveEntity: vi.fn().mockResolvedValue({
        entityKind: "episode",
        entityId: "ep-1",
        titleId: "show-1",
      }),
    } as unknown as BingersCatalogResolver;

    const fetchMock = mockFetchSequence([
      () =>
        new Response(JSON.stringify({ entries: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      () => new Response(null, { status: 200 }),
    ]);

    const client = new BingersClient(catalog);
    await client.scrobble(
      makeEvent({
        media: {
          id: "e1",
          type: "episode",
          title: "Example Show",
          seasonNumber: 1,
          episodeNumber: 2,
        },
      }),
      "session_token=abc",
      { markEpisodesAsRewatched: true, bingersLocalPlayCount: 2 }
    );

    const [, request] = fetchMock.mock.calls[1] as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(request.body).ops[0].pk.entityKind).toBe("episode");
    expect(JSON.parse(request.body).ops[0].fields.plays).toBe(2);
  });

  it("rethrows unexpected push errors", async () => {
    const catalog = {
      resolveEntity: vi.fn().mockResolvedValue({
        entityKind: "movie",
        entityId: "movie-1",
        titleId: "movie-1",
      }),
    } as unknown as BingersCatalogResolver;

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/sync/pull")) {
        return new Response(JSON.stringify({ entries: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new BingersClient(catalog);
    await expect(
      client.scrobble(makeEvent(), "session_token=abc")
    ).rejects.toThrow("network down");
  });
});
