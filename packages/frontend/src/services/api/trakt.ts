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

export interface TraktPinAuthorization {
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export function invalidateTraktCache(): void {
  invalidateCached(CACHE_KEY_STATUS);
}

async function getErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  let parsedJson = false;
  try {
    const jsonSource =
      typeof response.clone === "function" ? response.clone() : response;
    const error = (await jsonSource.json()) as { error?: unknown };
    parsedJson = true;
    if (typeof error.error === "string" && error.error) {
      return error.error;
    }
  } catch {
    // Fall through to text/status fallback.
  }

  // Only use the text body when the response was not JSON.
  if (!parsedJson) {
    try {
      const text = await response.text();
      if (text.trim()) {
        return text.trim();
      }
    } catch {
      // Fall through to status fallback.
    }
  }

  const status = [response.status, response.statusText]
    .filter(Boolean)
    .join(" ");
  return status ? `${fallback} (${status})` : fallback;
}

export async function getTraktAuthorizeUrl(
  clientId?: string,
  clientSecret?: string
): Promise<TraktPinAuthorization> {
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
    throw new Error(
      await getErrorMessage(response, "Failed to get Trakt PIN code")
    );
  }
  return response.json();
}

export async function linkTrakt(
  userCode: string,
  clientId?: string,
  clientSecret?: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/trakt/link`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ userCode, clientId, clientSecret }),
  });
  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Failed to link Trakt account")
    );
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
    throw new Error(
      await getErrorMessage(response, "Failed to unlink Trakt account")
    );
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
