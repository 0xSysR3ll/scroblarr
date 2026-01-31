import { API_BASE_URL, getAuthHeaders } from "./common";

export interface TraktStatus {
  linked: boolean;
  username: string | null;
  image: string | null;
  hasCredentials: boolean;
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
  return response.json();
}

export async function getTraktStatus(): Promise<TraktStatus> {
  const response = await fetch(`${API_BASE_URL}/trakt/status`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Trakt status");
  }
  return response.json();
}
