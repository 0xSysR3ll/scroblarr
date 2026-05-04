import { API_BASE_URL, getAuthHeaders } from "./common";

export interface SyncHistoryItem {
  id: string;
  userId: string;
  username: string;
  mediaType: string;
  mediaTitle: string;
  source?: string;
  tvdbEpisodeId?: string;
  tvdbMovieId?: string;
  imdbMovieId?: string;
  imdbEpisodeId?: string;
  tmdbMovieId?: string;
  tmdbSeriesId?: string;
  posterUrl?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  year?: number;
  success: boolean;
  errorMessage?: string;
  wasRewatched?: boolean;
  destinations?: string[];
  syncedAt: string;
}

export interface SyncHistoryResponse {
  data: SyncHistoryItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export async function getSyncHistory(
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    mediaType?: string;
    success?: boolean;
    source?: string;
  },
  sortBy: string = "syncedAt",
  sortOrder: "ASC" | "DESC" = "DESC"
): Promise<SyncHistoryResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    sortBy,
    sortOrder,
  });

  if (filters?.mediaType) {
    params.append("mediaType", filters.mediaType);
  }
  if (filters?.success !== undefined) {
    params.append("success", filters.success.toString());
  }
  if (filters?.source) {
    params.append("source", filters.source);
  }

  const response = await fetch(
    `${API_BASE_URL}/sync/history?${params.toString()}`,
    {
      headers: getAuthHeaders(),
    }
  );
  if (!response.ok) {
    throw new Error("Failed to fetch sync history");
  }
  return response.json();
}

export async function clearSyncHistory(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sync/history`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to clear sync history");
  }
}

export async function deleteSyncHistoryItem(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sync/history/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to delete sync history item");
  }
}

export async function deleteSyncHistoryItems(ids: string[]): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sync/history`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    throw new Error("Failed to delete sync history items");
  }
}

export interface SyncStatistics {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  byMediaType: {
    episode: number;
    movie: number;
    series: number;
  };
  bySource: {
    plex: number;
    jellyfin: number;
  };
  byDestination: {
    trakt: number;
    tvtime: number;
  };
  byPeriod: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lastMonth: number;
  };
  topThisMonth: Array<{
    mediaTitle: string;
    mediaType: string;
    count: number;
  }>;
  last30Days: {
    total: number;
    successful: number;
    failed: number;
  };
  averages: {
    perDay: number;
    perWeek: number;
    perMonth: number;
  };
  lastSyncedAt: string | null;
  last7Days: number[];
  peakDay: number | null;
  lastFailure: { mediaTitle: string; syncedAt: string } | null;
}

export async function getSyncStatistics(): Promise<SyncStatistics> {
  const response = await fetch(`${API_BASE_URL}/sync/statistics`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch sync statistics");
  }
  return response.json();
}
