import { MediaEvent } from "@scroblarr/shared";

export interface SyncOptions {
  markMoviesAsRewatched?: boolean;
  markEpisodesAsRewatched?: boolean;
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
  ): Promise<void>;

  getName(): string;
}
