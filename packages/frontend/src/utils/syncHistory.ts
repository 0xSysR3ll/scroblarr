import { TFunction } from "i18next";
import { API_BASE_URL } from "@services/api/common";
import type { SyncHistoryItem } from "@services/api";
import { isPlexServerUrl } from "@scroblarr/shared";

/**
 * Generates a proxy URL for poster images if they're from Plex or Jellyfin
 * Otherwise returns the original URL
 */
export function getPosterUrl(item: SyncHistoryItem): string | undefined {
  if (!item.posterUrl) {
    return undefined;
  }

  if (isPlexServerUrl(item.posterUrl) || item.source === "jellyfin") {
    return `${API_BASE_URL}/sync/poster/${item.id}`;
  }

  return item.posterUrl;
}

export function formatMediaTitle(item: SyncHistoryItem): string {
  let title = item.mediaTitle;

  if (item.mediaType === "episode") {
    if (item.seasonNumber !== undefined && item.episodeNumber !== undefined) {
      const seasonEpisodePattern = /S\d+E\d+/i;
      if (!seasonEpisodePattern.test(title)) {
        title = `${title} S${item.seasonNumber}E${item.episodeNumber}`;
      }
    }
  } else if (item.mediaType === "movie") {
    if (item.year && !title.includes(`(${item.year})`)) {
      title = `${title} (${item.year})`;
    }
  }

  return title;
}

export function getMediaLinks(item: SyncHistoryItem): Array<{
  id: string;
  label: string;
  url: string;
  logoPath: string;
  needsDarkBg?: boolean; // For logos that don't work on light backgrounds
}> {
  const links: Array<{
    id: string;
    label: string;
    url: string;
    logoPath: string;
    needsDarkBg?: boolean;
  }> = [];

  if (item.mediaType === "episode") {
    if (item.tvdbEpisodeId) {
      links.push({
        id: "tvdb",
        label: "TVDB",
        url: `https://www.thetvdb.com/?tab=episode&id=${item.tvdbEpisodeId}`,
        logoPath: "/logos/tvdb.svg",
        needsDarkBg: true, // TVDB logo is white/green, needs dark background
      });
    }
    if (item.imdbEpisodeId) {
      links.push({
        id: "imdb",
        label: "IMDB",
        url: `https://www.imdb.com/title/${item.imdbEpisodeId}`,
        logoPath: "/logos/imdb.svg",
      });
    }
  } else if (item.mediaType === "movie") {
    if (item.tvdbMovieId) {
      links.push({
        id: "tvdb",
        label: "TVDB",
        url: `https://www.thetvdb.com/?tab=movie&id=${item.tvdbMovieId}`,
        logoPath: "/logos/tvdb.svg",
        needsDarkBg: true, // TVDB logo is white/green, needs dark background
      });
    }
    if (item.imdbMovieId) {
      links.push({
        id: "imdb",
        label: "IMDB",
        url: `https://www.imdb.com/title/${item.imdbMovieId}`,
        logoPath: "/logos/imdb.svg",
      });
    }
    if (item.tmdbMovieId) {
      links.push({
        id: "tmdb",
        label: "TMDB",
        url: `https://www.themoviedb.org/movie/${item.tmdbMovieId}`,
        logoPath: "/logos/tmdb.svg",
      });
    }
  }

  return links;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeTime(dateString: string, t: TFunction): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return t("sync.time.justNow", { defaultValue: "Just now" });
  } else if (diffMins < 60) {
    return t("sync.time.minutesAgo", {
      count: diffMins,
      defaultValue: "{{count}}m ago",
    });
  } else if (diffHours < 24) {
    return t("sync.time.hoursAgo", {
      count: diffHours,
      defaultValue: "{{count}}h ago",
    });
  } else if (diffDays === 1) {
    return t("sync.time.yesterday", { defaultValue: "Yesterday" });
  } else if (diffDays < 7) {
    return t("sync.time.daysAgo", {
      count: diffDays,
      defaultValue: "{{count}}d ago",
    });
  } else {
    return formatDateShort(dateString);
  }
}

export function exportToCSV(
  history: SyncHistoryItem[],
  formatMediaTitle: (item: SyncHistoryItem) => string,
  formatDate: (dateString: string) => string
): void {
  const headers = [
    "Date",
    "Media Type",
    "Title",
    "Source",
    "Status",
    "TVDB ID",
    "IMDB ID",
    "TMDB ID",
    "Error Message",
  ];
  const rows = history.map((item) => [
    formatDate(item.syncedAt),
    item.mediaType,
    formatMediaTitle(item),
    item.source || "",
    item.success ? "Success" : "Failed",
    item.tvdbEpisodeId || item.tvdbMovieId || "",
    item.imdbMovieId || item.imdbEpisodeId || "",
    item.tmdbMovieId || item.tmdbSeriesId || "",
    item.errorMessage || "",
  ]);

  const csvContent =
    [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n") + "\n";

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `sync-history-${new Date().toISOString().split("T")[0]}.csv`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToJSON(
  history: SyncHistoryItem[],
  formatMediaTitle: (item: SyncHistoryItem) => string
): void {
  const data = history.map((item) => ({
    id: item.id,
    date: item.syncedAt,
    mediaType: item.mediaType,
    title: formatMediaTitle(item),
    source: item.source,
    status: item.success ? "success" : "failed",
    tvdbId: item.tvdbEpisodeId || item.tvdbMovieId || "",
    imdbId: item.imdbMovieId || "",
    tmdbId: item.tmdbMovieId || item.tmdbSeriesId || "",
    errorMessage: item.errorMessage,
  }));

  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `sync-history-${new Date().toISOString().split("T")[0]}.json`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
