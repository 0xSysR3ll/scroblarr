import { describe, expect, it } from "vitest";

import {
  TautulliWebhookParser,
  TautulliWebhookPayload,
} from "./TautulliWebhookParser";

describe("TautulliWebhookParser", () => {
  it("parses watched movies with IDs and poster URLs", () => {
    const payload: TautulliWebhookPayload = {
      action: "watched",
      username: "plex-user",
      media_type: "movie",
      title: "Example Movie",
      year: "2024",
      imdb_id: "tt1234567",
      themoviedb_id: "9876",
      thetvdb_id: "4321",
      duration_ms: "7200000",
      view_offset: "7100000",
      poster_url: "https://tautulli.local/image/movie.jpg",
      server_machine_id: "machine-1",
    };

    expect(TautulliWebhookParser.parse(payload)).toMatchObject({
      event: "scrobble",
      userId: "plex-user",
      source: "plex",
      media: {
        id: "movie-Example Movie-2024",
        type: "movie",
        title: "Example Movie",
        year: 2024,
        duration: 7200000,
        watchedDuration: 7100000,
        imdbMovieId: "tt1234567",
        tmdbMovieId: 9876,
        tvdbMovieId: 4321,
        posterUrl: "https://tautulli.local/image/movie.jpg",
      },
    });
  });

  it("parses watched episodes using show-level TMDB IDs", () => {
    const payload: TautulliWebhookPayload = {
      action: "watched",
      user: "friendly-name",
      media_type: "episode",
      title: "Example Show - S01E02 - Pilot",
      show_name: "Example Show",
      show_year: "2011",
      episode_name: "Pilot",
      season_num: "1",
      episode_num: "2",
      themoviedb_id: "1396",
      imdb_id: "tt0903747",
      thetvdb_id: "81189",
      thumb: "/library/metadata/42/thumb",
    };

    const event = TautulliWebhookParser.parse(
      payload,
      "https://plex.local:32400/"
    );

    expect(event).toMatchObject({
      event: "scrobble",
      userId: "friendly-name",
      source: "plex",
      media: {
        id: "episode-Example Show-1-2",
        type: "episode",
        title: "Example Show",
        year: 2011,
        episodeTitle: "Pilot",
        seasonNumber: 1,
        episodeNumber: 2,
        tmdbSeriesId: 1396,
        posterUrl: "https://plex.local:32400/library/metadata/42/thumb",
      },
    });
  });

  it("maps playback actions and prefers username over friendly name", () => {
    const base: TautulliWebhookPayload = {
      username: "plex-user",
      user: "Friendly",
      media_type: "movie",
      title: "Example Movie",
    };

    expect(
      TautulliWebhookParser.parse({ ...base, action: "play" })?.event
    ).toBe("playing");
    expect(
      TautulliWebhookParser.parse({ ...base, action: "resume" })?.event
    ).toBe("playing");
    expect(
      TautulliWebhookParser.parse({ ...base, action: "pause" })?.event
    ).toBe("paused");
    expect(
      TautulliWebhookParser.parse({ ...base, action: "stop" })?.event
    ).toBe("stopped");
    expect(
      TautulliWebhookParser.parse({ ...base, action: "watched" })?.userId
    ).toBe("plex-user");
  });

  it("ignores unsupported payloads", () => {
    expect(
      TautulliWebhookParser.parse({
        action: "watched",
        username: "plex-user",
        media_type: "track",
        title: "Song",
      })
    ).toBeNull();

    expect(
      TautulliWebhookParser.parse({
        action: "created",
        username: "plex-user",
        media_type: "movie",
        title: "Example Movie",
      })
    ).toBeNull();

    expect(
      TautulliWebhookParser.parse({
        action: "watched",
        media_type: "movie",
        title: "Example Movie",
      })
    ).toBeNull();

    expect(
      TautulliWebhookParser.parse({
        action: "watched",
        username: "plex-user",
        media_type: "episode",
        season_num: "1-3",
        episode_num: "6-10",
        show_name: "Example Show",
      })
    ).toMatchObject({
      media: {
        seasonNumber: undefined,
        episodeNumber: undefined,
      },
    });
  });

  it("reads the Plex server machine ID from the payload", () => {
    expect(
      TautulliWebhookParser.getServerMachineId({
        server_machine_id: " machine-1 ",
      })
    ).toBe("machine-1");
    expect(TautulliWebhookParser.getServerMachineId({})).toBeUndefined();
  });

  it("builds poster URLs from thumbs and ignores invalid values", () => {
    expect(
      TautulliWebhookParser.parse({
        action: "watched",
        username: "plex-user",
        media_type: "movie",
        title: "Example Movie",
        thumb: "https://tautulli.local/thumb.jpg",
      })?.media.posterUrl
    ).toBe("https://tautulli.local/thumb.jpg");

    expect(
      TautulliWebhookParser.parse(
        {
          action: "watched",
          username: "plex-user",
          media_type: "movie",
          title: "Example Movie",
          thumb: "library/metadata/1/thumb",
        },
        "https://plex.local:32400/plex"
      )?.media.posterUrl
    ).toBe("https://plex.local:32400/plex/library/metadata/1/thumb");

    expect(
      TautulliWebhookParser.parse({
        action: "watched",
        username: "plex-user",
        media_type: "movie",
        title: "Example Movie",
        thumb: "/library/metadata/1/thumb",
      })?.media.posterUrl
    ).toBeUndefined();

    expect(
      TautulliWebhookParser.parse(
        {
          action: "watched",
          username: "plex-user",
          media_type: "movie",
          title: "Example Movie",
          thumb: "/library/metadata/1/thumb",
        },
        "not-a-url"
      )?.media.posterUrl
    ).toBeUndefined();

    expect(
      TautulliWebhookParser.parse({
        action: "watched",
        username: "plex-user",
        media_type: "movie",
        title: "Example Movie",
        poster_url: "not-a-url",
      })?.media.posterUrl
    ).toBeUndefined();
  });

  it("ignores placeholder and invalid identifier values", () => {
    expect(
      TautulliWebhookParser.parse({
        action: "watched",
        username: "{username}",
        user: "friendly",
        media_type: "movie",
        title: "",
        imdb_id: "not-an-id",
        duration_ms: "abc",
        year: "2024a",
      })
    ).toMatchObject({
      userId: "friendly",
      media: {
        title: "Unknown",
        imdbMovieId: undefined,
        duration: undefined,
        year: undefined,
      },
    });

    expect(
      TautulliWebhookParser.parse({
        action: "",
        username: "plex-user",
        media_type: "movie",
        title: "Example Movie",
      })
    ).toBeNull();

    expect(
      TautulliWebhookParser.parse({
        action: "watched",
        username: "plex-user",
        media_type: "episode",
        year: "2011",
      })
    ).toMatchObject({
      media: {
        title: "Unknown",
        year: 2011,
      },
    });
  });
});
