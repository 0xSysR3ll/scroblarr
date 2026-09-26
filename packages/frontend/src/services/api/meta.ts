import { API_BASE_URL } from "./common";

export interface AppVersionInfo {
  version: string;
  commitTag?: string;
  updateAvailable?: boolean;
  commitsBehind?: number;
  latestTag?: string | null;
  latestUrl?: string | null;
  releasesError?: string | null;
  githubRepository?: string;
}

export async function getAppVersion(): Promise<AppVersionInfo> {
  const response = await fetch(`${API_BASE_URL}/meta/version`);

  if (!response.ok) {
    throw new Error("Failed to fetch app version");
  }

  return response.json();
}
