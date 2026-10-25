export const SCROBLARR_SIMKL_CLIENT_ID =
  "c5772472e1064e1ab8262a4f1754a854e32bd9c087af5e17d67bc52a60e421e4";

/**
 * Resolve the Simkl Client ID used for new authorize/link flows.
 * Env override supports forks; defaults to the official Scroblarr app ID.
 */
export function getSimklClientId(): string {
  const fromEnv = process.env.SIMKL_CLIENT_ID?.trim();
  return fromEnv || SCROBLARR_SIMKL_CLIENT_ID;
}

export function isOfficialSimklClientId(
  clientId: string | null | undefined
): boolean {
  if (!clientId) {
    return false;
  }
  return clientId.trim() === getSimklClientId();
}
