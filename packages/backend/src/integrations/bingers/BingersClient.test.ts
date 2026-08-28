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

  it("pushes a watched movie entry with cookie auth", async () => {
    const catalog = {
      resolveEntity: vi.fn().mockResolvedValue({
        entityKind: "movie",
        entityId: "movie-1",
        titleId: "movie-1",
      }),
    } as unknown as BingersCatalogResolver;

    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new BingersClient(catalog);
    await client.scrobble(makeEvent(), "session_token=abc");

    expect(catalog.resolveEntity).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.bingers.app/sync/push",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Cookie: "session_token=abc",
          Origin: "https://bingers.app",
        }),
      })
    );

    const [, request] = fetchMock.mock.calls[0] as unknown as [
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

  it("sends an absolute play count for rewatches", async () => {
    const catalog = {
      resolveEntity: vi.fn().mockResolvedValue({
        entityKind: "movie",
        entityId: "movie-1",
        titleId: "movie-1",
      }),
    } as unknown as BingersCatalogResolver;

    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new BingersClient(catalog);
    await client.scrobble(makeEvent(), "session_token=abc", {
      plays: 4,
      markMoviesAsRewatched: true,
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const body = JSON.parse(request.body);
    expect(body.ops[0].fields.plays).toBe(4);
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

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unauthorized", { status: 401 }))
    );

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

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("server error", { status: 500 }))
    );

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

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      })
    );

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

    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

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
      { markEpisodesAsRewatched: true, plays: 2 }
    );

    const [, request] = fetchMock.mock.calls[0] as unknown as [
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

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const client = new BingersClient(catalog);
    await expect(
      client.scrobble(makeEvent(), "session_token=abc")
    ).rejects.toThrow("network down");
  });
});
