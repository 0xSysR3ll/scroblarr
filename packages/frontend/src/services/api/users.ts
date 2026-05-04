import { API_BASE_URL, getAuthHeaders } from "./common";

export interface User {
  id: string;
  plexUsername: string;
  jellyfinUsername?: string;
  displayName?: string;
  email?: string;
  tvtimeUsername?: string;
  traktUsername?: string;
  isAdmin: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  thumb?: string;
}

export interface PlexServerConnection {
  protocol: string;
  address: string;
  port: number;
  uri: string;
  local: boolean;
  relay?: boolean;
}

export interface PlexServer {
  name: string;
  address: string;
  port: string;
  localAddresses?: string;
  machineIdentifier: string;
  version: string;
  url: string;
  connections: PlexServerConnection[];
}

export interface ServerUser {
  username: string;
  displayName?: string;
  email?: string;
  thumb?: string;
}

export async function getUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE_URL}/users`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch users");
  }
  return response.json();
}

export async function getUser(id: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/users/${id}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch user");
  }
  return response.json();
}

export async function createUser(user: Partial<User>): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(user),
  });
  if (!response.ok) {
    throw new Error("Failed to create user");
  }
  return response.json();
}

export async function updateUser(
  id: string,
  user: Partial<User>
): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/users/${id}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(user),
  });
  if (!response.ok) {
    throw new Error("Failed to update user");
  }
  return response.json();
}

export async function deleteUser(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to delete user");
  }
}

export async function deleteUsers(ids: string[]): Promise<{ deleted: number }> {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    throw new Error("Failed to delete users");
  }
  return response.json();
}

export async function getPlexServers(): Promise<PlexServer[]> {
  const response = await fetch(`${API_BASE_URL}/users/servers`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Plex servers");
  }
  return response.json();
}

export async function getServerUsers(serverUrl: string): Promise<ServerUser[]> {
  const response = await fetch(
    `${API_BASE_URL}/users/plex-users?serverUrl=${encodeURIComponent(serverUrl)}`,
    {
      headers: getAuthHeaders(),
    }
  );
  if (!response.ok) {
    throw new Error("Failed to fetch server users");
  }
  return response.json();
}

export async function importUsers(
  serverUrl: string,
  usernames: string[]
): Promise<{
  imported: number;
  users: User[];
}> {
  const response = await fetch(`${API_BASE_URL}/users/import`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ serverUrl, usernames }),
  });
  if (!response.ok) {
    throw new Error("Failed to import users");
  }
  return response.json();
}

export interface JellyfinUser {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  thumb?: string;
  isImported: boolean;
}

export async function getJellyfinUsers(): Promise<JellyfinUser[]> {
  const response = await fetch(`${API_BASE_URL}/users/jellyfin-users`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Jellyfin users");
  }
  return response.json();
}

export async function importJellyfinUsers(usernames: string[]): Promise<{
  imported: number;
  users: User[];
}> {
  const response = await fetch(`${API_BASE_URL}/users/import-jellyfin`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      usernames,
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to import Jellyfin users");
  }
  return response.json();
}
