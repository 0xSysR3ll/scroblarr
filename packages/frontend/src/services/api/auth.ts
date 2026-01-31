import { API_BASE_URL, getAuthHeaders } from "./common";

export async function loginWithPlex(authToken: string): Promise<{
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  isAdmin: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/plex`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authToken }),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to login with Plex" }));
    throw new Error(error.error || "Failed to login with Plex");
  }
  return response.json();
}

export async function linkPlexAccount(authToken: string): Promise<{
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  isAdmin: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/plex/link`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authToken }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to link Plex account" }));
    throw new Error(error.error || "Failed to link Plex account");
  }

  return response.json();
}

export async function loginWithJellyfin(
  username: string,
  password: string,
  hostname?: string,
  port?: number,
  useSsl?: boolean,
  urlBase?: string
): Promise<{
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  isAdmin: boolean;
  accessToken?: string;
}> {
  const body: {
    username: string;
    password: string;
    hostname?: string;
    port?: number;
    useSsl?: boolean;
    urlBase?: string;
  } = {
    username,
    password,
  };

  if (hostname) {
    body.hostname = hostname;
    if (port) body.port = port;
    if (useSsl !== undefined) body.useSsl = useSsl;
    if (urlBase) body.urlBase = urlBase;
  }

  const response = await fetch(`${API_BASE_URL}/auth/jellyfin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to login with Jellyfin" }));
    throw new Error(error.error || "Failed to login with Jellyfin");
  }
  return response.json();
}

export async function linkJellyfinAccount(
  username: string,
  password: string,
  hostname?: string,
  port?: number,
  useSsl?: boolean,
  urlBase?: string
): Promise<{
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  isAdmin: boolean;
}> {
  const body: {
    username: string;
    password: string;
    hostname?: string;
    port?: number;
    useSsl?: boolean;
    urlBase?: string;
  } = {
    username,
    password,
  };

  if (hostname) {
    body.hostname = hostname;
    if (port) body.port = port;
    if (useSsl !== undefined) body.useSsl = useSsl;
    if (urlBase) body.urlBase = urlBase;
  }

  const response = await fetch(`${API_BASE_URL}/auth/jellyfin/link`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to link Jellyfin account" }));
    throw new Error(error.error || "Failed to link Jellyfin account");
  }
  return response.json();
}

export async function unlinkPlexAccount(): Promise<{
  success: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/plex/unlink`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to unlink Plex account" }));
    throw new Error(error.error || "Failed to unlink Plex account");
  }
  return response.json();
}

export async function unlinkJellyfinAccount(): Promise<{
  success: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/jellyfin/unlink`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to unlink Jellyfin account" }));
    throw new Error(error.error || "Failed to unlink Jellyfin account");
  }
  return response.json();
}

export async function getAuthProviders(): Promise<{
  hasAdmin: boolean;
  jellyfinConfigured: boolean;
  plexConfigured: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/providers`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to get auth providers");
  }

  return response.json();
}

export async function setupAdmin(authToken: string): Promise<{
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  isAdmin: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/plex`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authToken }),
  });
  if (!response.ok) {
    throw new Error("Failed to setup admin");
  }
  return response.json();
}

export async function setupJellyfinAdmin(
  username: string,
  password: string,
  hostname: string,
  port?: number,
  useSsl?: boolean,
  urlBase?: string
): Promise<{
  user: {
    id: string;
    username: string;
    displayName?: string;
    email?: string;
    isAdmin: boolean;
  };
  accessToken: string;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/jellyfin/setup-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      hostname,
      port,
      useSsl,
      urlBase,
    }),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to setup Jellyfin admin" }));
    throw new Error(error.error || "Failed to setup Jellyfin admin");
  }
  return response.json();
}

export async function getCurrentUser(): Promise<{
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  isAdmin: boolean;
  thumb?: string;
  plexUsername?: string;
  jellyfinUsername?: string;
  tvtimeMarkMoviesAsRewatched?: boolean;
  tvtimeMarkEpisodesAsRewatched?: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const error = new Error(`Failed to get current user: ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return response.json();
}

export async function updateProfile(updates: {
  displayName?: string;
  email?: string;
  tvtimeMarkMoviesAsRewatched?: boolean;
  tvtimeMarkEpisodesAsRewatched?: boolean;
}): Promise<{
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  isAdmin: boolean;
  tvtimeMarkMoviesAsRewatched?: boolean;
  tvtimeMarkEpisodesAsRewatched?: boolean;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "PATCH",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to update profile" }));
    throw new Error(error.error || "Failed to update profile");
  }
  return response.json();
}
