import { getAppVersionForClients, getUserAgent } from "@utils/appVersion";

export const SIMKL_API_BASE_URL = "https://api.simkl.com";
export const SIMKL_AUTH_URL = "https://simkl.com/oauth/authorize";
export const SIMKL_APP_NAME = "scroblarr";

export function getSimklAppVersion(): string {
  return getAppVersionForClients();
}

export function getSimklUserAgent(): string {
  return getUserAgent();
}

export function withSimklQueryParams(url: string, clientId: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("client_id", clientId);
  parsed.searchParams.set("app-name", SIMKL_APP_NAME);
  parsed.searchParams.set("app-version", getSimklAppVersion());
  return parsed.toString();
}

export function getSimklHeaders(
  clientId: string,
  accessToken?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": getSimklUserAgent(),
    "simkl-api-key": clientId,
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}
