import { describe, expect, it } from "vitest";

import { PlexWebhookParser, PlexWebhookPayload } from "./PlexWebhookParser";

describe("PlexWebhookParser", () => {
  it("parses scrobble episodes with IDs and server-relative poster URLs", () => {
    const payload: PlexWebhookPayload = {
      event: "media.scrobble",
      user: true,
      Account: {
        id: 1,
        title: "plex-user",
      },
      Metadata: {
        type: "episode",
        grandparentTitle: "Example Show",
        parentTitle: "Pilot",
        parentIndex: 1,
        index: 2,
        Guid: [{ id: "tvdb://12345" }, { id: "imdb://tt7654321" }],
        grandparentThumb: "/library/metadata/42/thumb",
      },
    };

    const event = PlexWebhookParser.parse(payload, "https://plex.local:32400/");

    expect(event).toMatchObject({
      event: "scrobble",
      userId: "plex-user",
      source: "plex",
      media: {
        id: "episode-Example Show-1-2",
        type: "episode",
        title: "Example Show",
        episodeTitle: "Pilot",
        seasonNumber: 1,
        episodeNumber: 2,
        tvdbEpisodeId: 12345,
        imdbEpisodeId: "tt7654321",
        posterUrl: "https://plex.local:32400/library/metadata/42/thumb",
      },
    });
  });

  it("parses movies using the object user fallback and primaryGuid IDs", () => {
    const payload: PlexWebhookPayload = {
      event: "media.scrobble",
      user: { username: "fallback-user" },
      Metadata: {
        type: "movie",
        title: "Example Movie",
        year: 2024,
        primaryGuid: "tmdb://9876",
        guid: "imdb://tt1234567",
        thumb: "library/metadata/99/thumb",
      },
    };

    const event = PlexWebhookParser.parse(payload, "https://plex.local/base/");

    expect(event).toMatchObject({
      userId: "fallback-user",
      media: {
        type: "movie",
        title: "Example Movie",
        year: 2024,
        imdbMovieId: "tt1234567",
        tmdbMovieId: 9876,
        posterUrl: "https://plex.local/base/library/metadata/99/thumb",
      },
    });
  });

  it("ignores unsupported payloads", () => {
    expect(
      PlexWebhookParser.parse({
        event: "media.scrobble",
        user: true,
        Metadata: { type: "clip", title: "Trailer" },
      })
    ).toBeNull();

    expect(
      PlexWebhookParser.parse({
        event: "media.rate",
        user: { username: "plex-user" },
        Metadata: { type: "movie", title: "Example Movie" },
      })
    ).toBeNull();
  });
});
