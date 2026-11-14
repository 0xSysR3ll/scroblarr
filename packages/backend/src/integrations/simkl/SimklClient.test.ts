import type { MediaEvent } from "@scroblarr/shared";
import { getAppVersionForClients, getUserAgent } from "@utils/appVersion";
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

  it("reports its destination name", () => {
    expect(new SimklClient("client-id").getName()).toBe("Simkl");
  });

  it("sends the expected movie history payload", async () => {
    mockOkJson({ added: { movies: 1 } });
    const client = new SimklClient("client-id");

    await client.scrobble(
      makeMovieEvent({
        imdbMovieId: "tt1234567",
        tmdbMovieId: 123,
        year: 2024,
      }),
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
    expect(actualUrl.searchParams.get("app-version")).toBe(
      getAppVersionForClients()
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer access-token",
        "simkl-api-key": "client-id",
        "User-Agent": getUserAgent(),
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
    mockOkJson({ added: { movies: 1 } });
    const client = new SimklClient("client-id");

    await client.scrobble(makeMovieEvent({ year: 2024 }), "access-token");

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

  it("prefers show season/episode history even when a TVDB episode ID is available", async () => {
    mockOkJson({ added: { episodes: 1 } });
    const client = new SimklClient("client-id");

    await client.scrobble(makeEpisodeEvent(), "access-token");

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual(expectedShowEpisodeHistory());
  });

  it("includes series ids and use_tvdb_anime_seasons on show history payloads", async () => {
    mockOkJson({ added: { shows: 1 } });
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.tmdbSeriesId = 1399;
    event.media.tvdbSeriesId = 121361;

    await client.scrobble(event, "access-token");

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual({
      shows: [
        {
          title: "Example Show",
          year: 2024,
          ids: { tmdb: 1399, tvdb: 121361 },
          use_tvdb_anime_seasons: true,
          seasons: [
            {
              number: 2,
              episodes: [
                {
                  number: 3,
                  watched_at: "2026-06-04T17:00:00Z",
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("includes series TVDB and TMDB ids on season-based show payloads", async () => {
    mockOkJson({ added: { episodes: 1 } });
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.tvdbEpisodeId = undefined;
    event.media.tvdbSeriesId = 361594;
    event.media.tmdbSeriesId = 1399;

    await client.scrobble(event, "access-token");

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual({
      shows: [
        {
          title: "Example Show",
          year: 2024,
          ids: { tmdb: 1399, tvdb: 361594 },
          use_tvdb_anime_seasons: true,
          seasons: [
            {
              number: 2,
              episodes: [
                {
                  number: 3,
                  watched_at: "2026-06-04T17:00:00Z",
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("batches multiple history items into a single /sync/history request", async () => {
    mockOkJson({ added: { movies: 1, episodes: 1 } });
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [
        {
          event: makeMovieEvent({
            imdbMovieId: "tt1234567",
            tmdbMovieId: 123,
            year: 2024,
          }),
        },
        { event: makeEpisodeEvent() },
      ],
      "access-token"
    );

    expect(results).toEqual([
      { success: true, result: { wasRewatched: false } },
      { success: true, result: { wasRewatched: false } },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual({
      movies: [
        {
          title: "Example Movie",
          year: 2024,
          watched_at: "2026-06-04T17:00:00Z",
          ids: { imdb: "tt1234567", tmdb: 123 },
        },
      ],
      shows: [
        {
          title: "Example Show",
          year: 2024,
          use_tvdb_anime_seasons: true,
          seasons: [
            {
              number: 2,
              episodes: [
                {
                  number: 3,
                  watched_at: "2026-06-04T17:00:00Z",
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("marks only unmatched batch items as failed from not_found", async () => {
    mockOkJson({
      added: { episodes: 1 },
      not_found: {
        movies: [
          {
            title: "Example Movie",
            year: 2024,
            watched_at: "2026-06-04T17:00:00Z",
            ids: { imdb: "tt1234567", tmdb: 123 },
          },
        ],
      },
    });
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [
        {
          event: makeMovieEvent({
            imdbMovieId: "tt1234567",
            tmdbMovieId: 123,
            year: 2024,
          }),
        },
        { event: makeEpisodeEvent() },
      ],
      "access-token"
    );

    expect(results[0]).toEqual({
      success: false,
      error: expect.any(Error),
    });
    expect(results[0]).toMatchObject({
      success: false,
    });
    expect((results[0] as { error: Error }).error.message).toBe(
      "Simkl could not match the media item"
    );
    expect(results[1]).toEqual({
      success: true,
      result: { wasRewatched: false },
    });
  });

  it("matches title-only not_found echoes that add rating: null", async () => {
    mockOkJson({
      added: {
        movies: 0,
        shows: 0,
        episodes: 0,
        statuses: [],
      },
      not_found: {
        movies: [
          {
            title: "ZZZ-Definitely-Not-A-Real-Movie-Title-XYZ",
            year: 9999,
            rating: null,
          },
        ],
        shows: [],
        episodes: [],
      },
    });
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [
        {
          event: makeMovieEvent({
            title: "ZZZ-Definitely-Not-A-Real-Movie-Title-XYZ",
            year: 9999,
          }),
        },
      ],
      "access-token"
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(false);
    expect((results[0] as { error: Error }).error.message).toBe(
      "Simkl could not match the media item"
    );
  });

  it("matches batch status echoes that add type/rating and stringify ids", async () => {
    mockOkJson({
      added: {
        movies: 1,
        statuses: [
          {
            request: {
              watched_at: "2026-06-04T17:00:00Z",
              title: "Example Movie",
              year: 2024,
              ids: { imdb: "tt1234567", tmdb: "123" },
              type: "movie",
              rating: null,
            },
            response: {
              status: "completed",
              rewatch_id: 77,
              rewatch_status: "active",
            },
          },
        ],
      },
      not_found: { movies: [], shows: [], episodes: [] },
    });
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [
        {
          event: makeMovieEvent({
            imdbMovieId: "tt1234567",
            tmdbMovieId: 123,
            year: 2024,
          }),
          options: { markMoviesAsRewatched: true },
        },
      ],
      "access-token"
    );

    expect(results).toEqual([
      {
        success: true,
        result: { wasRewatched: true, simklRewatchId: 77 },
      },
    ]);
  });

  it("returns an empty array when scrobbleMany receives no items", async () => {
    const client = new SimklClient("client-id");
    await expect(client.scrobbleMany([], "access-token")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records prepare failures without calling Simkl for those items", async () => {
    mockOkJson({ added: { episodes: 1 } });
    const client = new SimklClient("client-id");
    const badEpisode = makeEpisodeEvent();
    badEpisode.media.tvdbEpisodeId = undefined;
    badEpisode.media.seasonNumber = undefined;
    badEpisode.media.episodeNumber = undefined;

    const results = await client.scrobbleMany(
      [{ event: badEpisode }, { event: makeEpisodeEvent() }],
      "access-token"
    );

    expect(results[0]?.success).toBe(false);
    expect((results[0] as { error: Error }).error.message).toBe(
      "Episode requires season/episode numbers or a TVDB episode ID"
    );
    expect(results[1]).toEqual({
      success: true,
      result: { wasRewatched: false },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includes imdb series ids on season-based show payloads", async () => {
    mockOkJson({ added: { episodes: 1 } });
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.tvdbEpisodeId = undefined;
    event.media.imdbSeriesId = "tt0944947";

    await client.scrobble(event, "access-token");

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual({
      shows: [
        {
          title: "Example Show",
          year: 2024,
          ids: { imdb: "tt0944947" },
          use_tvdb_anime_seasons: true,
          seasons: [
            {
              number: 2,
              episodes: [
                {
                  number: 3,
                  watched_at: "2026-06-04T17:00:00Z",
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("fails the batch group when Simkl returns unmatched leftover not_found", async () => {
    mockOkJson({
      added: { episodes: 1 },
      not_found: {
        shows: [{ title: "Some Other Show", seasons: [{ number: 1 }] }],
      },
    });
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [{ event: makeEpisodeEvent() }],
      "access-token"
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(false);
    expect((results[0] as { error: Error }).error.message).toBe(
      "Simkl could not match the media item"
    );
  });

  it("propagates batch request failures to every item in the group", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [
        { event: makeMovieEvent({ imdbMovieId: "tt1" }) },
        { event: makeEpisodeEvent() },
      ],
      "access-token"
    );

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.success === false)).toBe(true);
    expect((results[0] as { error: Error }).error.message).toBe("network down");
    expect((results[1] as { error: Error }).error.message).toBe("network down");
  });

  it("splits rewatch and non-rewatch items into separate history requests", async () => {
    mockOkJson({ added: { movies: 1 } });
    mockOkJson({ added: { episodes: 1 } });
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [
        {
          event: makeMovieEvent({ imdbMovieId: "tt1" }),
          options: { markMoviesAsRewatched: true },
        },
        { event: makeEpisodeEvent() },
      ],
      "access-token"
    );

    expect(results).toEqual([
      { success: true, result: { wasRewatched: false } },
      { success: true, result: { wasRewatched: false } },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const rewatchUrl = new URL(fetchMock.mock.calls[0]![0] as string);
    const plainUrl = new URL(fetchMock.mock.calls[1]![0] as string);
    expect(rewatchUrl.searchParams.get("allow_rewatch")).toBe("yes");
    expect(plainUrl.searchParams.get("allow_rewatch")).toBeNull();
  });

  it("matches show and episode not_found entries in a batch", async () => {
    mockOkJson({
      added: { episodes: 0 },
      not_found: {
        shows: [
          {
            title: "Example Show",
            seasons: [
              {
                number: 2,
                episodes: [{ number: 3, watched_at: "2026-06-04T17:00:00Z" }],
              },
            ],
          },
        ],
        episodes: [
          {
            watched_at: "2026-06-04T17:00:00Z",
            ids: { tvdb: "98765" },
            type: "episode",
          },
        ],
      },
    });
    const client = new SimklClient("client-id");
    const tvdbOnly = makeEpisodeEvent();
    tvdbOnly.media.seasonNumber = undefined;
    tvdbOnly.media.episodeNumber = undefined;
    tvdbOnly.media.title = undefined as never;

    const results = await client.scrobbleMany(
      [{ event: makeEpisodeEvent() }, { event: tvdbOnly }],
      "access-token"
    );

    expect(results.every((result) => result.success === false)).toBe(true);
    expect((results[0] as { error: Error }).error.message).toBe(
      "Simkl could not match the media item"
    );
    expect((results[1] as { error: Error }).error.message).toBe(
      "Simkl could not match the media item"
    );
  });

  it("matches show status echoes by title, year, and series ids", async () => {
    mockOkJson({
      added: {
        episodes: 1,
        statuses: [
          {
            request: {
              title: "Example Show",
              year: 2024,
              type: "show",
              ids: { tmdb: "1399", tvdb: "121361" },
            },
            response: { rewatch_id: 88, rewatch_status: "active" },
          },
        ],
      },
      not_found: { movies: [], shows: [], episodes: [] },
    });
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.tmdbSeriesId = 1399;
    event.media.tvdbSeriesId = 121361;

    const results = await client.scrobbleMany(
      [{ event, options: { markEpisodesAsRewatched: true } }],
      "access-token"
    );

    expect(results).toEqual([
      {
        success: true,
        result: { wasRewatched: true, simklRewatchId: 88 },
      },
    ]);
  });

  it("ignores movie not_found echoes with mismatched type or watched_at", async () => {
    mockOkJson({
      added: { movies: 1 },
      not_found: {
        movies: [
          {
            title: "Example Movie",
            year: 2024,
            type: "show",
            ids: { imdb: "tt1234567" },
          },
          {
            title: "Example Movie",
            year: 2024,
            watched_at: "2020-01-01T00:00:00Z",
            ids: { imdb: "tt1234567" },
          },
        ],
      },
    });
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [
        {
          event: makeMovieEvent({
            imdbMovieId: "tt1234567",
            year: 2024,
          }),
        },
      ],
      "access-token"
    );

    // Leftover unmatched not_found entries fail the whole group.
    expect(results[0]?.success).toBe(false);
  });

  it("wraps non-Error prepare failures while building batch payloads", async () => {
    const client = new SimklClient("client-id");
    vi.spyOn(
      client as unknown as { prepareHistoryEntry: () => never },
      "prepareHistoryEntry"
    ).mockImplementation(() => {
      throw "boom";
    });

    const results = await client.scrobbleMany(
      [{ event: makeEpisodeEvent() }],
      "access-token"
    );

    expect(results).toEqual([
      {
        success: false,
        error: expect.objectContaining({
          message: "Failed to build Simkl history payload",
        }),
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wraps non-Error batch request failures", async () => {
    fetchMock.mockRejectedValue("offline");
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [{ event: makeEpisodeEvent() }],
      "access-token"
    );

    expect(results).toEqual([
      {
        success: false,
        error: expect.objectContaining({ message: "Unknown Simkl error" }),
      },
    ]);
  });

  it("matches movie not_found entries by overlapping imdb ids only", async () => {
    mockOkJson({
      added: { movies: 0 },
      not_found: {
        movies: [
          {
            watched_at: "2026-06-04T17:00:00Z",
            ids: { imdb: "tt999" },
          },
        ],
      },
    });
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [{ event: makeMovieEvent({ imdbMovieId: "tt999" }) }],
      "access-token"
    );

    expect(results[0]?.success).toBe(false);
    expect((results[0] as { error: Error }).error.message).toBe(
      "Simkl could not match the media item"
    );
  });

  it("skips non-object and non-overlapping not_found echoes for movies and shows", async () => {
    mockOkJson({
      added: { movies: 1, episodes: 1 },
      not_found: {
        movies: [null, "nope", { ids: { imdb: "tt-other" } }],
        shows: [null, "nope"],
      },
    });
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [
        { event: makeMovieEvent({ imdbMovieId: "tt1234567", year: 2024 }) },
        { event: makeEpisodeEvent() },
      ],
      "access-token"
    );

    expect(results.every((result) => result.success === false)).toBe(true);
  });

  it("skips non-matching episode not_found echoes before failing leftovers", async () => {
    mockOkJson({
      added: { episodes: 1 },
      not_found: {
        episodes: [
          null,
          { type: "movie", ids: { tvdb: 98765 } },
          {
            type: "episode",
            watched_at: "2020-01-01T00:00:00Z",
            ids: { tvdb: 98765 },
          },
          { type: "episode", watched_at: "2026-06-04T17:00:00Z" },
          {
            type: "episode",
            watched_at: "2026-06-04T17:00:00Z",
            ids: { tvdb: 1 },
          },
        ],
      },
    });
    const client = new SimklClient("client-id");
    const tvdbOnly = makeEpisodeEvent();
    tvdbOnly.media.seasonNumber = undefined;
    tvdbOnly.media.episodeNumber = undefined;
    tvdbOnly.media.title = undefined as never;

    const results = await client.scrobbleMany(
      [{ event: tvdbOnly }],
      "access-token"
    );

    expect(results[0]?.success).toBe(false);
  });

  it("matches episode status echoes and ignores unrelated status rows", async () => {
    mockOkJson({
      added: {
        episodes: 1,
        statuses: [
          { request: undefined },
          { request: null },
          {
            request: {
              type: "episode",
              watched_at: "2026-06-04T17:00:00Z",
              ids: { tvdb: "111" },
            },
            response: { rewatch_id: 1, rewatch_status: "active" },
          },
          {
            request: {
              type: "episode",
              watched_at: "2026-06-04T17:00:00Z",
              ids: { tvdb: "98765" },
            },
            rewatch_id: 99,
          },
        ],
      },
      not_found: { movies: [], shows: [], episodes: [] },
    });
    const client = new SimklClient("client-id");
    const tvdbOnly = makeEpisodeEvent();
    tvdbOnly.media.seasonNumber = undefined;
    tvdbOnly.media.episodeNumber = undefined;
    tvdbOnly.media.title = undefined as never;

    const results = await client.scrobbleMany(
      [{ event: tvdbOnly, options: { markEpisodesAsRewatched: true } }],
      "access-token"
    );

    expect(results).toEqual([
      {
        success: true,
        result: { wasRewatched: false, simklRewatchId: 99 },
      },
    ]);
  });

  it("returns no rewatch fields when status requests do not match the show", async () => {
    mockOkJson({
      added: {
        episodes: 1,
        statuses: [
          {
            request: {
              title: "Example Show",
              year: 2024,
              type: "movie",
              ids: { tmdb: 1399 },
            },
            response: { rewatch_id: 1, rewatch_status: "active" },
          },
          {
            request: {
              title: "Other Show",
              year: 2024,
              type: "show",
              ids: { tmdb: 1399 },
            },
            response: { rewatch_id: 2, rewatch_status: "active" },
          },
          {
            request: {
              title: "Example Show",
              year: 1999,
              type: "show",
              ids: { tmdb: 1399 },
            },
            response: { rewatch_id: 3, rewatch_status: "active" },
          },
          {
            request: {
              title: "Example Show",
              year: 2024,
              type: "show",
              ids: { tmdb: 1 },
            },
            response: { rewatch_status: "pending" },
          },
          {
            request: { title: "Example Show", type: "show" },
            response: {},
          },
        ],
      },
      not_found: { movies: [], shows: [], episodes: [] },
    });
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.tmdbSeriesId = 1399;

    const results = await client.scrobbleMany(
      [{ event, options: { markEpisodesAsRewatched: true } }],
      "access-token"
    );

    expect(results).toEqual([
      { success: true, result: { wasRewatched: false } },
    ]);
  });

  it("matches title-only show status echoes when no series ids are present", async () => {
    mockOkJson({
      added: {
        episodes: 1,
        statuses: [
          {
            request: {
              title: "Example Show",
              year: 2024,
              type: "show",
            },
            response: { rewatch_status: "active" },
          },
        ],
      },
      not_found: { movies: [], shows: [], episodes: [] },
    });
    const client = new SimklClient("client-id");

    const results = await client.scrobbleMany(
      [
        {
          event: makeEpisodeEvent(),
          options: { markEpisodesAsRewatched: true },
        },
      ],
      "access-token"
    );

    expect(results).toEqual([
      {
        success: true,
        result: { wasRewatched: true, simklRewatchId: undefined },
      },
    ]);
  });

  it("sends top-level episode history when only a TVDB episode ID is available", async () => {
    mockOkJson({ added: { episodes: 1 } });
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.seasonNumber = undefined;
    event.media.episodeNumber = undefined;
    event.media.title = undefined as never;

    await client.scrobble(event, "access-token");

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual(expectedTvdbEpisodeHistory());
  });

  it("loads user profiles", async () => {
    mockOkJson({
      user: {
        name: "alice",
        avatar: "https://img.example/alice.png",
      },
      account: {
        id: 51,
        type: "pro",
      },
    });
    const client = new SimklClient("client-id");

    await expect(client.getUserProfile("access-token")).resolves.toEqual({
      id: 51,
      username: "alice",
      image: "https://img.example/alice.png",
      accountType: "pro",
    });

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body?: string },
    ];
    expect(new URL(url).pathname).toBe("/users/settings");
    expect(request.method).toBe("POST");
    expect(request.body).toBeUndefined();
  });

  it("loads sparse user profiles with null fields", async () => {
    mockOkJson({});
    const client = new SimklClient("client-id");

    await expect(client.getUserProfile("access-token")).resolves.toEqual({
      id: null,
      username: null,
      image: null,
      accountType: null,
    });
  });

  it("sends allow_rewatch and pins rewatch_id when opted in", async () => {
    mockOkJson({
      added: {
        movies: 1,
        statuses: [
          {
            response: {
              rewatch_id: 21284,
              rewatch_status: "completed",
            },
          },
        ],
      },
    });
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(
        makeMovieEvent({ imdbMovieId: "tt1234567" }),
        "access-token",
        { markMoviesAsRewatched: true, simklRewatchId: 999 }
      )
    ).resolves.toEqual({
      wasRewatched: true,
      simklRewatchId: 21284,
    });

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { body: string },
    ];
    const actualUrl = new URL(url);
    expect(actualUrl.pathname).toBe("/sync/history");
    expect(actualUrl.searchParams.get("allow_rewatch")).toBe("yes");
    expect(JSON.parse(request.body)).toEqual({
      movies: [
        {
          title: "Example Movie",
          watched_at: "2026-06-04T17:00:00Z",
          ids: { imdb: "tt1234567" },
          rewatch_id: 999,
        },
      ],
    });
  });

  it("sends allow_rewatch for episode history when opted in", async () => {
    mockOkJson({
      added: {
        episodes: 1,
        statuses: [
          {
            response: {
              rewatch_id: 1001,
              rewatch_status: "active",
            },
          },
        ],
      },
    });
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.tvdbEpisodeId = undefined;
    event.media.tmdbSeriesId = 1399;

    await expect(
      client.scrobble(event, "access-token", {
        markEpisodesAsRewatched: true,
        simklRewatchId: 1001,
      })
    ).resolves.toEqual({
      wasRewatched: true,
      simklRewatchId: 1001,
    });

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(new URL(url).searchParams.get("allow_rewatch")).toBe("yes");
    expect(JSON.parse(request.body)).toEqual({
      shows: [
        {
          title: "Example Show",
          year: 2024,
          ids: { tmdb: 1399 },
          use_tvdb_anime_seasons: true,
          rewatch_id: 1001,
          seasons: [
            {
              number: 2,
              episodes: [
                {
                  number: 3,
                  watched_at: "2026-06-04T17:00:00Z",
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("pins rewatch_id on show episode payloads when season/number are known", async () => {
    mockOkJson({
      added: {
        episodes: 1,
        statuses: [{ rewatch_id: 55, rewatch_status: "active" }],
      },
    });
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(makeEpisodeEvent(), "access-token", {
        markEpisodesAsRewatched: true,
        simklRewatchId: 55,
      })
    ).resolves.toEqual({ wasRewatched: true, simklRewatchId: 55 });

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual(
      expectedShowEpisodeHistory({ rewatch_id: 55 })
    );
  });

  it("pins rewatch_id on top-level TVDB episode payloads when season/number are unknown", async () => {
    mockOkJson({
      added: {
        episodes: 1,
        statuses: [{ rewatch_id: 55, rewatch_status: "active" }],
      },
    });
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.seasonNumber = undefined;
    event.media.episodeNumber = undefined;

    await expect(
      client.scrobble(event, "access-token", {
        markEpisodesAsRewatched: true,
        simklRewatchId: 55,
      })
    ).resolves.toEqual({ wasRewatched: true, simklRewatchId: 55 });

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body)).toEqual(
      expectedTvdbEpisodeHistory({ rewatch_id: 55 })
    );
  });

  it("includes TVDB movie ids and ignores empty rewatch status rows", async () => {
    mockOkJson({
      added: {
        movies: 1,
        statuses: [{}, { response: { rewatch_status: "completed" } }],
      },
    });
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(makeMovieEvent({ tvdbMovieId: 42 }), "access-token", {
        markMoviesAsRewatched: true,
      })
    ).resolves.toEqual({
      wasRewatched: true,
      simklRewatchId: undefined,
    });

    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(request.body).movies[0].ids).toEqual({ tvdb: 42 });
  });

  it("accepts rewatch_id without a rewatch_status", async () => {
    mockOkJson({
      added: {
        movies: 1,
        statuses: [{ response: { rewatch_id: 77 } }],
      },
    });
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(makeMovieEvent({ imdbMovieId: "tt1" }), "access-token", {
        markMoviesAsRewatched: true,
      })
    ).resolves.toEqual({
      wasRewatched: false,
      simklRewatchId: 77,
    });
  });

  it("returns no rewatch fields when status rows are empty", async () => {
    mockOkJson({
      added: { movies: 1, statuses: [{}] },
    });
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(makeMovieEvent({ imdbMovieId: "tt1" }), "access-token", {
        markMoviesAsRewatched: true,
      })
    ).resolves.toEqual({
      wasRewatched: false,
      simklRewatchId: undefined,
    });
  });

  it("rethrows non-timeout fetch failures", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(makeEpisodeEvent(), "access-token")
    ).rejects.toThrow("network down");
  });

  it("does not send allow_rewatch when rewatch options are off", async () => {
    mockOkJson({ added: { movies: 1 } });
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(
        makeMovieEvent({ imdbMovieId: "tt1234567" }),
        "access-token"
      )
    ).resolves.toEqual({ wasRewatched: false, simklRewatchId: undefined });

    const actualUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(actualUrl.searchParams.get("allow_rewatch")).toBeNull();
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

  it("surfaces Simkl API timeouts", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(makeEpisodeEvent(), "access-token")
    ).rejects.toThrow("Simkl API request timed out");
  });

  it("rejects unmatched Simkl history responses", async () => {
    mockOkJson({
      added: { movies: 0 },
      not_found: { movies: [{ title: "Example Movie" }] },
    });
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(makeMovieEvent(), "access-token")
    ).rejects.toThrow("Simkl could not match the media item");
  });

  it("rejects unmatched show and episode history responses", async () => {
    mockOkJson({
      added: { episodes: 0 },
      not_found: {
        shows: [{ title: "Example Show" }],
        episodes: [{ number: 1 }],
      },
    });
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(makeEpisodeEvent(), "access-token")
    ).rejects.toThrow("Simkl could not match the media item");
  });

  it("rejects episodes without IDs or season and episode numbers", async () => {
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.tvdbEpisodeId = undefined;
    event.media.seasonNumber = undefined;
    event.media.episodeNumber = undefined;

    await expect(client.scrobble(event, "access-token")).rejects.toThrow(
      "Episode requires season/episode numbers or a TVDB episode ID"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported media types", async () => {
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(
        {
          event: "scrobble",
          source: "plex",
          userId: "plex-user",
          timestamp: new Date("2026-06-04T17:00:00.000Z"),
          media: {
            id: "track-1",
            type: "track",
            title: "Example Track",
          },
        } as never,
        "access-token"
      )
    ).rejects.toThrow("Unsupported media type: track");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects movies without identifiers or title", async () => {
    const client = new SimklClient("client-id");

    await expect(
      client.scrobble(makeMovieEvent({ title: "" }), "access-token")
    ).rejects.toThrow(
      "Movie requires at least IMDB ID, TMDB ID, TVDB ID, or title"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a show title for season-based episode payloads", async () => {
    const client = new SimklClient("client-id");
    const event = makeEpisodeEvent();
    event.media.tvdbEpisodeId = undefined;
    event.media.title = undefined as never;

    await expect(client.scrobble(event, "access-token")).rejects.toThrow(
      "Show title or series IDs are required for Simkl episode scrobble"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses message-based and plain-text API errors", async () => {
    const client = new SimklClient("client-id");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue(JSON.stringify({ message: "busy" })),
    });

    await expect(
      client.scrobble(makeEpisodeEvent(), "access-token")
    ).rejects.toThrow("Simkl API error: 503 - busy");

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("plain error"),
    });

    await expect(
      client.scrobble(makeEpisodeEvent(), "access-token")
    ).rejects.toThrow("Simkl API error: 500 - plain error");
  });

  function expectedShowEpisodeHistory(show: Record<string, unknown> = {}) {
    return {
      shows: [
        {
          title: "Example Show",
          year: 2024,
          use_tvdb_anime_seasons: true,
          seasons: [
            {
              number: 2,
              episodes: [
                {
                  number: 3,
                  watched_at: "2026-06-04T17:00:00Z",
                },
              ],
            },
          ],
          ...show,
        },
      ],
    };
  }

  function expectedTvdbEpisodeHistory(episode: Record<string, unknown> = {}) {
    return {
      episodes: [
        {
          watched_at: "2026-06-04T17:00:00Z",
          ids: { tvdb: 98765 },
          ...episode,
        },
      ],
    };
  }

  function mockOkJson(body: unknown) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(body),
    });
  }

  function makeMovieEvent(
    media: Partial<MediaEvent["media"]> = {}
  ): MediaEvent {
    return {
      event: "scrobble",
      source: "plex",
      userId: "plex-user",
      timestamp: new Date("2026-06-04T17:00:00.000Z"),
      media: {
        id: "movie-1",
        type: "movie",
        title: "Example Movie",
        ...media,
      },
    };
  }

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
