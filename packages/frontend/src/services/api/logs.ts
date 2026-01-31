import { API_BASE_URL, getAuthHeaders } from "./common";

export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  label?: string;
  error?: unknown;
  [key: string]: unknown;
}

export interface LogsResponse {
  logs: LogEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface LogFile {
  name: string;
  size: number;
  modified: string;
}

export interface LogFilesResponse {
  files: LogFile[];
}

export async function getLogs(params?: {
  page?: number;
  pageSize?: number;
  level?: "debug" | "info" | "warn" | "error" | "fatal";
  label?:
    | "webhook"
    | "sync"
    | "auth"
    | "api"
    | "database"
    | "tvtime"
    | "plex"
    | "system"
    | "migration";
  search?: string;
}): Promise<LogsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) {
    queryParams.append("page", params.page.toString());
  }
  if (params?.pageSize) {
    queryParams.append("pageSize", params.pageSize.toString());
  }
  if (params?.level) {
    queryParams.append("level", params.level);
  }
  if (params?.label) {
    queryParams.append("label", params.label);
  }
  if (params?.search) {
    queryParams.append("search", params.search);
  }

  const response = await fetch(
    `${API_BASE_URL}/logs?${queryParams.toString()}`,
    {
      headers: getAuthHeaders(),
    }
  );
  if (!response.ok) {
    throw new Error("Failed to fetch logs");
  }
  return response.json();
}

export async function getLogFiles(): Promise<LogFilesResponse> {
  const response = await fetch(`${API_BASE_URL}/logs/files`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch log files");
  }
  return response.json();
}

export async function downloadLogFile(filename: string): Promise<void> {
  const token = localStorage.getItem("plexAccessToken");
  const url = `${API_BASE_URL}/logs/download/${encodeURIComponent(filename)}`;
  const response = await fetch(url, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  if (!response.ok) {
    throw new Error("Failed to download log file");
  }
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}
