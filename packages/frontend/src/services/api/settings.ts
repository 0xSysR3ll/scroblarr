import { API_BASE_URL, getAuthHeaders } from "./common";

export interface Settings {
  plexServerUrl?: string;
  syncHistoryLimit?: string;
  jellyfinHost?: string;
  jellyfinPort?: string;
  jellyfinUseSsl?: string;
  jellyfinUrlBase?: string;
  jellyfinApiKey?: string;
  apiKey?: string;
}

export async function getSettings(): Promise<Settings> {
  const response = await fetch(`${API_BASE_URL}/settings`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch settings");
  }
  return response.json();
}

export async function updateSettings(
  settings: Partial<Settings>
): Promise<Settings> {
  const response = await fetch(`${API_BASE_URL}/settings`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error("Failed to update settings");
  }
  return response.json();
}

export async function removePlexServer(): Promise<Settings> {
  const response = await fetch(`${API_BASE_URL}/settings/plex`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to remove Plex server");
  }
  return response.json();
}

export async function removeJellyfinServer(): Promise<Settings> {
  const response = await fetch(`${API_BASE_URL}/settings/jellyfin`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to remove Jellyfin server");
  }
  return response.json();
}
