import { getCached, setCached, invalidateCachedPrefix } from "./cache";
import { API_BASE_URL, getAuthHeaders } from "./common";

const CACHE_KEY_STATUS = "simkl-status";
const CACHE_KEY_PROFILE = "simkl-profile";

export const SIMKL_VIP_URL = "https://simkl.com/vip/";

export interface SimklStatus {
  linked: boolean;
  username: string | null;
  image: string | null;
  hasCredentials: boolean;
  needsReconnect?: boolean;
  accountType?: "free" | "pro" | "vip" | null;
  canTrackRewatches?: boolean;
  markMoviesAsRewatched?: boolean;
  markEpisodesAsRewatched?: boolean;
}

export interface SimklProfile {
  id: number | null;
  username: string | null;
  image: string | null;
  accountType?: "free" | "pro" | "vip" | null;
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

export async function getSimklAuthorizeUrl(): Promise<SimklPinAuthorization> {
  const response = await fetch(`${API_BASE_URL}/simkl/authorize`, {
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
  userCode: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/simkl/link`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ userCode }),
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

export async function getSimklStatus(options?: {
  force?: boolean;
}): Promise<SimklStatus> {
  if (!options?.force) {
    const cached = getCached<SimklStatus>(CACHE_KEY_STATUS);
    if (cached) return cached;
  }

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

export async function updateSimklSettings(settings: {
  markMoviesAsRewatched: boolean;
  markEpisodesAsRewatched: boolean;
}): Promise<{
  success: boolean;
  markMoviesAsRewatched: boolean;
  markEpisodesAsRewatched: boolean;
  accountType: "free" | "pro" | "vip" | null;
  canTrackRewatches: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/simkl/settings`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Failed to update Simkl settings")
    );
  }
  invalidateSimklCache();
  return response.json();
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
