import { getCached, setCached, invalidateCachedPrefix } from "./cache";
import { API_BASE_URL, getAuthHeaders } from "./common";

const CACHE_KEY_STATUS = "simkl-status";
const CACHE_KEY_PROFILE = "simkl-profile";

export interface SimklStatus {
  linked: boolean;
  username: string | null;
  image: string | null;
  hasCredentials: boolean;
}

export interface SimklProfile {
  id: number | null;
  username: string | null;
  image: string | null;
}

export interface SimklPinAuthorization {
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export function invalidateSimklCache(): void {
  invalidateCachedPrefix("simkl-");
}

async function getErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const jsonSource =
      typeof response.clone === "function" ? response.clone() : response;
    const error = (await jsonSource.json()) as { error?: unknown };
    if (typeof error.error === "string" && error.error) {
      return error.error;
    }
  } catch {
    // Fall through to text/status fallback.
  }

  try {
    const text = await response.text();
    if (text.trim()) {
      return text.trim();
    }
  } catch {
    // Fall through to status fallback.
  }

  const status = [response.status, response.statusText]
    .filter(Boolean)
    .join(" ");
  return status ? `${fallback} (${status})` : fallback;
}

export async function getSimklAuthorizeUrl(
  clientId?: string
): Promise<SimklPinAuthorization> {
  const params = new URLSearchParams();
  if (clientId) params.append("clientId", clientId);

  const url = `${API_BASE_URL}/simkl/authorize${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Failed to get Simkl PIN code")
    );
  }
  return response.json();
}

export async function linkSimkl(
  userCode: string,
  clientId?: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/simkl/link`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ userCode, clientId }),
  });
  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Failed to link Simkl account")
    );
  }
  invalidateSimklCache();
  return response.json();
}

export async function unlinkSimkl(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/simkl/unlink`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Failed to unlink Simkl account")
    );
  }
  invalidateSimklCache();
  return response.json();
}

export async function getSimklStatus(): Promise<SimklStatus> {
  const cached = getCached<SimklStatus>(CACHE_KEY_STATUS);
  if (cached) return cached;

  const response = await fetch(`${API_BASE_URL}/simkl/status`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Simkl status");
  }
  const data = (await response.json()) as SimklStatus;
  setCached(CACHE_KEY_STATUS, data);
  return data;
}

export async function getSimklProfile(): Promise<SimklProfile> {
  const cached = getCached<SimklProfile>(CACHE_KEY_PROFILE);
  if (cached) return cached;

  const response = await fetch(`${API_BASE_URL}/simkl/profile`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Failed to fetch Simkl profile")
    );
  }
  const data = (await response.json()) as SimklProfile;
  setCached(CACHE_KEY_PROFILE, data);
  return data;
}
