import type { MediaEvent } from "@scroblarr/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    simkl: {
      error: vi.fn(),
    },
  },
}));

import { SimklClient } from "./SimklClient";

describe("SimklClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends the expected movie history payload", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ added: { movies: 1 } }),
    });
    const client = new SimklClient("client-id");

    await client.scrobble(
      {
        event: "scrobble",
        source: "plex",
        userId: "plex-user",
        timestamp: new Date("2026-06-04T17:00:00.000Z"),
        media: {
          id: "movie-1",
          type: "movie",
          title: "Example Movie",
          imdbMovieId: "tt1234567",
          tmdbMovieId: 123,
          year: 2024,
        },
      },
      "access-token"
    );

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    const actualUrl = new URL(url);
    expect(actualUrl.pathname).toBe("/sync/history");
    expect(actualUrl.searchParams.get("client_id")).toBe("client-id");
    expect(actualUrl.searchParams.get("app-name")).toBe("scroblarr");
    expect(actualUrl.searchParams.get("app-version")).toBe("1.0.0");
    expect(request.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer access-token",
        "simkl-api-key": "client-id",
        "User-Agent": "Scroblarr/1.0.0",
      })
    );
    expect(JSON.parse(request.body)).toEqual({
      movies: [
        {
          title: "Example Movie",
          year: 2024,
          watched_at: "2026-06-04T17:00:00Z",
          ids: {
            imdb: "tt1234567",
            tmdb: 123,
          },
        },
      ],
    });
  });

  it("sends movie history with title fallback when no IDs are available", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ added: { movies: 1 } }),
    });
    const client = new SimklClient("client-id");

    await client.scrobble(
      {
        event: "scrobble",
        source: "plex",
        userId: "plex-user",
        timestamp: new Date("2026-06-04T17:00:00.000Z"),
        media: {
          id: "movie-1",
          type: "movie",
          title: "Example Movie",
          year: 2024,
        },
      },
      "access-token"
    );

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual({
      movies: [
        {
          title: "Example Movie",
          year: 2024,
          watched_at: "2026-06-04T17:00:00Z",
          ids: {},
        },
      ],
    });
  });

  it("sends episode history with season and TVDB episode IDs", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ added: { episodes: 1 } }),
    });
    const client = new SimklClient("client-id");

    await client.scrobble(makeEpisodeEvent(), "access-token");

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual({
      shows: [
        {
          title: "Example Show",
          year: 2024,
          seasons: [
            {
              number: 2,
              episodes: [
                {
                  number: 3,
                  watched_at: "2026-06-04T17:00:00Z",
                  ids: {
                    tvdb: 98765,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("sends top-level episode history when only a TVDB episode ID is available", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ added: { episodes: 1 } }),
    });
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.seasonNumber = undefined;
    event.media.episodeNumber = undefined;

    await client.scrobble(event, "access-token");

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual({
      episodes: [
        {
          watched_at: "2026-06-04T17:00:00Z",
          ids: {
            tvdb: 98765,
          },
        },
      ],
    });
  });

  it("loads user profiles", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        user: {
          name: "alice",
          avatar: "https://img.example/alice.png",
        },
        account: {
          id: 51,
        },
      }),
    });
    const client = new SimklClient("client-id");

    await expect(client.getUserProfile("access-token")).resolves.toEqual({
      id: 51,
      username: "alice",
      image: "https://img.example/alice.png",
    });

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body?: string },
    ];
    expect(new URL(url).pathname).toBe("/users/settings");
    expect(request.method).toBe("POST");
    expect(request.body).toBeUndefined();
  });

  it("surfaces Simkl API errors", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi
        .fn()
        .mockResolvedValue(JSON.stringify({ error: "invalid_token" })),
    });
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(makeEpisodeEvent(), "bad-token")
    ).rejects.toThrow("Simkl API error: 401 - invalid_token");
  });

  it("rejects unmatched Simkl history responses", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        added: { movies: 0 },
        not_found: { movies: [{ title: "Example Movie" }] },
      }),
    });
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(
        {
          event: "scrobble",
          source: "plex",
          userId: "plex-user",
          timestamp: new Date("2026-06-04T17:00:00.000Z"),
          media: {
            id: "movie-1",
            type: "movie",
            title: "Example Movie",
          },
        },
        "access-token"
      )
    ).rejects.toThrow("Simkl could not match the media item");
  });

  it("rejects episodes without IDs or season and episode numbers", async () => {
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.tvdbEpisodeId = undefined;
    event.media.seasonNumber = undefined;
    event.media.episodeNumber = undefined;

    await expect(client.scrobble(event, "access-token")).rejects.toThrow(
      "Episode requires a TVDB episode ID or season/episode numbers"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  function makeEpisodeEvent(): MediaEvent {
    return {
      event: "scrobble",
      source: "plex",
      userId: "plex-user",
      timestamp: new Date("2026-06-04T17:00:00.000Z"),
      media: {
        id: "episode-1",
        type: "episode",
        title: "Example Show",
        year: 2024,
        seasonNumber: 2,
        episodeNumber: 3,
        tvdbEpisodeId: 98765,
      },
    };
  }
});
