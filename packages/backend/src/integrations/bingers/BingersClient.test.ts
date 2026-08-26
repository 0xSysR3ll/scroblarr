import type { MediaEvent } from "@scroblarr/shared";
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

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
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

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
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
});
