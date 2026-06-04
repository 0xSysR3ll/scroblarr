import type { MediaEvent } from "@scroblarr/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    tvtime: {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  },
}));

import { TVTimeClient } from "./TVTimeClient";

describe("TVTimeClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends episode scrobbles through sidecar with the rewatch flag", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ result: "OK" }),
    });
    const client = new TVTimeClient();

    await client.scrobble(makeEpisodeEvent(), "access-token", {
      markEpisodesAsRewatched: true,
    });

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    const parsed = new URL(url);

    expect(request).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer access-token",
        Host: "app.tvtime.com:80",
      }),
      body: JSON.stringify(""),
    });
    expect(parsed.searchParams.get("is_rewatch")).toBe("1");
    expect(decodeSidecarUrl(parsed)).toBe(
      "https://api2.tozelabs.com/v2/watched_episodes/episode/12345"
    );
  });

  it("rejects non-OK episode results from TVTime", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ result: "ERROR" }),
    });
    const client = new TVTimeClient();

    await expect(
      client.scrobble(makeEpisodeEvent(), "access-token")
    ).rejects.toThrow("TVTime API returned non-OK result: ERROR");
  });

  it("searches and scrobbles movies by UUID", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          status: "success",
          data: [{ id: 111, uuid: "movie-uuid", imdb_id: "tt1234567" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: "success" }),
      });
    const client = new TVTimeClient();

    await client.scrobble(makeMovieEvent(), "access-token", {
      markMoviesAsRewatched: true,
    });

    const [searchUrl] = fetchMock.mock.calls[0] as [string];
    const [watchUrl, watchRequest] = fetchMock.mock.calls[1] as [
      string,
      { method: string; headers: Record<string, string> },
    ];

    const parsedSearch = new URL(searchUrl);
    expect(parsedSearch.searchParams.get("q")).toBe("tt1234567");
    expect(decodeSidecarUrl(parsedSearch)).toBe(
      "https://search.tvtime.com/v1/search/series,movie"
    );

    expect(watchRequest).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer access-token",
      }),
    });
    expect(decodeSidecarUrl(new URL(watchUrl))).toBe(
      "https://msapi.tvtime.com/prod/v1/tracking/movie-uuid/rewatch"
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
        tvdbEpisodeId: 12345,
      },
    };
  }

  function makeMovieEvent(): MediaEvent {
    return {
      event: "scrobble",
      source: "plex",
      userId: "plex-user",
      timestamp: new Date("2026-06-04T17:00:00.000Z"),
      media: {
        id: "movie-1",
        type: "movie",
        title: "Example Movie",
        imdbMovieId: "tt1234567",
      },
    };
  }

  function decodeSidecarUrl(url: URL): string {
    const encoded = url.searchParams.get("o_b64");
    if (!encoded) {
      throw new Error("Missing sidecar URL");
    }
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf-8");
  }
});
