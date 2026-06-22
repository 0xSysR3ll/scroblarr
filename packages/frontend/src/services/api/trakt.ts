import { getCached, setCached, invalidateCached } from "./cache";
import { API_BASE_URL, getAuthHeaders } from "./common";

const CACHE_KEY_STATUS = "trakt-status";

export interface TraktStatus {
  linked: boolean;
  needsReauthorization?: boolean;
  username: string | null;
  image: string | null;
  hasCredentials: boolean;
}

export function invalidateTraktCache(): void {
  invalidateCached(CACHE_KEY_STATUS);
}

export async function getTraktAuthorizeUrl(
  clientId?: string,
  clientSecret?: string
): Promise<{ authUrl: string }> {
  const params = new URLSearchParams();
  if (clientId) params.append("clientId", clientId);
  if (clientSecret) params.append("clientSecret", clientSecret);

  const url = `${API_BASE_URL}/trakt/authorize${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get Trakt authorization URL");
  }
  return response.json();
}

export async function linkTrakt(
  code: string,
  clientId?: string,
  clientSecret?: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/trakt/link`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ code, clientId, clientSecret }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to link Trakt account");
  }
  invalidateTraktCache();
  return response.json();
}

export async function unlinkTrakt(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/trakt/unlink`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to unlink Trakt account");
  }
  invalidateTraktCache();
  return response.json();
}

export async function getTraktStatus(
  options: { force?: boolean } = {}
): Promise<TraktStatus> {
  if (!options.force) {
    const cached = getCached<TraktStatus>(CACHE_KEY_STATUS);
    if (cached) return cached;
  }

  const response = await fetch(`${API_BASE_URL}/trakt/status`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Trakt status");
  }
  const data = (await response.json()) as TraktStatus;
  if (!data.needsReauthorization) {
    setCached(CACHE_KEY_STATUS, data);
  }
  return data;
}
