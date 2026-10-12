import type { MediaEvent } from "@scroblarr/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    trakt: {
      error: vi.fn(),
    },
  },
}));

import { TraktClient } from "./TraktClient";

describe("TraktClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends the expected movie scrobble payload", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
    });
    const client = new TraktClient("client-id");

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
          year: 2024,
        },
      },
      "access-token"
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.trakt.tv/scrobble/stop",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "trakt-api-key": "client-id",
          "trakt-api-version": "2",
        }),
      })
    );

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual({
      movie: {
        ids: {
          imdb: "tt1234567",
        },
      },
      progress: 100,
    });
  });

  it("uses season and episode numbers when episode IDs are unavailable", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
    });
    const client = new TraktClient("client-id");

    await client.scrobble(makeEpisodeEvent(), "access-token");

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual({
      episode: {
        season: 2,
        number: 3,
      },
      show: {
        title: "Example Show",
        year: 2024,
      },
      progress: 100,
    });
  });

  it("surfaces auth errors from WWW-Authenticate headers", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({
        "www-authenticate":
          'Bearer realm="Trakt", error="invalid_token", error_description="The access token is invalid"',
      }),
      text: vi.fn().mockResolvedValue(""),
    });
    const client = new TraktClient("client-id");

    await expect(
      client.scrobble(makeEpisodeEvent(), "access-token")
    ).rejects.toThrow(
      "Trakt token expired or revoked; re-link your account in Profile > Integrations"
    );
  });

  it("surfaces JSON error messages from Trakt for non-auth failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers(),
      text: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ message: "already scrobbled recently" })
        ),
    });
    const client = new TraktClient("client-id");

    await expect(
      client.scrobble(makeEpisodeEvent(), "access-token")
    ).rejects.toThrow("Trakt API error: 409 - already scrobbled recently");
  });

  it("surfaces auth errors for movie scrobbles", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({
        "www-authenticate":
          'Bearer realm="Trakt", error="invalid_token", error_description="The access token is invalid"',
      }),
      text: vi.fn().mockResolvedValue(""),
    });
    const client = new TraktClient("client-id");

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
            imdbMovieId: "tt1234567",
            year: 2024,
          },
        },
        "access-token"
      )
    ).rejects.toThrow(
      "Trakt token expired or revoked; re-link your account in Profile > Integrations"
    );
  });

  it("rejects episodes without an ID or season and episode numbers", async () => {
    const client = new TraktClient("client-id");
    const event = makeEpisodeEvent();
    event.media.seasonNumber = undefined;
    event.media.episodeNumber = undefined;

    await expect(client.scrobble(event, "access-token")).rejects.toThrow(
      "Episode requires at least TVDB ID, IMDB ID, or season/episode numbers"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports its integration name", () => {
    expect(new TraktClient("client-id").getName()).toBe("Trakt");
  });

  it("rejects unsupported media types", async () => {
    const client = new TraktClient("client-id");

    await expect(
      client.scrobble(
        {
          event: "scrobble",
          source: "plex",
          userId: "plex-user",
          timestamp: new Date("2026-06-04T17:00:00.000Z"),
          media: {
            id: "track-1",
            type: "track" as "movie",
            title: "Song",
          },
        },
        "access-token"
      )
    ).rejects.toThrow("Unsupported media type: track");
  });

  it("uses TVDB episode IDs when present", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const client = new TraktClient("client-id");
    const event = makeEpisodeEvent();
    event.media.tvdbEpisodeId = 12345;
    event.media.tmdbSeriesId = 99;

    await client.scrobble(event, "access-token");

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual({
      episode: {
        ids: { tvdb: 12345 },
        season: 2,
        number: 3,
      },
      show: {
        ids: { tmdb: 99 },
        title: "Example Show",
        year: 2024,
      },
      progress: 100,
    });
  });

  it("falls back to IMDB episode IDs", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const client = new TraktClient("client-id");
    const event = makeEpisodeEvent();
    event.media.imdbEpisodeId = "tt999";

    await client.scrobble(event, "access-token");

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body).episode.ids).toEqual({ imdb: "tt999" });
  });

  it("rejects episode scrobbles without a show title", async () => {
    const client = new TraktClient("client-id");
    const event = makeEpisodeEvent();
    event.media.title = undefined as unknown as string;

    await expect(client.scrobble(event, "access-token")).rejects.toThrow(
      "Show title is required for episode scrobble"
    );
  });

  it("uses TMDB movie IDs when IMDB is absent", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const client = new TraktClient("client-id");

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
          tmdbMovieId: 42,
          year: 2024,
        },
      },
      "access-token"
    );

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body).movie.ids).toEqual({ tmdb: 42 });
  });

  it("uses TVDB movie IDs when IMDB and TMDB are absent", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const client = new TraktClient("client-id");

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
          tvdbMovieId: 77,
          year: 2024,
        },
      },
      "access-token"
    );

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body).movie.ids).toEqual({ tvdb: 77 });
  });

  it("falls back to title and year for movies without IDs", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const client = new TraktClient("client-id");

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
    expect(JSON.parse(request.body).movie).toEqual({
      title: "Example Movie",
      year: 2024,
    });
  });

  it("rejects movies without IDs or a title", async () => {
    const client = new TraktClient("client-id");

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
            title: undefined as unknown as string,
          },
        },
        "access-token"
      )
    ).rejects.toThrow(
      "Movie requires at least IMDB ID, TMDB ID, TVDB ID, or title"
    );
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
      },
    };
  }
});
