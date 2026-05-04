import { API_BASE_URL } from "./common";

export interface AppVersionInfo {
  version: string;
  tag?: string | null;
  /** `true` / `false` when GitHub latest was loaded and could be compared to this build; `null` otherwise. */
  isLatest?: boolean | null;
  latestTag?: string | null;
  latestUrl?: string | null;
  /** Set when the server could not load GitHub's latest release (network, rate limit, etc.). */
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
