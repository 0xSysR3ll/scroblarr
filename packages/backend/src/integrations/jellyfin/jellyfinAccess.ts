export const MEDIA_SERVER_FETCH_TIMEOUT_MS = 10_000;

export function resolveJellyfinAccessToken(
  userToken: string | undefined,
  settings: { jellyfinApiKey?: string }
): string | undefined {
  return userToken || settings.jellyfinApiKey || undefined;
}
