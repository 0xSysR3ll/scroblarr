export type MediaType = "movie" | "episode";

export type MediaStatus = "playing" | "paused" | "stopped" | "scrobble";

export interface MediaItem {
  id: string;
  type: MediaType;
  title: string;
  year?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  duration?: number;
  watchedDuration?: number;
  tvdbEpisodeId?: number;
  tvdbMovieId?: number;
  imdbMovieId?: string;
  imdbEpisodeId?: string;
  tmdbMovieId?: number;
  tmdbSeriesId?: number;
  posterUrl?: string;
}

export type MediaSource = "plex" | "jellyfin";

export interface MediaEvent {
  event: MediaStatus;
  media: MediaItem;
  userId: string;
  source: MediaSource;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
