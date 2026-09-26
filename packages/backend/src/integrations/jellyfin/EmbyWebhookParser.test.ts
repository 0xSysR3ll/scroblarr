import { describe, expect, it, vi } from "vitest";

import { EmbyWebhookParser, EmbyWebhookPayload } from "./EmbyWebhookParser";

const playbackStartEpisodeFixture: EmbyWebhookPayload = {
  Event: "playback.start",
  Date: "2026-03-14T18:54:08.0000000Z",
  User: {
    Name: "emby-user",
    Id: "emby-user-id-guid",
  },
  Item: {
    Name: "The Truth",
    Id: "608",
    Type: "Episode",
    SeriesName: "11.22.63",
    ProductionYear: 2016,
    IndexNumber: 5,
    ParentIndexNumber: 1,
    RunTimeTicks: 26268330000,
    ProviderIds: {
      Tmdb: "1161838",
      Imdb: "tt5432602",
      Tvdb: "5482173",
    },
  },
  PlaybackInfo: {
    PositionTicks: 0,
    PlayedToCompletion: false,
  },
};

const playbackStopEpisodeFixture: EmbyWebhookPayload = {
  Event: "playback.stop",
  Date: "2026-03-14T19:30:00.0000000Z",
  User: {
    Name: "emby-user",
    Id: "emby-user-id-guid",
  },
  Item: {
    Name: "The Truth",
    Id: "608",
    Type: "Episode",
    SeriesName: "11.22.63",
    ProductionYear: 2016,
    IndexNumber: 5,
    ParentIndexNumber: 1,
    RunTimeTicks: 26268330000,
    ProviderIds: {
      Tmdb: "1161838",
      Imdb: "tt5432602",
      Tvdb: "5482173",
    },
  },
  PlaybackInfo: {
    PositionTicks: 26268330000,
    PlayedToCompletion: true,
  },
};

describe("EmbyWebhookParser", () => {
  it("maps playback.start to playing for episode fixtures", () => {
    const event = EmbyWebhookParser.parse(playbackStartEpisodeFixture);

    expect(event).toMatchObject({
      event: "playing",
      userId: "emby-user-id-guid",
      source: "emby",
      metadata: { itemId: "608" },
      media: {
        id: "episode-11.22.63-1-5",
        type: "episode",
        title: "11.22.63",
        episodeTitle: "The Truth",
        seasonNumber: 1,
        episodeNumber: 5,
        year: 2016,
        tvdbEpisodeId: 5482173,
        imdbEpisodeId: "tt5432602",
        duration: 2626833,
        watchedDuration: 0,
      },
    });
  });

  it("maps playback.stop to scrobble when PlayedToCompletion is true", () => {
    const event = EmbyWebhookParser.parse(playbackStopEpisodeFixture);

    expect(event).toMatchObject({
      event: "scrobble",
      source: "emby",
      userId: "emby-user-id-guid",
      media: {
        type: "episode",
        title: "11.22.63",
        seasonNumber: 1,
        episodeNumber: 5,
        tvdbEpisodeId: 5482173,
      },
    });
  });

  it("maps playback.stop to scrobble when position reaches 90% without PlayedToCompletion", () => {
    const event = EmbyWebhookParser.parse({
      Event: "playback.stop",
      User: { Id: "user-1", Name: "viewer" },
      Item: {
        Id: "movie-1",
        Type: "Movie",
        Name: "Example Movie",
        ProductionYear: 2024,
        RunTimeTicks: 1000000000,
        ProviderIds: { Tmdb: "9876", Imdb: "tt1111111" },
      },
      PlaybackInfo: {
        PositionTicks: 900000000,
      },
    });

    expect(event).toMatchObject({
      event: "scrobble",
      source: "emby",
      media: {
        type: "movie",
        title: "Example Movie",
        year: 2024,
        tmdbMovieId: 9876,
        imdbMovieId: "tt1111111",
      },
    });
  });

  it("honors explicit PlayedToCompletion false over tick percentage", () => {
    const event = EmbyWebhookParser.parse({
      Event: "playback.stop",
      User: { Id: "user-1" },
      Item: {
        Id: "movie-1",
        Type: "Movie",
        Name: "Example Movie",
        ProductionYear: 2024,
        RunTimeTicks: 1000000000,
      },
      PlaybackInfo: {
        PositionTicks: 990000000,
        PlayedToCompletion: false,
      },
    });

    expect(event).toMatchObject({
      event: "stopped",
      media: { type: "movie", title: "Example Movie" },
    });
  });

  it("builds poster URLs from the configured Emby host", () => {
    const event = EmbyWebhookParser.parse(
      playbackStopEpisodeFixture,
      "https://emby.local:8096"
    );

    expect(event?.media.posterUrl).toBe(
      "https://emby.local:8096/Items/608/Images/Primary"
    );
  });

  it("ignores unsupported events, item types, and missing users", () => {
    expect(
      EmbyWebhookParser.parse({
        Event: "playback.stop",
        User: { Id: "" },
        Item: { Id: "1", Type: "Movie", Name: "X" },
      })
    ).toBeNull();

    expect(
      EmbyWebhookParser.parse({
        Event: "playback.stop",
        User: { Id: "user-1" },
        Item: { Id: "1", Type: "Audio", Name: "Song" },
      })
    ).toBeNull();

    expect(
      EmbyWebhookParser.parse({
        Event: "system.webhooktest",
        User: { Id: "user-1" },
        Item: { Id: "1", Type: "Movie", Name: "X" },
      })
    ).toBeNull();
  });

  it("ignores invalid Emby host when building poster URLs", () => {
    const event = EmbyWebhookParser.parse(
      playbackStopEpisodeFixture,
      "not a valid base url"
    );
    expect(event?.media.posterUrl).toBeUndefined();
  });

  it("omits duration when ticks are NaN", () => {
    const event = EmbyWebhookParser.parse({
      Event: "playback.stop",
      User: { Id: "u1" },
      Item: {
        Id: "1",
        Type: "Movie",
        Name: "X",
        RunTimeTicks: Number.NaN,
      },
      PlaybackInfo: { PlayedToCompletion: true, PositionTicks: Number.NaN },
    });
    expect(event?.media.duration).toBeUndefined();
    expect(event?.media.watchedDuration).toBeUndefined();
  });

  it("omits invalid TVDB episode ids", () => {
    const event = EmbyWebhookParser.parse({
      Event: "playback.stop",
      User: { Id: "u1" },
      Item: {
        Id: "1",
        Type: "Episode",
        Name: "Ep",
        SeriesName: "Show",
        ParentIndexNumber: 1,
        IndexNumber: 1,
        ProviderIds: { Tvdb: "not-a-number" },
      },
      PlaybackInfo: { PlayedToCompletion: true },
    });
    expect(event?.media.tvdbEpisodeId).toBeUndefined();
  });

  it("parses episodes without provider ids", () => {
    const event = EmbyWebhookParser.parse({
      Event: "playback.stop",
      User: { Id: "u1" },
      Item: {
        Id: "1",
        Type: "Episode",
        Name: "Ep",
        SeriesName: "Show",
        ParentIndexNumber: 1,
        IndexNumber: 2,
      },
      PlaybackInfo: { PlayedToCompletion: true },
    });
    expect(event?.media.tvdbEpisodeId).toBeUndefined();
    expect(event?.media.imdbEpisodeId).toBeUndefined();
  });

  it("returns null from parseMediaItem for unsupported types", () => {
    const parseMediaItem = (
      EmbyWebhookParser as unknown as {
        parseMediaItem: (
          item: { Type?: string },
          posterUrl: string | undefined,
          positionTicks: number | undefined
        ) => unknown;
      }
    ).parseMediaItem.bind(EmbyWebhookParser);

    expect(parseMediaItem({ Type: "Folder" }, undefined, undefined)).toBeNull();
  });
  it("returns null when parseMediaItem yields null", () => {
    const spy = vi
      .spyOn(
        EmbyWebhookParser as unknown as {
          parseMediaItem: (...args: unknown[]) => unknown;
        },
        "parseMediaItem"
      )
      .mockReturnValueOnce(null);

    expect(
      EmbyWebhookParser.parse({
        Event: "playback.stop",
        User: { Id: "u1" },
        Item: { Id: "1", Type: "Movie", Name: "X" },
        PlaybackInfo: { PlayedToCompletion: true },
      })
    ).toBeNull();

    spy.mockRestore();
  });
});
