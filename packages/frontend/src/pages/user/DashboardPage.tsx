import { SyncHistoryPoster } from "@components/sync/SyncHistoryPoster";
import { Skeleton } from "@components/ui/skeleton";
import { useAuth } from "@contexts/AuthContext";
import {
  getSyncHistory,
  getSyncStatistics,
  type SyncHistoryItem,
  type SyncStatistics,
} from "@services/api/sync";
import { formatMediaTitle, formatRelativeTime } from "@utils/syncHistory";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  FaArrowDown,
  FaArrowUp,
  FaCalendarDay,
  FaCalendarWeek,
  FaCalendarAlt,
  FaChartBar,
  FaCheckCircle,
  FaClock,
  FaDatabase,
  FaExternalLinkAlt,
  FaFilm,
  FaListUl,
  FaMinus,
  FaSync,
  FaTimesCircle,
  FaTv,
} from "react-icons/fa";
import { Link, useNavigate } from "react-router-dom";

const MEDIA_COLORS = {
  episode: "var(--chart-3)",
  series: "var(--chart-2)",
  movie: "var(--chart-1)",
} as const;

function percentOf(part: number, whole: number): number {
  if (whole <= 0) {
    return 0;
  }
  return Math.round((part / whole) * 100);
}

function formatTrendPercent(change: number): string {
  const rounded = Math.round(Math.abs(change) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function monthTrend(thisMonth: number, lastMonth: number) {
  if (lastMonth <= 0) {
    return thisMonth > 0
      ? ({ direction: "new", percent: "0" } as const)
      : ({ direction: "flat", percent: "0" } as const);
  }
  const change = ((thisMonth - lastMonth) / lastMonth) * 100;
  if (Math.abs(change) < 0.05) {
    return { direction: "flat" as const, percent: "0" };
  }
  return {
    direction: (change > 0 ? "up" : "down") as "up" | "down",
    percent: formatTrendPercent(change),
  };
}

function formatMomentDate(dateString: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateString));
}

function formatWeekday(dayIndex: number, locale: string): string {
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return "—";
  }
  // 2024-01-07 is a Sunday in UTC.
  const date = new Date(Date.UTC(2024, 0, 7 + dayIndex));
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

function formatCount(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

function destinationNames(statistics: SyncStatistics): string[] {
  const names: string[] = [];
  if (statistics.byDestination.trakt > 0) {
    names.push("Trakt");
  }
  if (statistics.byDestination.simkl > 0) {
    names.push("Simkl");
  }
  if (statistics.byDestination.tvtime > 0) {
    names.push("TVTime");
  }
  return names;
}

function formatConjunction(items: string[], locale: string): string {
  if (items.length === 0) {
    return "";
  }
  const ListFormat = (
    Intl as typeof Intl & {
      ListFormat: new (
        locales?: string | string[],
        options?: { style?: string; type?: string }
      ) => { format(value: Iterable<string>): string };
    }
  ).ListFormat;
  return new ListFormat(locale, {
    style: "long",
    type: "conjunction",
  }).format(items);
}

function conicGradient(
  segments: Array<{ color: string; value: number }>,
  total: number
): string {
  if (total <= 0) {
    return "var(--muted)";
  }
  let acc = 0;
  const stops: string[] = [];
  for (const segment of segments) {
    if (segment.value <= 0) {
      continue;
    }
    const start = (acc / total) * 100;
    acc += segment.value;
    const end = (acc / total) * 100;
    stops.push(`${segment.color} ${start}% ${end}%`);
  }
  return stops.length > 0
    ? `conic-gradient(${stops.join(", ")})`
    : "var(--muted)";
}

function cardClass(extra = "") {
  return `min-w-0 rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm ${extra}`;
}

const dashboardAlignGrid =
  "grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5";
const dashboardHeroSpan = "sm:col-span-2 md:col-span-3 xl:col-span-2";

function StatCard({
  title,
  value,
  icon: Icon,
  color = "blue",
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  color?: "blue" | "green" | "red" | "purple" | "yellow" | "muted";
  subtitle?: string;
}) {
  const colorClasses = {
    blue: "bg-primary/15 text-primary",
    green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    red: "bg-destructive/15 text-destructive",
    purple: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    yellow: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    muted: "bg-muted text-muted-foreground",
  };

  return (
    <div className={cardClass("flex h-full flex-col p-3 sm:p-4")}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-xs font-medium leading-tight text-muted-foreground sm:text-sm">
          {title}
        </h3>
        <div
          className={`shrink-0 rounded-lg p-1.5 sm:p-2 ${colorClasses[color]}`}
        >
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
      </div>
      <p className="text-xl font-bold leading-tight tracking-tight break-words text-foreground sm:text-2xl">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className={cardClass("flex h-full flex-col p-3 sm:p-4")}>
      <div className="mb-2 flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="mt-2 h-8 w-16" />
    </div>
  );
}

function PercentageBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

function MomentCard({
  label,
  title,
  subtitle,
  item,
}: {
  label: string;
  title: string;
  subtitle?: string;
  item?: SyncHistoryItem;
}) {
  return (
    <div className={cardClass("flex h-full items-center gap-3 p-3")}>
      {item ? (
        <SyncHistoryPoster item={item} size="compact" />
      ) : (
        <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded border border-border/60 bg-muted text-muted-foreground">
          <FaDatabase className="h-4 w-4 opacity-50" aria-hidden />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-semibold text-foreground" title={title}>
          {title}
        </p>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function activityDayLabel(
  daysAgo: number,
  count: number,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  if (daysAgo === 0) {
    return t("dashboard.sparklineToday", {
      count,
      defaultValue_one: "Today: {{count}} sync",
      defaultValue_other: "Today: {{count}} syncs",
    });
  }
  if (daysAgo === 1) {
    return t("dashboard.sparklineYesterday", {
      count,
      defaultValue_one: "Yesterday: {{count}} sync",
      defaultValue_other: "Yesterday: {{count}} syncs",
    });
  }
  return t("dashboard.sparklineDaysAgo", {
    days: daysAgo,
    count,
    defaultValue_one: "{{days}} days ago: {{count}} sync",
    defaultValue_other: "{{days}} days ago: {{count}} syncs",
  });
}

function ActivityRhythmChart({ last7Days }: { last7Days: number[] }) {
  const { t, i18n } = useTranslation();
  const max = Math.max(...last7Days, 1);
  const chronological = last7Days
    .map((count, daysAgo) => ({ count, daysAgo }))
    .reverse();

  return (
    <div>
      <div
        className="flex min-w-0 items-end gap-1 sm:gap-2.5"
        aria-label={t("dashboard.last7Days", {
          defaultValue: "Last 7 days",
        })}
      >
        {chronological.map(({ count, daysAgo }) => {
          const intensity = count / max;
          const heightPct = count <= 0 ? 0 : Math.max(14, intensity * 100);
          const day = new Date();
          day.setUTCHours(0, 0, 0, 0);
          day.setUTCDate(day.getUTCDate() - daysAgo);
          const weekday = day.toLocaleDateString(i18n.language, {
            weekday: "short",
            timeZone: "UTC",
          });
          const label = activityDayLabel(daysAgo, count, t);
          const isToday = daysAgo === 0;

          return (
            <div
              key={daysAgo}
              className="group relative flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <div
                className="relative h-24 w-full sm:h-32"
                title={label}
                role="img"
                aria-label={label}
              >
                <div
                  className={`absolute bottom-0 left-1/2 h-full w-2.5 -translate-x-1/2 rounded-full sm:w-3.5 ${
                    isToday ? "bg-primary/15" : "bg-muted/70"
                  }`}
                />
                {count > 0 && (
                  <div
                    className="absolute inset-x-0 bottom-0 flex flex-col items-center"
                    style={{ height: `${heightPct}%` }}
                  >
                    <div
                      className={`z-10 size-2.5 shrink-0 rounded-full bg-primary shadow-sm sm:size-3 ${
                        isToday
                          ? "ring-1 ring-primary/50 ring-offset-1 ring-offset-card sm:ring-2 sm:ring-offset-2"
                          : ""
                      }`}
                    />
                    <div
                      className="-mt-1 w-2.5 flex-1 rounded-full bg-primary sm:w-3.5"
                      style={{ opacity: 0.45 + intensity * 0.55 }}
                    />
                  </div>
                )}
                <span
                  className="pointer-events-none absolute -top-0.5 left-1/2 z-10 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  aria-hidden
                >
                  {count}
                </span>
              </div>
              <span
                className={`w-full truncate text-center text-[10px] sm:text-xs ${
                  isToday
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {weekday}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatAverage(value: number, locale: string): string {
  return value % 1 === 0
    ? value.toLocaleString(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    : value.toLocaleString(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
}

function AveragePaceCard({
  title,
  average,
  actual,
  actualLabel,
  icon: Icon,
  color,
}: {
  title: string;
  average: number;
  actual: number;
  actualLabel: string;
  icon: ComponentType<{ className?: string }>;
  color: "blue" | "purple" | "green";
}) {
  const { t, i18n } = useTranslation();
  const colorClasses = {
    blue: "bg-primary/15 text-primary",
    purple: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  };
  const ratio = average > 0 ? actual / average : actual > 0 ? 1 : 0;
  const fillPct = Math.min(100, Math.max(0, ratio * 100));
  const deltaPct = average > 0 ? ((actual - average) / average) * 100 : 0;
  const showDelta = average > 0 && Math.abs(deltaPct) >= 5;
  const ahead = deltaPct > 0;

  return (
    <div className={cardClass("flex h-full flex-col p-3 sm:p-4")}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-xs font-medium leading-tight text-muted-foreground sm:text-sm">
          {title}
        </h3>
        <div
          className={`shrink-0 rounded-lg p-1.5 sm:p-2 ${colorClasses[color]}`}
        >
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
      </div>
      <p className="text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
        {formatAverage(average, i18n.language)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("dashboard.stats.avgFromThisYear", {
          defaultValue: "Yearly average",
        })}
      </p>
      <div className="mt-auto pt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-muted-foreground">{actualLabel}</span>
          {showDelta && (
            <span
              className={`shrink-0 tabular-nums ${
                ahead
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground"
              }`}
            >
              {ahead ? "+" : "−"}
              {formatTrendPercent(deltaPct)}%
            </span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${
              ahead ? "bg-emerald-500" : "bg-primary"
            }`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [statistics, setStatistics] = useState<SyncStatistics | null>(null);
  const [recentSyncs, setRecentSyncs] = useState<SyncHistoryItem[]>([]);
  const [firstSync, setFirstSync] = useState<SyncHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataFetchedAt, setDataFetchedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
        const firstHistoryRequest = getSyncHistory(
          1,
          1,
          undefined,
          "syncedAt",
          "ASC"
        ).then(
          (res) => ({ ok: true as const, data: res.data[0] ?? null }),
          () => ({ ok: false as const })
        );
        const [stats, historyRes] = await Promise.all([
          getSyncStatistics(),
          getSyncHistory(1, 5, undefined, "syncedAt", "DESC"),
        ]);
        setStatistics(stats);
        setRecentSyncs(historyRes.data);
        setDataFetchedAt(new Date());
        const firstResult = await firstHistoryRequest;
        if (firstResult.ok) {
          setFirstSync(firstResult.data);
        }
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
      loadDashboard();
    }
  }, [user, loadDashboard]);

  const lastSync = recentSyncs[0];
  const showFirstSync = Boolean(firstSync && firstSync.id !== lastSync?.id);
  const topThisMonth = statistics?.topThisMonth[0];
  const topThisMonthMatch = topThisMonth
    ? recentSyncs.find(
        (item) =>
          item.mediaTitle === topThisMonth.mediaTitle &&
          item.mediaType === topThisMonth.mediaType
      )
    : undefined;
  const destinations = statistics ? destinationNames(statistics) : [];
  const locale = i18n.language;
  const destinationList = formatConjunction(destinations, locale);
  const trend = statistics
    ? monthTrend(statistics.byPeriod.thisMonth, statistics.byPeriod.lastMonth)
    : null;
  const mediaTotal = statistics
    ? statistics.byMediaType.episode +
      statistics.byMediaType.series +
      statistics.byMediaType.movie
    : 0;
  const sourceTotal = statistics
    ? statistics.bySource.plex + statistics.bySource.jellyfin
    : 0;
  const destinationTotal = statistics
    ? statistics.byDestination.trakt +
      statistics.byDestination.simkl +
      statistics.byDestination.tvtime
    : 0;

  const healthBadge =
    statistics && statistics.total > 0 ? (
      <span
        className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-medium ${
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
    ) : null;

  return (
    <div className="container mx-auto min-w-0 px-4 py-4 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {t("dashboard.title", { defaultValue: "Dashboard" })}
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end sm:gap-3">
          {healthBadge}
          {statistics?.lastSyncedAt && (
            <p
              className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
              title={new Date(statistics.lastSyncedAt).toLocaleString(locale)}
            >
              <FaClock className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {t("dashboard.lastSynced", {
                  defaultValue: "Last synced",
                })}{" "}
                {formatRelativeTime(statistics.lastSyncedAt, t)}
              </span>
            </p>
          )}
          {dataFetchedAt && statistics && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="hidden sm:inline"
                title={dataFetchedAt.toLocaleString(locale)}
              >
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
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div>
          <div>
            <div className={`mb-3 grid-cols-1 ${dashboardAlignGrid}`}>
              <div className={cardClass(`p-4 sm:p-6 ${dashboardHeroSpan}`)}>
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="mt-3 h-4 w-1/2" />
              </div>
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
            <div
              className={`mb-6 grid-cols-2 ${dashboardAlignGrid} [&>:last-child]:col-span-2 md:[&>:last-child]:col-span-1`}
            >
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </div>
          </div>
        </div>
      ) : error ? (
        <div className={cardClass("p-4 sm:p-6")}>
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : statistics ? (
        statistics.total === 0 ? (
          <>
            <div className={cardClass("mb-6 p-6 text-center sm:p-8")}>
              <div className="mx-auto max-w-md">
                <FaDatabase className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-base font-semibold text-foreground sm:text-lg">
                  {t("dashboard.empty.title", {
                    defaultValue: "No sync data yet",
                  })}
                </h3>
                <p className="mb-6 text-muted-foreground">
                  {t("dashboard.empty.description", {
                    defaultValue:
                      "Watch something on Plex or Jellyfin and it will appear here. Make sure webhooks are configured and your Trakt or Simkl account is linked in your profile.",
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
            <div className={cardClass("p-4 sm:p-6")}>
              <h3 className="mb-4 text-base font-semibold text-foreground sm:text-lg">
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
            <div className={`mb-3 grid-cols-1 ${dashboardAlignGrid}`}>
              <div
                className={cardClass(
                  `flex flex-col justify-center p-4 sm:p-6 ${dashboardHeroSpan}`
                )}
              >
                <h2 className="text-2xl font-bold tracking-tight text-balance text-foreground sm:text-3xl lg:text-4xl">
                  {t("dashboard.hero.title", {
                    count: statistics.total,
                    defaultValue_one: "You've synced {{count}} title.",
                    defaultValue_other: "You've synced {{count}} titles.",
                  })}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                  {destinations.length > 0
                    ? t("dashboard.hero.subtitleWithDestinations", {
                        count: statistics.successful,
                        destinations: destinationList,
                        defaultValue_one:
                          "That's {{count}} successful sync to {{destinations}}.",
                        defaultValue_other:
                          "That's {{count}} successful syncs to {{destinations}}.",
                      })
                    : t("dashboard.hero.subtitle", {
                        count: statistics.successful,
                        defaultValue_one: "That's {{count}} successful sync.",
                        defaultValue_other:
                          "That's {{count}} successful syncs.",
                      })}
                </p>
              </div>
              {lastSync ? (
                <MomentCard
                  label={t("dashboard.moments.lastSync", {
                    defaultValue: "Last sync",
                  })}
                  title={formatMediaTitle(lastSync)}
                  subtitle={formatRelativeTime(lastSync.syncedAt, t)}
                  item={lastSync}
                />
              ) : statistics.lastSyncedAt ? (
                <MomentCard
                  label={t("dashboard.moments.lastSync", {
                    defaultValue: "Last sync",
                  })}
                  title={formatRelativeTime(statistics.lastSyncedAt, t)}
                  subtitle={formatMomentDate(statistics.lastSyncedAt, locale)}
                />
              ) : null}
              {showFirstSync && firstSync && (
                <MomentCard
                  label={t("dashboard.moments.firstSync", {
                    defaultValue: "First sync",
                  })}
                  title={formatMediaTitle(firstSync)}
                  subtitle={formatMomentDate(firstSync.syncedAt, locale)}
                  item={firstSync}
                />
              )}
              {topThisMonth && (
                <MomentCard
                  label={t("dashboard.moments.topThisMonth", {
                    defaultValue: "Most synced",
                  })}
                  title={topThisMonth.mediaTitle}
                  subtitle={
                    topThisMonth.mediaType === "episode"
                      ? t("dashboard.topThisMonthEpisodes", {
                          count: topThisMonth.count,
                          defaultValue_one: "{{count}} episode",
                          defaultValue_other: "{{count}} episodes",
                        })
                      : t("dashboard.topThisMonthMovies", {
                          count: topThisMonth.count,
                          defaultValue_one: "{{count}} watch",
                          defaultValue_other: "{{count}} watches",
                        })
                  }
                  item={topThisMonthMatch}
                />
              )}
            </div>
            <div
              className={`mb-6 grid-cols-2 ${dashboardAlignGrid} [&>:last-child]:col-span-2 md:[&>:last-child]:col-span-1`}
            >
              <StatCard
                title={t("dashboard.stats.successful", {
                  defaultValue: "Successful",
                })}
                value={`${formatCount(statistics.successful, locale)} / ${formatCount(statistics.total, locale)}`}
                icon={FaCheckCircle}
                color="purple"
              />
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
              />
              <div className={cardClass("flex h-full flex-col p-3 sm:p-4")}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="min-w-0 text-xs font-medium leading-tight text-muted-foreground sm:text-sm">
                    {t("dashboard.stats.failed", { defaultValue: "Failed" })}
                  </h3>
                  <div className="shrink-0 rounded-lg bg-red-100 p-1.5 text-red-600 sm:p-2 dark:bg-red-900/30 dark:text-red-400">
                    <FaTimesCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                </div>
                <p className="text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
                  {formatCount(statistics.failed, locale)}
                </p>
                {statistics.failed > 0 && (
                  <Link
                    to="/sync?filter=failed"
                    className="mt-1 inline-block text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    {t("dashboard.viewFailedSyncs", {
                      defaultValue: "View failed syncs",
                    })}
                  </Link>
                )}
              </div>
              <StatCard
                title={t("dashboard.stats.mostActiveDay", {
                  defaultValue: "Most Active Day",
                })}
                value={
                  statistics.peakDay != null
                    ? formatWeekday(statistics.peakDay, locale)
                    : "—"
                }
                icon={FaCalendarDay}
                color="green"
              />
              {trend && (
                <StatCard
                  title={t("dashboard.stats.activityTrend", {
                    defaultValue: "Activity Trend",
                  })}
                  value={
                    trend.direction === "up"
                      ? t("dashboard.stats.trendUpShort", {
                          percent: trend.percent,
                          defaultValue: "Up {{percent}}%",
                        })
                      : trend.direction === "down"
                        ? t("dashboard.stats.trendDownShort", {
                            percent: trend.percent,
                            defaultValue: "Down {{percent}}%",
                          })
                        : trend.direction === "new"
                          ? t("dashboard.stats.trendNew", {
                              defaultValue: "New this month",
                            })
                          : t("dashboard.stats.trendFlat", {
                              defaultValue: "No change",
                            })
                  }
                  icon={
                    trend.direction === "up"
                      ? FaArrowUp
                      : trend.direction === "down"
                        ? FaArrowDown
                        : FaMinus
                  }
                  color={
                    trend.direction === "up"
                      ? "green"
                      : trend.direction === "down"
                        ? "red"
                        : "muted"
                  }
                  subtitle={t("dashboard.stats.vsLastMonth", {
                    defaultValue: "vs last month",
                  })}
                />
              )}
            </div>

            <div
              className="mb-6 space-y-1 px-1 text-sm"
              role="region"
              aria-label={t("dashboard.summary", { defaultValue: "Summary" })}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium text-muted-foreground">
                  {t("dashboard.stats.last30Days", {
                    defaultValue: "Last 30 days",
                  })}
                </span>
                <span className="text-foreground/90">
                  {formatCount(statistics.last30Days.total, locale)}{" "}
                  {t("dashboard.stats.synced", { defaultValue: "synced" })}
                  {statistics.last30Days.total > 0 && (
                    <>
                      {" · "}
                      <span className="text-green-600 dark:text-green-400">
                        {formatCount(statistics.last30Days.successful, locale)}{" "}
                        {t("dashboard.stats.ok", { defaultValue: "ok" })}
                      </span>
                      {statistics.last30Days.failed > 0 && (
                        <>
                          {" · "}
                          <span className="text-red-600 dark:text-red-400">
                            {formatCount(statistics.last30Days.failed, locale)}{" "}
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
                    className="font-medium text-primary hover:text-primary/80"
                  >
                    {t("dashboard.viewSyncHistory", {
                      defaultValue: "View Sync History",
                    })}
                  </Link>
                )}
              </div>
              {statistics.lastFailure && (
                <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                  <span className="shrink-0 text-muted-foreground">
                    {t("dashboard.lastFailure", {
                      defaultValue: "Last failure",
                    })}
                  </span>
                  <Link
                    to="/sync?filter=failed"
                    className="min-w-0 truncate font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    {statistics.lastFailure.mediaTitle}
                  </Link>
                  <span className="shrink-0 text-muted-foreground">
                    · {formatRelativeTime(statistics.lastFailure.syncedAt, t)}
                  </span>
                </div>
              )}
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className={cardClass("overflow-x-clip p-4 sm:p-6")}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FaChartBar className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <h3 className="text-base font-semibold text-foreground sm:text-lg">
                        {t("dashboard.activityRhythm", {
                          defaultValue: "Activity",
                        })}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("dashboard.stats.periodSummary", {
                        today: formatCount(statistics.byPeriod.today, locale),
                        thisWeek: formatCount(
                          statistics.byPeriod.thisWeek,
                          locale
                        ),
                        thisMonth: formatCount(
                          statistics.byPeriod.thisMonth,
                          locale
                        ),
                        defaultValue:
                          "{{today}} today · {{thisWeek}} this week · {{thisMonth}} this month",
                      })}
                    </p>
                  </div>
                  <div
                    className="flex min-w-0 flex-wrap items-center gap-1 pt-1 text-[10px] text-muted-foreground sm:text-[11px]"
                    aria-hidden
                  >
                    <span>
                      {t("dashboard.activity.low", { defaultValue: "Low" })}
                    </span>
                    {[0.25, 0.45, 0.7, 1].map((level) => (
                      <span
                        key={level}
                        className="rounded-full bg-primary"
                        style={{
                          opacity: level,
                          width: `${6 + level * 6}px`,
                          height: `${6 + level * 6}px`,
                        }}
                      />
                    ))}
                    <span>
                      {t("dashboard.activity.high", { defaultValue: "High" })}
                    </span>
                  </div>
                </div>
                {statistics.last7Days && statistics.last7Days.length === 7 ? (
                  <ActivityRhythmChart last7Days={statistics.last7Days} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.empty.recentSyncs", {
                      defaultValue: "No recent syncs to show",
                    })}
                  </p>
                )}
              </div>

              <div className={cardClass("p-4 sm:p-6")}>
                <h3 className="mb-4 text-base font-semibold text-foreground sm:text-lg">
                  {t("dashboard.stats.byMediaType", {
                    defaultValue: "By Media Type",
                  })}
                </h3>
                <div className="flex flex-col items-center gap-6 lg:flex-row">
                  <div
                    className="relative h-32 w-32 shrink-0 rounded-full sm:h-36 sm:w-36"
                    style={{
                      background: conicGradient(
                        [
                          {
                            color: MEDIA_COLORS.episode,
                            value: statistics.byMediaType.episode,
                          },
                          {
                            color: MEDIA_COLORS.series,
                            value: statistics.byMediaType.series,
                          },
                          {
                            color: MEDIA_COLORS.movie,
                            value: statistics.byMediaType.movie,
                          },
                        ],
                        mediaTotal
                      ),
                    }}
                    aria-hidden
                  >
                    <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-card text-center">
                      <span className="text-lg font-bold text-foreground">
                        {formatCount(statistics.total, locale)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {t("dashboard.stats.mediaMixTotal", {
                          defaultValue: "total",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0 w-full flex-1 space-y-3">
                    {(
                      [
                        {
                          key: "episode" as const,
                          icon: FaTv,
                          label: t("dashboard.stats.episodes", {
                            defaultValue: "Episodes",
                          }),
                          value: statistics.byMediaType.episode,
                        },
                        {
                          key: "series" as const,
                          icon: FaListUl,
                          label: t("dashboard.stats.series", {
                            defaultValue: "Series",
                          }),
                          value: statistics.byMediaType.series,
                        },
                        {
                          key: "movie" as const,
                          icon: FaFilm,
                          label: t("dashboard.stats.movies", {
                            defaultValue: "Movies",
                          }),
                          value: statistics.byMediaType.movie,
                        },
                      ] as const
                    ).map((row) => {
                      const Icon = row.icon;
                      const percent = percentOf(row.value, mediaTotal);
                      return (
                        <div key={row.key} className="min-w-0">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: MEDIA_COLORS[row.key],
                                }}
                              />
                              <Icon className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
                              <span className="truncate text-sm text-foreground/90">
                                {row.label}
                              </span>
                            </div>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-sm">
                              {percent}% · {formatCount(row.value, locale)}
                            </span>
                          </div>
                          <PercentageBar
                            percent={percent}
                            color={MEDIA_COLORS[row.key]}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className={cardClass("p-4 sm:p-6")}>
                <h3 className="mb-4 text-base font-semibold text-foreground sm:text-lg">
                  {t("dashboard.stats.bySource", {
                    defaultValue: "By Source",
                  })}
                </h3>
                <div className="space-y-4">
                  {(
                    [
                      ["Plex", statistics.bySource.plex, "var(--chart-1)"],
                      [
                        "Jellyfin",
                        statistics.bySource.jellyfin,
                        "var(--chart-4)",
                      ],
                    ] as const
                  ).map(([label, value, color]) => (
                    <div key={label} className="min-w-0">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-foreground/90">
                          {label}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-sm">
                          {percentOf(value, sourceTotal)}% ·{" "}
                          {formatCount(value, locale)}
                        </span>
                      </div>
                      <PercentageBar
                        percent={percentOf(value, sourceTotal)}
                        color={color}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className={cardClass("p-4 sm:p-6")}>
                <h3 className="mb-4 text-base font-semibold text-foreground sm:text-lg">
                  {t("dashboard.stats.byDestination", {
                    defaultValue: "By Destination",
                  })}
                </h3>
                <div className="space-y-4">
                  {(
                    [
                      [
                        "Trakt",
                        statistics.byDestination.trakt,
                        "var(--chart-1)",
                      ],
                      [
                        "TVTime",
                        statistics.byDestination.tvtime,
                        "var(--chart-5)",
                      ],
                      [
                        "Simkl",
                        statistics.byDestination.simkl,
                        "var(--chart-2)",
                      ],
                    ] as const
                  ).map(([label, value, color]) => (
                    <div key={label} className="min-w-0">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-foreground/90">
                          {label}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-sm">
                          {percentOf(value, destinationTotal)}% ·{" "}
                          {formatCount(value, locale)}
                        </span>
                      </div>
                      <PercentageBar
                        percent={percentOf(value, destinationTotal)}
                        color={color}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {statistics.topThisMonth.length > 0 ? (
                <div className={cardClass("p-4 sm:p-6")}>
                  <h3 className="mb-4 text-base font-semibold text-foreground sm:text-lg">
                    {t("dashboard.topThisMonth", {
                      defaultValue: "Most synced this month",
                    })}
                  </h3>
                  <ul className="space-y-2">
                    {statistics.topThisMonth.map((item, index) => (
                      <li
                        key={`${item.mediaTitle}-${item.mediaType}-${index}`}
                        className="flex min-w-0 items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0"
                      >
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {item.mediaTitle}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground sm:text-sm">
                          {item.mediaType === "episode"
                            ? t("dashboard.topThisMonthEpisodes", {
                                count: item.count,
                                defaultValue_one: "{{count}} episode",
                                defaultValue_other: "{{count}} episodes",
                              })
                            : t("dashboard.topThisMonthMovies", {
                                count: item.count,
                                defaultValue_one: "{{count}} watch",
                                defaultValue_other: "{{count}} watches",
                              })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className={cardClass("p-4 sm:p-6")}>
                  <h3 className="mb-2 text-base font-semibold text-foreground sm:text-lg">
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

              {recentSyncs.length > 0 ? (
                <div className={cardClass("p-4 sm:p-6")}>
                  <div className="mb-4 flex min-w-0 items-center justify-between gap-2">
                    <h3 className="min-w-0 truncate text-base font-semibold text-foreground sm:text-lg">
                      {t("dashboard.recentSyncs", {
                        defaultValue: "Recent syncs",
                      })}
                    </h3>
                    <Link
                      to="/sync"
                      className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
                    >
                      {t("dashboard.viewAll", { defaultValue: "View all" })}
                      <FaExternalLinkAlt className="h-3 w-3" />
                    </Link>
                  </div>
                  <ul className="space-y-2">
                    {recentSyncs.map((item) => (
                      <li
                        key={item.id}
                        className="flex min-w-0 items-center gap-3 border-b border-border/60 py-2 last:border-0"
                      >
                        <SyncHistoryPoster item={item} size="compact" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-foreground">
                            {formatMediaTitle(item)}
                          </p>
                          <p className="text-xs text-muted-foreground sm:hidden">
                            {formatRelativeTime(item.syncedAt, t)}
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-2">
                          {item.success ? (
                            <FaCheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <FaTimesCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {formatRelativeTime(item.syncedAt, t)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className={cardClass("p-4 sm:p-6")}>
                  <h3 className="mb-2 text-base font-semibold text-foreground sm:text-lg">
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
            </div>

            <div className="mb-6">
              <h3 className="mb-3 text-base font-semibold text-foreground sm:text-lg">
                {t("dashboard.stats.averages", {
                  defaultValue: "Averages",
                })}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <AveragePaceCard
                  title={t("dashboard.stats.avgPerDay", {
                    defaultValue: "Per Day",
                  })}
                  average={statistics.averages.perDay}
                  actual={statistics.byPeriod.today}
                  actualLabel={t("dashboard.stats.avgVsToday", {
                    count: statistics.byPeriod.today,
                    defaultValue_one: "{{count}} today",
                    defaultValue_other: "{{count}} today",
                  })}
                  icon={FaCalendarDay}
                  color="blue"
                />
                <AveragePaceCard
                  title={t("dashboard.stats.avgPerWeek", {
                    defaultValue: "Per Week",
                  })}
                  average={statistics.averages.perWeek}
                  actual={statistics.byPeriod.thisWeek}
                  actualLabel={t("dashboard.stats.avgVsWeek", {
                    count: statistics.byPeriod.thisWeek,
                    defaultValue_one: "{{count}} this week",
                    defaultValue_other: "{{count}} this week",
                  })}
                  icon={FaCalendarWeek}
                  color="purple"
                />
                <AveragePaceCard
                  title={t("dashboard.stats.avgPerMonth", {
                    defaultValue: "Per Month",
                  })}
                  average={statistics.averages.perMonth}
                  actual={statistics.byPeriod.thisMonth}
                  actualLabel={t("dashboard.stats.avgVsMonth", {
                    count: statistics.byPeriod.thisMonth,
                    defaultValue_one: "{{count}} this month",
                    defaultValue_other: "{{count}} this month",
                  })}
                  icon={FaCalendarAlt}
                  color="green"
                />
              </div>
            </div>

            <div className={cardClass("p-4 sm:p-6")}>
              <h3 className="mb-4 text-base font-semibold text-foreground sm:text-lg">
                {t("dashboard.quickActions", {
                  defaultValue: "Quick Actions",
                })}
              </h3>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
  );
}
