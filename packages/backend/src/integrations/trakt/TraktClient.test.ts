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

  it("surfaces JSON error messages from Trakt", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue(JSON.stringify({ message: "expired" })),
    });
    const client = new TraktClient("client-id");

    await expect(
      client.scrobble(makeEpisodeEvent(), "access-token")
    ).rejects.toThrow("Trakt API error: 401 - expired");
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
