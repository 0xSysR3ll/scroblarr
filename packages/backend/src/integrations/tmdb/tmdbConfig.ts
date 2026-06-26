export function getTmdbAccessToken(
  settings: Record<string, string | undefined>
): string | undefined {
  const fromSettings = settings.tmdbAccessToken?.trim();
  if (fromSettings) {
    return fromSettings;
  }

  const fromEnv = process.env.TMDB_ACCESS_TOKEN?.trim();
  return fromEnv || undefined;
}

export const TMDB_IMAGE_SIZE = "w500";

export function buildTmdbImageUrl(posterPath: string): string {
  const normalizedPath = posterPath.startsWith("/")
    ? posterPath
    : `/${posterPath}`;
  return `https://image.tmdb.org/t/p/${TMDB_IMAGE_SIZE}${normalizedPath}`;
}
