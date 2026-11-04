import { MediaEvent } from "@scroblarr/shared";

export interface SyncOptions {
  markMoviesAsRewatched?: boolean;
  markEpisodesAsRewatched?: boolean;
  bingersLocalPlayCount?: number;
  simklRewatchId?: number;
}

export interface ScrobbleResult {
  wasRewatched: boolean;
  simklRewatchId?: number;
}

export interface SyncResult {
  success: boolean;
  errorMessage?: string;
}

export interface ISyncClient {
  scrobble(
    event: MediaEvent,
    accessToken: string,
    options?: SyncOptions
  ): Promise<ScrobbleResult | void>;

  getName(): string;
}
