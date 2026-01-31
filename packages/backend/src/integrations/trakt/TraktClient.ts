import { MediaEvent } from "@scroblarr/shared";
import { logger } from "@utils/logger";
import { ISyncClient, SyncOptions } from "@integrations/common/ISyncClient";

export class TraktClient implements ISyncClient {
  private static readonly BASE_URL = "https://api.trakt.tv";
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  getName(): string {
    return "Trakt";
  }

  async scrobble(
    event: MediaEvent,
    accessToken: string,
    _options?: SyncOptions
  ): Promise<void> {
    if (event.media.type === "episode") {
      await this.scrobbleEpisode(event, accessToken);
    } else if (event.media.type === "movie") {
      await this.scrobbleMovie(event, accessToken);
    } else {
      throw new Error(`Unsupported media type: ${event.media.type}`);
    }
  }

  private async scrobbleEpisode(
    event: MediaEvent,
    accessToken: string
  ): Promise<void> {
    const episode: Record<string, unknown> = {};

    if (event.media.tvdbEpisodeId) {
      episode.ids = { tvdb: event.media.tvdbEpisodeId };
    } else if (event.media.imdbEpisodeId) {
      episode.ids = { imdb: event.media.imdbEpisodeId };
    }

    if (
      event.media.seasonNumber !== undefined &&
      event.media.episodeNumber !== undefined
    ) {
      episode.season = event.media.seasonNumber;
      episode.number = event.media.episodeNumber;
    }

    if (!episode.ids && (!episode.season || !episode.number)) {
      throw new Error(
        "Episode requires at least TVDB ID, IMDB ID, or season/episode numbers"
      );
    }

    const show: Record<string, unknown> = {};

    if (event.media.tmdbSeriesId) {
      show.ids = { tmdb: event.media.tmdbSeriesId };
    }

    if (event.media.title) {
      show.title = event.media.title;
      if (event.media.year) {
        show.year = event.media.year;
      }
    } else {
      throw new Error("Show title is required for episode scrobble");
    }

    const payload = {
      episode,
      show,
      progress: 100,
    };

    const response = await fetch(`${TraktClient.BASE_URL}/scrobble/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "trakt-api-version": "2",
        "trakt-api-key": this.clientId,
        "User-Agent": "Scroblarr/1.0.0",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.trakt.error(
        {
          status: response.status,
          errorText,
          payload,
          episodeId: event.media.tvdbEpisodeId,
          episodeSeason: event.media.seasonNumber,
          episodeNumber: event.media.episodeNumber,
          showTitle: event.media.title,
          showYear: event.media.year,
          tmdbSeriesId: event.media.tmdbSeriesId,
        },
        "Trakt episode scrobble API error"
      );
      throw new Error(
        `Trakt API error: ${response.status} - ${this.extractErrorMessage(errorText)}`
      );
    }

    // Response parsing is optional - scrobble succeeded if status is OK
  }

  private async scrobbleMovie(
    event: MediaEvent,
    accessToken: string
  ): Promise<void> {
    const movie: Record<string, unknown> = {};

    if (event.media.imdbMovieId) {
      movie.ids = { imdb: event.media.imdbMovieId };
    } else if (event.media.tmdbMovieId) {
      movie.ids = { tmdb: event.media.tmdbMovieId };
    } else if (event.media.tvdbMovieId) {
      movie.ids = { tvdb: event.media.tvdbMovieId };
    } else if (event.media.title) {
      movie.title = event.media.title;
      if (event.media.year) {
        movie.year = event.media.year;
      }
    } else {
      throw new Error(
        "Movie requires at least IMDB ID, TMDB ID, TVDB ID, or title"
      );
    }

    const payload = {
      movie,
      progress: 100,
    };

    const response = await fetch(`${TraktClient.BASE_URL}/scrobble/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "trakt-api-version": "2",
        "trakt-api-key": this.clientId,
        "User-Agent": "Scroblarr/1.0.0",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.trakt.error(
        {
          status: response.status,
          errorText,
          payload,
          movieTitle: event.media.title,
          movieYear: event.media.year,
          imdbId: event.media.imdbMovieId,
          tmdbId: event.media.tmdbMovieId,
          tvdbId: event.media.tvdbMovieId,
        },
        "Trakt movie scrobble API error"
      );
      throw new Error(
        `Trakt API error: ${response.status} - ${this.extractErrorMessage(errorText)}`
      );
    }

    // Response parsing is optional - scrobble succeeded if status is OK
  }

  private extractErrorMessage(errorText: string): string {
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        return errorJson.error;
      }
      if (errorJson.message) {
        return errorJson.message;
      }
    } catch {
      // Not JSON
    }
    return errorText.substring(0, 200);
  }
}
