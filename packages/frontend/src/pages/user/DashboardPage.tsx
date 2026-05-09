import { Skeleton } from "@components/ui/skeleton";
import { useAuth } from "@contexts/AuthContext";
import {
  getSyncStatistics,
  getSyncHistory,
  SyncStatistics,
  type SyncHistoryItem,
} from "@services/api/sync";
import { formatMediaTitle, formatRelativeTime } from "@utils/syncHistory";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaFilm,
  FaTv,
  FaListUl,
  FaCalendarDay,
  FaCalendarWeek,
  FaCalendarAlt,
  FaDatabase,
  FaClock,
  FaExternalLinkAlt,
  FaSync,
  FaChevronDown,
  FaChevronRight,
} from "react-icons/fa";
import { Link, useNavigate } from "react-router-dom";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function StatCard({
  title,
  value,
  icon: Icon,
  color = "blue",
  subtitle,
  primary = false,
}: {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  color?: "blue" | "green" | "red" | "purple" | "yellow";
  subtitle?: string;
  primary?: boolean;
}) {
  const colorClasses = {
    blue: "bg-primary/15 text-primary",
    green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    red: "bg-destructive/15 text-destructive",
    purple: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    yellow: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  };

  return (
    <div
      className={`rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6 ${
        primary ? "ring-2 ring-primary/25 border-primary/30" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p
        className={
          primary
            ? "text-4xl font-bold text-foreground tracking-tight"
            : "text-3xl font-bold text-foreground"
        }
      >
        {value}
      </p>
      {subtitle && (
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
      <Skeleton className="mt-2 h-9 w-20" />
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [statistics, setStatistics] = useState<SyncStatistics | null>(null);
  const [recentSyncs, setRecentSyncs] = useState<SyncHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataFetchedAt, setDataFetchedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(true);
  const [averagesOpen, setAveragesOpen] = useState(true);

  const loadDashboard = useCallback(
    async ({ isRefresh = false }: { isRefresh?: boolean } = {}) => {
      try {
        if (!statistics && !isRefresh) {
          setLoading(true);
        }
        if (isRefresh) {
          setRefreshing(true);
        }
        setError(null);
        const [stats, historyRes] = await Promise.all([
          getSyncStatistics(),
          getSyncHistory(1, 5, undefined, "syncedAt", "DESC"),
        ]);
        setStatistics(stats);
        setRecentSyncs(historyRes.data);
        setDataFetchedAt(new Date());
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("dashboard.errors.loadFailed", {
                defaultValue: "Failed to load statistics",
              })
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- statistics intentionally omitted to avoid re-running effect after first load
    [t]
  );

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDashboard();
    }
  }, [user, loadDashboard]);

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {t("dashboard.title", { defaultValue: "Dashboard" })}
          </h1>
        </div>

        {/* Welcome Card */}
        <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold mb-2 text-foreground">
                {t("dashboard.welcome", { defaultValue: "Welcome" })}
              </h2>
              <p className="text-muted-foreground">
                {t("dashboard.welcomeMessage", {
                  username: user?.displayName || user?.username || "User",
                  defaultValue: "Welcome to Scroblarr, {{username}}!",
                })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {statistics && statistics.total > 0 && (
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    statistics.last30Days.failed > 0
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      : statistics.byPeriod.thisWeek === 0
                        ? "bg-muted text-muted-foreground"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                  }`}
                  title={
                    statistics.last30Days.failed > 0
                      ? t("dashboard.health.issuesHint", {
                          defaultValue: "Some syncs failed in the last 30 days",
                        })
                      : statistics.byPeriod.thisWeek === 0
                        ? t("dashboard.health.noActivityHint", {
                            defaultValue: "No syncs this week yet",
                          })
                        : t("dashboard.health.healthyHint", {
                            defaultValue: "Syncs are going through",
                          })
                  }
                >
                  {statistics.last30Days.failed > 0
                    ? t("dashboard.health.issues", { defaultValue: "Issues" })
                    : statistics.byPeriod.thisWeek === 0
                      ? t("dashboard.health.noActivity", {
                          defaultValue: "No recent activity",
                        })
                      : t("dashboard.health.healthy", {
                          defaultValue: "Healthy",
                        })}
                </span>
              )}
              {statistics?.lastSyncedAt && (
                <p
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  title={new Date(statistics.lastSyncedAt).toLocaleString()}
                >
                  <FaClock className="w-4 h-4 flex-shrink-0" />
                  {t("dashboard.lastSynced", {
                    defaultValue: "Last synced",
                  })}{" "}
                  {formatRelativeTime(statistics.lastSyncedAt, t)}
                </p>
              )}
              {dataFetchedAt && statistics && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span title={dataFetchedAt.toLocaleString()}>
                    {t("dashboard.dataAsOf", {
                      defaultValue: "Data as of",
                    })}{" "}
                    {formatRelativeTime(dataFetchedAt.toISOString(), t)}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadDashboard({ isRefresh: true })}
                    disabled={refreshing || loading}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    title={t("dashboard.refresh", { defaultValue: "Refresh" })}
                    aria-label={t("dashboard.refresh", {
                      defaultValue: "Refresh",
                    })}
                  >
                    <FaSync
                      className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Statistics Section */}
        {loading ? (
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </div>
            <Skeleton className="mt-4 h-4 w-48" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-border/60 bg-card text-card-foreground shadow-sm p-6">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : statistics ? (
          statistics.total === 0 ? (
            <>
              <div className="rounded-lg border border-border/60 bg-card text-card-foreground shadow-sm p-8 mb-6 text-center">
                <div className="max-w-md mx-auto">
                  <FaDatabase className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {t("dashboard.empty.title", {
                      defaultValue: "No sync data yet",
                    })}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    {t("dashboard.empty.description", {
                      defaultValue:
                        "Watch something on Plex or Jellyfin and it will appear here. Make sure webhooks are configured and your Trakt or TVTime account is linked in your profile.",
                    })}
                  </p>
                  <button
                    onClick={() => navigate("/profile")}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {t("dashboard.empty.checkProfile", {
                      defaultValue: "Check profile & links",
                    })}
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-card text-card-foreground shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4 text-foreground">
                  {t("dashboard.quickActions", {
                    defaultValue: "Quick Actions",
                  })}
                </h3>
                <button
                  onClick={() => navigate("/sync")}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t("dashboard.viewSyncHistory", {
                    defaultValue: "View Sync History",
                  })}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Main KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <StatCard
                  title={t("dashboard.stats.total", {
                    defaultValue: "Total Synced",
                  })}
                  value={statistics.total.toLocaleString()}
                  icon={FaDatabase}
                  color="blue"
                  primary
                />
                <StatCard
                  title={t("dashboard.stats.successful", {
                    defaultValue: "Successful",
                  })}
                  value={statistics.successful.toLocaleString()}
                  icon={FaCheckCircle}
                  color="green"
                />
                <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {t("dashboard.stats.failed", { defaultValue: "Failed" })}
                    </h3>
                    <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                      <FaTimesCircle className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-foreground">
                    {statistics.failed.toLocaleString()}
                  </p>
                  {statistics.failed > 0 && (
                    <Link
                      to="/sync?filter=failed"
                      className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium mt-1 inline-block"
                    >
                      {t("dashboard.viewFailedSyncs", {
                        defaultValue: "View failed syncs",
                      })}
                    </Link>
                  )}
                </div>
                <StatCard
                  title={t("dashboard.stats.successRate", {
                    defaultValue: "Success Rate",
                  })}
                  value={`${statistics.successRate}%`}
                  icon={FaCheckCircle}
                  color={
                    statistics.successRate >= 95
                      ? "green"
                      : statistics.successRate >= 80
                        ? "yellow"
                        : "red"
                  }
                  primary
                />
              </div>

              {/* Last 30 days + This month vs last month */}
              <div className="space-y-2 mb-6 px-1" aria-label="Summary">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-sm font-medium text-muted-foreground">
                    {t("dashboard.stats.last30Days", {
                      defaultValue: "Last 30 days",
                    })}
                  </span>
                  <span className="text-sm text-foreground/90">
                    {statistics.last30Days.total.toLocaleString()}{" "}
                    {t("dashboard.stats.synced", { defaultValue: "synced" })}
                    {statistics.last30Days.total > 0 && (
                      <>
                        {" · "}
                        <span className="text-green-600 dark:text-green-400">
                          {statistics.last30Days.successful}{" "}
                          {t("dashboard.stats.ok", { defaultValue: "ok" })}
                        </span>
                        {statistics.last30Days.failed > 0 && (
                          <>
                            {" · "}
                            <span className="text-red-600 dark:text-red-400">
                              {statistics.last30Days.failed}{" "}
                              {t("dashboard.stats.failedShort", {
                                defaultValue: "failed",
                              })}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </span>
                  {statistics.last30Days.total > 0 && (
                    <Link
                      to="/sync"
                      className="text-sm font-medium text-primary hover:text-primary/80"
                    >
                      {t("dashboard.viewSyncHistory", {
                        defaultValue: "View Sync History",
                      })}
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <span className="font-medium">
                    {t("dashboard.stats.thisMonth", {
                      defaultValue: "This month",
                    })}
                  </span>
                  <span>
                    {statistics.byPeriod.thisMonth.toLocaleString()}{" "}
                    {t("dashboard.stats.syncs", { defaultValue: "syncs" })}
                    {statistics.byPeriod.thisMonth >
                      statistics.byPeriod.lastMonth && (
                      <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                        {" "}
                        (+
                        {(
                          statistics.byPeriod.thisMonth -
                          statistics.byPeriod.lastMonth
                        ).toLocaleString()}{" "}
                        {t("dashboard.stats.vsLastMonth", {
                          defaultValue: "vs last month",
                        })}
                        )
                      </span>
                    )}
                    {statistics.byPeriod.thisMonth <
                      statistics.byPeriod.lastMonth && (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">
                        {" "}
                        (
                        {(
                          statistics.byPeriod.thisMonth -
                          statistics.byPeriod.lastMonth
                        ).toLocaleString()}{" "}
                        {t("dashboard.stats.vsLastMonth", {
                          defaultValue: "vs last month",
                        })}
                        )
                      </span>
                    )}
                    {statistics.byPeriod.thisMonth ===
                      statistics.byPeriod.lastMonth &&
                      statistics.byPeriod.lastMonth > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          (
                          {t("dashboard.stats.sameAsLastMonth", {
                            defaultValue: "same as last month",
                          })}
                          )
                        </span>
                      )}
                  </span>
                </div>
                {statistics.lastFailure && (
                  <div className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="text-muted-foreground">
                      {t("dashboard.lastFailure", {
                        defaultValue: "Last failure",
                      })}
                    </span>
                    <Link
                      to="/sync?filter=failed"
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
                    >
                      {statistics.lastFailure.mediaTitle}
                    </Link>
                    <span className="text-muted-foreground">
                      · {formatRelativeTime(statistics.lastFailure.syncedAt, t)}
                    </span>
                  </div>
                )}
                {statistics.peakDay != null && statistics.total > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.peakDay", {
                      day: DAY_NAMES[statistics.peakDay],
                      defaultValue: "You sync most on {{day}}s",
                    })}
                  </p>
                )}
                {statistics.last7Days && statistics.last7Days.length === 7 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("dashboard.last7Days", {
                        defaultValue: "Last 7 days (today → 6 days ago)",
                      })}
                    </p>
                    <div
                      className="flex items-end gap-0.5 h-8"
                      aria-label={t("dashboard.last7Days", {
                        defaultValue: "Last 7 days (today → 6 days ago)",
                      })}
                    >
                      {statistics.last7Days.map((count, i) => {
                        const max = Math.max(...statistics.last7Days!, 1);
                        const h = max > 0 ? (count / max) * 100 : 0;
                        const dayLabel =
                          i === 0
                            ? t("dashboard.sparklineToday", {
                                count,
                                defaultValue: `Today: ${count} syncs`,
                              })
                            : i === 1
                              ? t("dashboard.sparklineYesterday", {
                                  count,
                                  defaultValue: `Yesterday: ${count} syncs`,
                                })
                              : t("dashboard.sparklineDaysAgo", {
                                  days: i,
                                  count,
                                  defaultValue: `${i} days ago: ${count} syncs`,
                                });
                        return (
                          <div
                            key={i}
                            className="min-w-0 flex-1 rounded-t bg-primary/25 dark:bg-primary/40"
                            style={{ height: `${Math.max(h, 4)}%` }}
                            title={dayLabel}
                            role="img"
                            aria-label={dayLabel}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Breakdown: Media Type + Recent Activity */}
              <button
                type="button"
                onClick={() => setBreakdownOpen((o) => !o)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1 hover:text-foreground w-full text-left"
                aria-expanded={breakdownOpen}
              >
                {breakdownOpen ? (
                  <FaChevronDown className="w-4 h-4" />
                ) : (
                  <FaChevronRight className="w-4 h-4" />
                )}
                {t("dashboard.sections.breakdown", {
                  defaultValue: "Breakdown",
                })}
              </button>
              {breakdownOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4 text-foreground">
                      {t("dashboard.stats.byMediaType", {
                        defaultValue: "By Media Type",
                      })}
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-purple-500/15 p-2 text-purple-700 dark:text-purple-300">
                            <FaTv className="w-5 h-5" />
                          </div>
                          <span className="text-foreground/90">
                            {t("dashboard.stats.episodes", {
                              defaultValue: "Episodes",
                            })}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-foreground">
                          {statistics.byMediaType.episode.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-indigo-500/15 p-2 text-indigo-700 dark:text-indigo-300">
                            <FaListUl className="w-5 h-5" />
                          </div>
                          <span className="text-foreground/90">
                            {t("dashboard.stats.series", {
                              defaultValue: "Series",
                            })}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-foreground">
                          {statistics.byMediaType.series.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-primary/15 p-2 text-primary">
                            <FaFilm className="w-5 h-5" />
                          </div>
                          <span className="text-foreground/90">
                            {t("dashboard.stats.movies", {
                              defaultValue: "Movies",
                            })}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-foreground">
                          {statistics.byMediaType.movie.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4 text-foreground">
                      {t("dashboard.stats.recentActivity", {
                        defaultValue: "Recent Activity",
                      })}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      {t("dashboard.stats.periodsUtc", {
                        defaultValue: "Today / This week / This month use UTC.",
                      })}
                    </p>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-amber-500/15 p-2 text-amber-800 dark:text-amber-300">
                            <FaCalendarDay className="w-5 h-5" />
                          </div>
                          <span className="text-foreground/90">
                            {t("dashboard.stats.today", {
                              defaultValue: "Today",
                            })}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-foreground">
                          {statistics.byPeriod.today.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-emerald-500/15 p-2 text-emerald-700 dark:text-emerald-400">
                            <FaCalendarWeek className="w-5 h-5" />
                          </div>
                          <span className="text-foreground/90">
                            {t("dashboard.stats.thisWeek", {
                              defaultValue: "This Week",
                            })}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-foreground">
                          {statistics.byPeriod.thisWeek.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-primary/15 p-2 text-primary">
                            <FaCalendarAlt className="w-5 h-5" />
                          </div>
                          <span className="text-foreground/90">
                            {t("dashboard.stats.thisMonth", {
                              defaultValue: "This Month",
                            })}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-foreground">
                          {statistics.byPeriod.thisMonth.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* By Source & By Destination */}
              {breakdownOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4 text-foreground">
                      {t("dashboard.stats.bySource", {
                        defaultValue: "By Source",
                      })}
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground/90">Plex</span>
                        <span className="text-2xl font-bold text-foreground">
                          {statistics.bySource.plex.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-foreground/90">Jellyfin</span>
                        <span className="text-2xl font-bold text-foreground">
                          {statistics.bySource.jellyfin.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4 text-foreground">
                      {t("dashboard.stats.byDestination", {
                        defaultValue: "By Destination",
                      })}
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground/90">Trakt</span>
                        <span className="text-2xl font-bold text-foreground">
                          {statistics.byDestination.trakt.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-foreground/90">TVTime</span>
                        <span className="text-2xl font-bold text-foreground">
                          {statistics.byDestination.tvtime.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Activity: Top 3 + Recent syncs */}
              <button
                type="button"
                onClick={() => setActivityOpen((o) => !o)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1 hover:text-foreground w-full text-left"
                aria-expanded={activityOpen}
              >
                {activityOpen ? (
                  <FaChevronDown className="w-4 h-4" />
                ) : (
                  <FaChevronRight className="w-4 h-4" />
                )}
                {t("dashboard.sections.activity", {
                  defaultValue: "Activity",
                })}
              </button>
              {activityOpen && (
                <>
                  {statistics.topThisMonth.length > 0 ? (
                    <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6 mb-8">
                      <h3 className="text-lg font-semibold mb-4 text-foreground">
                        {t("dashboard.topThisMonth", {
                          defaultValue: "Most synced this month",
                        })}
                      </h3>
                      <ul className="space-y-2">
                        {statistics.topThisMonth.map((item, index) => (
                          <li
                            key={`${item.mediaTitle}-${item.mediaType}-${index}`}
                            className="flex items-center justify-between gap-2 py-2 border-b border-border/60 last:border-0"
                          >
                            <span className="text-foreground font-medium truncate">
                              {item.mediaTitle}
                            </span>
                            <span className="text-sm text-muted-foreground flex-shrink-0">
                              {item.mediaType === "episode"
                                ? t("dashboard.topThisMonthEpisodes", {
                                    count: item.count,
                                    defaultValue: "{{count}} episodes",
                                  })
                                : t("dashboard.topThisMonthMovies", {
                                    count: item.count,
                                    defaultValue: "{{count}} watch",
                                  })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6 mb-8">
                      <h3 className="text-lg font-semibold mb-2 text-foreground">
                        {t("dashboard.topThisMonth", {
                          defaultValue: "Most synced this month",
                        })}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("dashboard.empty.topThisMonth", {
                          defaultValue: "No syncs this month yet",
                        })}
                      </p>
                    </div>
                  )}

                  {/* Recent syncs (full width) */}
                  {recentSyncs.length > 0 ? (
                    <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6 mb-8">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-foreground">
                          {t("dashboard.recentSyncs", {
                            defaultValue: "Recent syncs",
                          })}
                        </h3>
                        <Link
                          to="/sync"
                          className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1"
                        >
                          {t("dashboard.viewAll", { defaultValue: "View all" })}
                          <FaExternalLinkAlt className="w-3 h-3" />
                        </Link>
                      </div>
                      <ul className="space-y-2">
                        {recentSyncs.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-2 py-2 border-b border-border/60 last:border-0"
                          >
                            <span className="text-foreground truncate">
                              {formatMediaTitle(item)}
                            </span>
                            <span className="flex items-center gap-2 flex-shrink-0">
                              {item.success ? (
                                <FaCheckCircle className="w-4 h-4 text-green-500" />
                              ) : (
                                <FaTimesCircle className="w-4 h-4 text-red-500" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(item.syncedAt, t)}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6 mb-8">
                      <h3 className="text-lg font-semibold mb-2 text-foreground">
                        {t("dashboard.recentSyncs", {
                          defaultValue: "Recent syncs",
                        })}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("dashboard.empty.recentSyncs", {
                          defaultValue: "No recent syncs to show",
                        })}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Averages */}
              <button
                type="button"
                onClick={() => setAveragesOpen((o) => !o)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1 hover:text-foreground w-full text-left"
                aria-expanded={averagesOpen}
              >
                {averagesOpen ? (
                  <FaChevronDown className="w-4 h-4" />
                ) : (
                  <FaChevronRight className="w-4 h-4" />
                )}
                {t("dashboard.stats.averages", {
                  defaultValue: "Average syncs per day / week / month",
                })}
              </button>
              {averagesOpen && (
                <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6 mb-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg bg-muted/40 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">
                          {t("dashboard.stats.avgPerDay", {
                            defaultValue: "Per Day",
                          })}
                        </span>
                        <FaCalendarDay className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        {statistics.averages.perDay % 1 === 0
                          ? statistics.averages.perDay.toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              }
                            )
                          : statistics.averages.perDay.toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              }
                            )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("dashboard.stats.avgPerDayDesc", {
                          defaultValue: "Avg. from this year",
                        })}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">
                          {t("dashboard.stats.avgPerWeek", {
                            defaultValue: "Per Week",
                          })}
                        </span>
                        <FaCalendarWeek className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        {statistics.averages.perWeek % 1 === 0
                          ? statistics.averages.perWeek.toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              }
                            )
                          : statistics.averages.perWeek.toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              }
                            )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("dashboard.stats.avgPerWeekDesc", {
                          defaultValue: "Projected from yearly avg.",
                        })}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">
                          {t("dashboard.stats.avgPerMonth", {
                            defaultValue: "Per Month",
                          })}
                        </span>
                        <FaCalendarAlt className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        {statistics.averages.perMonth % 1 === 0
                          ? statistics.averages.perMonth.toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              }
                            )
                          : statistics.averages.perMonth.toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              }
                            )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("dashboard.stats.avgPerMonthDesc", {
                          defaultValue: "Projected from yearly avg.",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4 text-foreground">
                  {t("dashboard.quickActions", {
                    defaultValue: "Quick Actions",
                  })}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate("/sync")}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {t("dashboard.viewSyncHistory", {
                      defaultValue: "View Sync History",
                    })}
                  </button>
                  <button
                    onClick={() => navigate("/profile")}
                    className="rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground/90 transition-colors hover:bg-muted/80"
                  >
                    {t("dashboard.profile", {
                      defaultValue: "Profile",
                    })}
                  </button>
                </div>
              </div>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
