export class TmdbRateLimitError extends Error {
  constructor() {
    super("TMDB API rate limit exceeded");
    this.name = "TmdbRateLimitError";
  }
}
