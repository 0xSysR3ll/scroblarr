import { getCached, setCached, invalidateCachedPrefix } from "./cache";
import { API_BASE_URL, getAuthHeaders } from "./common";

const CACHE_KEY_STATUS = "bingers-status";

export const BINGERS_MOBILE_SIGNIN_URL = "https://bingers.app/mobile-signin";

export interface BingersStatus {
  linked: boolean;
  needsReauthorization: boolean;
  username: string | null;
  image: string | null;
}

export function invalidateBingersCache(): void {
  invalidateCachedPrefix("bingers-");
}

async function getErrorPayload(
  response: Response,
  fallback: string
): Promise<{ message: string; code?: string; retryAfterSeconds?: number }> {
  try {
    const jsonSource =
      typeof response.clone === "function" ? response.clone() : response;
    const error = (await jsonSource.json()) as {
      error?: unknown;
      code?: string;
      retryAfterSeconds?: number;
    };
    if (typeof error.error === "string" && error.error) {
      return {
        message: error.error,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }
  } catch {
    // Fall through.
  }

  try {
    const text = await response.text();
    if (text.trim()) {
      return { message: text.trim() };
    }
  } catch {
    // Fall through.
  }

  const status = [response.status, response.statusText]
    .filter(Boolean)
    .join(" ");
  return {
    message: status ? `${fallback} (${status})` : fallback,
  };
}

export async function linkBingers(
  token: string,
  email?: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/bingers/link`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ token, email }),
  });
  if (!response.ok) {
    const payload = await getErrorPayload(
      response,
      "Failed to link Bingers account"
    );
    throw new Error(payload.message);
  }
  invalidateBingersCache();
  return response.json();
}

export async function unlinkBingers(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/bingers/unlink`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const payload = await getErrorPayload(
      response,
      "Failed to unlink Bingers account"
    );
    throw new Error(payload.message);
  }
  invalidateBingersCache();
  return response.json();
}

export async function getBingersStatus(options?: {
  force?: boolean;
}): Promise<BingersStatus> {
  if (!options?.force) {
    const cached = getCached<BingersStatus>(CACHE_KEY_STATUS);
    if (cached) return cached;
  }

  const response = await fetch(`${API_BASE_URL}/bingers/status`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const payload = await getErrorPayload(
      response,
      "Failed to fetch Bingers status"
    );
    throw new Error(payload.message);
  }
  const data = (await response.json()) as BingersStatus;
  setCached(CACHE_KEY_STATUS, data);
  return data;
}
