export const MEDIA_SERVER_FETCH_TIMEOUT_MS = 10_000;

export function isHttpsMediaServerHost(host: string | undefined): boolean {
  if (!host) {
    return false;
  }
  try {
    return new URL(host).protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveJellyfinAccessToken(
  userToken: string | undefined,
  settings: { jellyfinHost?: string; jellyfinApiKey?: string }
): string | undefined {
  if (userToken) {
    return userToken;
  }
  if (
    isHttpsMediaServerHost(settings.jellyfinHost) &&
    settings.jellyfinApiKey
  ) {
    return settings.jellyfinApiKey;
  }
  return undefined;
}
