import { CustomCheckbox } from "@components/ui/CustomCheckbox";
import { Spinner } from "@components/ui/spinner";
import {
  getLogs,
  getLogFiles,
  downloadLogFile,
  type LogEntry,
  type LogFile,
} from "@services/api";
import { useEffect, useState, useCallback, Fragment } from "react";
import { useTranslation } from "react-i18next";
import {
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";

const LOG_LEVELS = {
  10: { label: "trace", color: "text-muted-foreground" },
  20: { label: "debug", color: "text-muted-foreground/80" },
  30: { label: "info", color: "text-primary" },
  40: { label: "warn", color: "text-yellow-500" },
  50: { label: "error", color: "text-red-500" },
  60: { label: "fatal", color: "text-red-700 dark:text-red-400" },
} as const;

export function LogsTab() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [level, setLevel] = useState<
    "debug" | "info" | "warn" | "error" | "fatal" | ""
  >("info");
  const [label, setLabel] = useState<
    | "webhook"
    | "sync"
    | "auth"
    | "api"
    | "database"
    | "tvtime"
    | "trakt"
    | "plex"
    | "jellyfin"
    | "system"
    | "migration"
    | ""
  >("");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const loadLogs = useCallback(
    async (isAutoRefresh = false) => {
      try {
        setError(null);
        if (isAutoRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        const response = await getLogs({
          page,
          pageSize,
          level: level || undefined,
          label: label || undefined,
          search: search || undefined,
        });
        setLogs(response.logs);
        setPagination(response.pagination);
        setExpandedRows(new Set());
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("logs.errors.loadFailed", {
                defaultValue: "Failed to load logs",
              })
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, level, label, search, t]
  );

  const loadLogFiles = async () => {
    try {
      const response = await getLogFiles();
      setLogFiles(response.files);
    } catch {
      // Silently fail - log files are optional
    }
  };

  useEffect(() => {
    void loadLogFiles();
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadLogs(true);
      }, 5000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [autoRefresh, loadLogs]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
    }, 500);
    return () => clearTimeout(timeout);
  }, [pageSize, level, label, search]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getLevelInfo = (level: number) => {
    return (
      LOG_LEVELS[level as keyof typeof LOG_LEVELS] || {
        label: "unknown",
        color: "text-muted-foreground",
      }
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="mb-6 rounded-lg border border-border/60 bg-card p-4 text-card-foreground shadow-md sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t("logs.filters.pageSize", { defaultValue: "Page Size" })}
            </label>
            <input
              type="number"
              min="10"
              max="1000"
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value, 10) || 10)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t("logs.filters.level", { defaultValue: "Level" })}
            </label>
            <select
              value={level}
              onChange={(e) =>
                setLevel(
                  e.target.value as
                    | "debug"
                    | "info"
                    | "warn"
                    | "error"
                    | "fatal"
                    | ""
                )
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="">
                {t("logs.filters.all", { defaultValue: "All" })}
              </option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="fatal">Fatal</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t("logs.filters.label", { defaultValue: "Label" })}
            </label>
            <select
              value={label}
              onChange={(e) =>
                setLabel(
                  e.target.value as
                    | "webhook"
                    | "sync"
                    | "auth"
                    | "api"
                    | "database"
                    | "tvtime"
                    | "trakt"
                    | "plex"
                    | "jellyfin"
                    | "system"
                    | "migration"
                    | ""
                )
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="">
                {t("logs.filters.all", { defaultValue: "All" })}
              </option>
              <option value="webhook">Webhook</option>
              <option value="sync">Sync</option>
              <option value="auth">Auth</option>
              <option value="api">API</option>
              <option value="database">Database</option>
              <option value="tvtime">TVTime</option>
              <option value="trakt">Trakt</option>
              <option value="plex">Plex</option>
              <option value="jellyfin">Jellyfin</option>
              <option value="system">System</option>
              <option value="migration">Migration</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t("logs.filters.search", { defaultValue: "Search" })}
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("logs.filters.searchPlaceholder", {
                defaultValue: "Search logs...",
              })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <CustomCheckbox
                checked={autoRefresh}
                onChange={() => setAutoRefresh(!autoRefresh)}
              />
              <span className="text-sm font-medium text-foreground">
                {t("logs.autoRefresh", { defaultValue: "Auto Refresh" })}
              </span>
            </label>
          </div>
        </div>
        <button
          onClick={() => loadLogs()}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("logs.refresh", { defaultValue: "Refresh" })}
        </button>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">
            {t("logs.logEntries", { defaultValue: "Log Entries" })}
          </h2>
          {refreshing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="md" />
              <span>
                {t("logs.refreshing", { defaultValue: "Refreshing..." })}
              </span>
            </div>
          )}
        </div>
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Spinner size="xl" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-muted-foreground">
            {t("logs.noLogs", { defaultValue: "No logs available" })}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Level
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Label
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Message
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card text-card-foreground">
                {logs.map((log, index) => {
                  const levelInfo = getLevelInfo(log.level);
                  const additionalFields = Object.keys(log).filter(
                    (key) =>
                      ![
                        "level",
                        "time",
                        "msg",
                        "label",
                        "severity",
                        "name",
                        "hostname",
                        "pid",
                      ].includes(key)
                  );
                  const expanded = expandedRows.has(index);
                  const toggleExpanded = () => {
                    setExpandedRows((prev) => {
                      const next = new Set(prev);
                      if (next.has(index)) {
                        next.delete(index);
                      } else {
                        next.add(index);
                      }
                      return next;
                    });
                  };

                  return (
                    <Fragment key={index}>
                      <tr
                        className={`transition-colors hover:bg-muted/50 ${
                          log.level >= 50
                            ? "bg-red-50/50 dark:bg-red-900/10"
                            : log.level >= 40
                              ? "bg-yellow-50/50 dark:bg-yellow-900/10"
                              : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-sm text-muted-foreground whitespace-nowrap">
                          {formatTime(log.time)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`font-semibold ${levelInfo.color} text-sm`}
                          >
                            {levelInfo.label.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {typeof log.label === "string" && log.label ? (
                            <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                              {log.label}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">
                              —
                            </span>
                          )}
                        </td>
                        <td className="max-w-md break-words px-4 py-3 text-sm text-foreground">
                          {log.msg}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                          {additionalFields.length > 0 && (
                            <button
                              onClick={toggleExpanded}
                              className="font-medium text-primary hover:text-primary/80"
                            >
                              {expanded ? "Hide" : "Show"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && additionalFields.length > 0 && (
                        <tr key={`${index}-details`} className="bg-muted/40">
                          <td colSpan={5} className="px-4 py-4">
                            <div className="space-y-3">
                              {expanded && additionalFields.length > 0 && (
                                <div className="mt-2">
                                  <div className="mb-2 text-xs font-semibold text-foreground/90">
                                    {t("logs.additionalFieldsSummary", {
                                      defaultValue:
                                        "{{count}} additional field{{plural}}",
                                      count: additionalFields.length,
                                      plural:
                                        additionalFields.length > 1 ? "s" : "",
                                    })}
                                  </div>
                                  <div className="space-y-1 border-l-2 border-border pl-4">
                                    {additionalFields.map((key) => {
                                      const value =
                                        log[key as keyof typeof log];
                                      return (
                                        <div
                                          key={key}
                                          className="font-mono text-xs text-muted-foreground"
                                        >
                                          <span className="font-semibold text-foreground/90">
                                            {key}:
                                          </span>{" "}
                                          <span className="break-all">
                                            {typeof value === "object"
                                              ? JSON.stringify(value, null, 2)
                                              : String(value)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {pagination.totalPages > 1 && (
              <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-foreground/90">
                  {t("sync.pagination.showing", {
                    from: (pagination.page - 1) * pagination.pageSize + 1,
                    to: Math.min(
                      pagination.page * pagination.pageSize,
                      pagination.total
                    ),
                    total: pagination.total,
                    defaultValue:
                      "Showing {{from}} to {{to}} of {{total}} results",
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={pagination.page === 1}
                    aria-label="First page"
                    className="inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                  >
                    <FaAngleDoubleLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.page === 1}
                    aria-label={t("sync.pagination.previous", {
                      defaultValue: "Previous",
                    })}
                    className="inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                  >
                    <FaChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                  </button>
                  {/* Page number buttons */}
                  {Array.from(
                    { length: pagination.totalPages },
                    (_, i) => i + 1
                  )
                    .filter((p) => {
                      if (p === 1 || p === pagination.totalPages) return true;
                      return (
                        p >= pagination.page - 2 && p <= pagination.page + 2
                      );
                    })
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={`rounded-md border px-2 py-1 text-xs font-medium sm:text-sm ${
                          p === pagination.page
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => Math.min(pagination.totalPages, p + 1))
                    }
                    disabled={pagination.page === pagination.totalPages}
                    aria-label={t("sync.pagination.next", {
                      defaultValue: "Next",
                    })}
                    className="inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                  >
                    <FaChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(pagination.totalPages)}
                    disabled={pagination.page === pagination.totalPages}
                    aria-label="Last page"
                    className="inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                  >
                    <FaAngleDoubleRight className="h-3 w-3 sm:h-4 sm:w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <h2 className="mb-4 text-xl font-semibold text-foreground">
          {t("logs.logFiles", { defaultValue: "Log Files" })}
        </h2>
        {logFiles.length === 0 ? (
          <p className="text-muted-foreground">
            {t("logs.noLogFiles", { defaultValue: "No log files found" })}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4 md:px-6">
                    {t("logs.fileName", { defaultValue: "File Name" })}
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4 md:px-6">
                    {t("logs.fileSize", { defaultValue: "Size" })}
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4 md:px-6">
                    {t("logs.modified", { defaultValue: "Modified" })}
                  </th>
                  <th className="px-2 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4 md:px-6">
                    {t("logs.actions", { defaultValue: "Actions" })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card text-card-foreground">
                {logFiles.map((file) => (
                  <tr key={file.name}>
                    <td className="px-2 py-4 text-sm whitespace-nowrap text-foreground sm:px-4 md:px-6">
                      {file.name}
                    </td>
                    <td className="px-2 py-4 text-sm whitespace-nowrap text-muted-foreground sm:px-4 md:px-6">
                      {formatBytes(file.size)}
                    </td>
                    <td className="px-2 py-4 text-sm whitespace-nowrap text-muted-foreground sm:px-4 md:px-6">
                      {new Date(file.modified).toLocaleString()}
                    </td>
                    <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap text-sm text-right">
                      <button
                        onClick={async () => {
                          try {
                            await downloadLogFile(file.name);
                          } catch {
                            // Error handled by browser download mechanism
                          }
                        }}
                        className="text-primary hover:text-primary/80"
                      >
                        {t("logs.download", { defaultValue: "Download" })}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
