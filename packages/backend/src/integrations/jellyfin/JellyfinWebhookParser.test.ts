import { describe, expect, it } from "vitest";

import {
  JellyfinWebhookParser,
  JellyfinWebhookPayload,
} from "./JellyfinWebhookParser";

describe("JellyfinWebhookParser", () => {
  it("maps PlaybackStop to scrobble when playback reaches the completion threshold", () => {
    const payload: JellyfinWebhookPayload = {
      notificationType: "PlaybackStop",
      username: "jellyfin-user",
      userId: "jellyfin-user-id",
      itemType: "Episode",
      itemId: "episode-id",
      name: "Pilot",
      seriesName: "Example Show",
      seasonNumber: "1",
      episodeNumber: "2",
      provider_tvdb: "12345",
      provider_imdb: "tt7654321",
      runtimeTicks: "1000000000",
      playbackPositionTicks: "900000000",
      timestamp: "2026-06-04T17:00:00.000Z",
    };

    const event = JellyfinWebhookParser.parse(payload);

    expect(event).toMatchObject({
      event: "scrobble",
      userId: "jellyfin-user-id",
      source: "jellyfin",
      metadata: {
        itemId: "episode-id",
      },
      media: {
        id: "episode-Example Show-1-2",
        type: "episode",
        title: "Example Show",
        episodeTitle: "Pilot",
        seasonNumber: 1,
        episodeNumber: 2,
        tvdbEpisodeId: 12345,
        imdbEpisodeId: "tt7654321",
        duration: 100000,
        watchedDuration: 90000,
      },
    });
  });

  it("honors explicit playedToCompletion false over tick percentage", () => {
    const event = JellyfinWebhookParser.parse({
      notificationType: "PlaybackStop",
      username: "jellyfin-user",
      userId: "jellyfin-user-id",
      itemType: "Movie",
      itemId: "movie-id",
      name: "Example Movie",
      year: "2024",
      provider_tmdb: "9876",
      runtimeTicks: "1000000000",
      playbackPositionTicks: "990000000",
      playedToCompletion: "false",
      timestamp: "2026-06-04T17:00:00.000Z",
    });

    expect(event).toMatchObject({
      event: "stopped",
      media: {
        type: "movie",
        title: "Example Movie",
        year: 2024,
        tmdbMovieId: 9876,
      },
    });
  });

  it("ignores unsupported item types and missing users", () => {
    expect(
      JellyfinWebhookParser.parse({
        notificationType: "PlaybackStop",
        username: "jellyfin-user",
        userId: "",
        itemType: "Movie",
        itemId: "movie-id",
        name: "Example Movie",
        timestamp: "2026-06-04T17:00:00.000Z",
      })
    ).toBeNull();

    expect(
      JellyfinWebhookParser.parse({
        notificationType: "PlaybackStop",
        username: "jellyfin-user",
        userId: "jellyfin-user-id",
        itemType: "Audio",
        itemId: "audio-id",
        name: "Example Song",
        timestamp: "2026-06-04T17:00:00.000Z",
      })
    ).toBeNull();
  });
});
