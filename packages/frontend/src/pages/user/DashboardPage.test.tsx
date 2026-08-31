import { useAuth } from "@contexts/AuthContext";
import type { SyncHistoryItem, SyncHistoryResponse } from "@services/api";
import {
  getSyncHistory,
  getSyncStatistics,
  type SyncStatistics,
} from "@services/api/sync";
import { renderWithProviders } from "@test/render";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../i18n/config";

import { DashboardPage } from "./DashboardPage";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@services/api/sync", () => ({
  getSyncStatistics: vi.fn(),
  getSyncHistory: vi.fn(),
}));

function CurrentPath() {
  const { pathname } = useLocation();
  return <div data-testid="current-path">{pathname}</div>;
}

function statisticsFixture() {
  return {
    total: 12,
    successful: 10,
    failed: 2,
    successRate: 83,
    byMediaType: { episode: 8, movie: 4, series: 0 },
    bySource: { plex: 10, jellyfin: 2 },
    byDestination: { trakt: 5, tvtime: 4, simkl: 3, bingers: 0 },
    byPeriod: { today: 1, thisWeek: 4, thisMonth: 12, lastMonth: 8 },
    topThisMonth: [],
    last30Days: { total: 12, successful: 10, failed: 2 },
    averages: { perDay: 0.4, perWeek: 3, perMonth: 12 },
    lastSyncedAt: "2026-06-01T12:00:00.000Z",
    last7Days: [1, 2, 0, 1, 3, 2, 3],
    peakDay: 3,
    lastFailure: null,
  };
}

function emptyStatisticsFixture(): SyncStatistics {
  return {
    total: 0,
    successful: 0,
    failed: 0,
    successRate: 0,
    byMediaType: { episode: 0, movie: 0, series: 0 },
    bySource: { plex: 0, jellyfin: 0 },
    byDestination: { trakt: 0, simkl: 0, tvtime: 0, bingers: 0 },
    byPeriod: { today: 0, thisWeek: 0, thisMonth: 0, lastMonth: 0 },
    topThisMonth: [],
    last30Days: { total: 0, successful: 0, failed: 0 },
    averages: { perDay: 0, perWeek: 0, perMonth: 0 },
    lastSyncedAt: null,
    last7Days: [0, 0, 0, 0, 0, 0, 0],
    peakDay: null,
    lastFailure: null,
  };
}

function historyItem(
  overrides: Partial<SyncHistoryItem> = {}
): SyncHistoryItem {
  return {
    id: "sync-1",
    userId: "user-1",
    username: "alice",
    mediaType: "movie",
    mediaTitle: "Arrival",
    success: true,
    syncedAt: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

function historyResponse(data: SyncHistoryItem[]): SyncHistoryResponse {
  return {
    data,
    pagination: {
      page: 1,
      pageSize: 5,
      total: data.length,
      totalPages: data.length ? 1 : 0,
    },
  };
}

describe("DashboardPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-1", username: "alice", isAdmin: false },
      loading: false,
      logout: vi.fn(),
      checkAuth: vi.fn(),
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: false,
    });
    vi.mocked(getSyncStatistics).mockResolvedValue(statisticsFixture());
    vi.mocked(getSyncHistory).mockResolvedValue(historyResponse([]));
    if (i18n.language !== "en") {
      await i18n.changeLanguage("en");
    }
  });

  it("renders destination statistics including Simkl", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });

    const heading = await screen.findByRole("heading", {
      name: "By Destination",
    });
    const card = heading.parentElement;
    expect(card).not.toBeNull();
    const simklLabel = within(card!).getByText("Simkl");
    expect(simklLabel).toBeInTheDocument();
    expect(simklLabel.nextElementSibling).toHaveTextContent(/·\s*3\b/);
  });

  it("renders a hero summary of synced titles", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText("You've synced 12 titles.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /that's 10 successful syncs to trakt, simkl, and tvtime/i
      )
    ).toBeInTheDocument();
  });

  it("includes Bingers in hero destination list when synced", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      byDestination: { trakt: 0, tvtime: 0, simkl: 0, bingers: 3 },
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText(/that's 10 successful syncs to bingers/i)
    ).toBeInTheDocument();
  });

  it("renders compact trend and peak-day metrics", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText("Wednesday")).toBeInTheDocument();
    expect(screen.getByText("Up 50%")).toBeInTheDocument();
    expect(screen.getByText("10 / 12")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Today: 1 sync" })
    ).toBeInTheDocument();
    expect(screen.getByText("Per Day")).toBeInTheDocument();
    expect(screen.getByText("1 today")).toBeInTheDocument();
  });

  it("localizes decimal trend and pace deltas", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      byPeriod: { today: 1, thisWeek: 4, thisMonth: 13, lastMonth: 8 },
      averages: { perDay: 0.3, perWeek: 3, perMonth: 12 },
    });
    await i18n.changeLanguage("de");

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText(/\b62,5%/)).toBeInTheDocument();
    expect(screen.getByText("+233,3%")).toBeInTheDocument();
  });

  it("labels series entries separately from movies in top-this-month", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      topThisMonth: [
        { mediaTitle: "The Expanse", mediaType: "series", count: 3 },
        { mediaTitle: "Arrival", mediaType: "movie", count: 2 },
        { mediaTitle: "Pilot", mediaType: "episode", count: 1 },
      ],
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findAllByText("The Expanse")).not.toHaveLength(0);
    expect(screen.getAllByText("3 series").length).toBeGreaterThan(0);
    expect(screen.getByText("2 watches")).toBeInTheDocument();
    expect(screen.getByText("1 episode")).toBeInTheDocument();
  });

  it("centers the media mix chart on mediaTotal", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      total: 99,
      byMediaType: { episode: 8, movie: 4, series: 0 },
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    const totalLabel = await screen.findByText("total");
    expect(totalLabel.previousElementSibling).toHaveTextContent("12");
    expect(totalLabel.previousElementSibling).not.toHaveTextContent("99");
  });

  it("retries loading after an initial failure", async () => {
    const user = userEvent.setup();
    vi.mocked(getSyncStatistics)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(statisticsFixture());

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText("network down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(
      await screen.findByText("You've synced 12 titles.")
    ).toBeInTheDocument();
  });

  it("does not reload when the language changes", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText("You've synced 12 titles.")
    ).toBeInTheDocument();
    expect(getSyncStatistics).toHaveBeenCalledTimes(1);

    await act(async () => {
      await i18n.changeLanguage("de");
    });

    expect(getSyncStatistics).toHaveBeenCalledTimes(1);
  });

  it("renders first and last sync moment cards", async () => {
    vi.mocked(getSyncHistory).mockImplementation(
      async (_page, _size, _filters, _sortBy, sortOrder) => {
        if (sortOrder === "ASC") {
          return historyResponse([
            historyItem({
              id: "first",
              mediaTitle: "The First Watch",
              syncedAt: "2025-01-15T12:00:00.000Z",
            }),
          ]);
        }
        return historyResponse([
          historyItem({
            id: "last",
            mediaTitle: "The Latest Watch",
            syncedAt: "2026-06-01T12:00:00.000Z",
          }),
        ]);
      }
    );

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText("Last sync")).toBeInTheDocument();
    expect(await screen.findByText("First sync")).toBeInTheDocument();
    expect(screen.getAllByText("The Latest Watch").length).toBeGreaterThan(0);
    expect(await screen.findByText("The First Watch")).toBeInTheDocument();
  });

  it("still renders when the earliest-sync request fails", async () => {
    vi.mocked(getSyncHistory).mockImplementation(
      async (_page, _size, _filters, _sortBy, sortOrder) => {
        if (sortOrder === "ASC") {
          throw new Error("oldest history unavailable");
        }
        return historyResponse([]);
      }
    );

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText("You've synced 12 titles.")
    ).toBeInTheDocument();
    expect(screen.queryByText("First sync")).not.toBeInTheDocument();
  });

  it("renders the dashboard while the earliest-sync request is pending", async () => {
    vi.mocked(getSyncHistory).mockImplementation(
      async (_page, _size, _filters, _sortBy, sortOrder) => {
        if (sortOrder === "ASC") {
          return new Promise(() => undefined);
        }
        return historyResponse([]);
      }
    );

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText("You've synced 12 titles.")
    ).toBeInTheDocument();
    expect(screen.queryByText("First sync")).not.toBeInTheDocument();
  });

  it("ignores earliest-sync results after the signed-in user changes", async () => {
    let resolvePreviousFirst!: (value: SyncHistoryResponse) => void;
    const previousFirst = new Promise<SyncHistoryResponse>((resolve) => {
      resolvePreviousFirst = resolve;
    });
    let currentUserId = "user-1";

    vi.mocked(getSyncHistory).mockImplementation(
      async (_page, _size, _filters, _sortBy, sortOrder) => {
        if (sortOrder === "ASC") {
          if (currentUserId === "user-1") {
            return previousFirst;
          }
          return historyResponse([
            historyItem({
              id: "current-first",
              mediaTitle: "Current User First",
              syncedAt: "2025-02-01T12:00:00.000Z",
            }),
          ]);
        }
        return historyResponse([]);
      }
    );

    const { rerender } = renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText("You've synced 12 titles.")
    ).toBeInTheDocument();

    currentUserId = "user-2";
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-2", username: "bob", isAdmin: false },
      loading: false,
      logout: vi.fn(),
      checkAuth: vi.fn(),
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: false,
    });
    rerender(<DashboardPage />);

    expect(await screen.findByText("Current User First")).toBeInTheDocument();

    resolvePreviousFirst(
      historyResponse([
        historyItem({
          id: "previous-first",
          mediaTitle: "Previous User First",
          syncedAt: "2025-01-01T12:00:00.000Z",
        }),
      ])
    );

    await waitFor(() => {
      expect(screen.queryByText("Previous User First")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Current User First")).toBeInTheDocument();
  });

  it("shows a healthy badge when the last 30 days have no failures", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      last30Days: { total: 12, successful: 12, failed: 0 },
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText("Healthy")).toBeInTheDocument();
  });

  it("shows no recent activity when this week is empty", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      byPeriod: { today: 0, thisWeek: 0, thisMonth: 12, lastMonth: 8 },
      last30Days: { total: 12, successful: 12, failed: 0 },
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText("No recent activity")).toBeInTheDocument();
  });

  it.each([
    [{ thisMonth: 4, lastMonth: 8 }, "Down 50%"],
    [{ thisMonth: 12, lastMonth: 0 }, "New this month"],
    [{ thisMonth: 8, lastMonth: 8 }, "No change"],
    [{ thisMonth: 0, lastMonth: 0 }, "No change"],
  ] as const)("renders the %# activity trend", async (period, label) => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      byPeriod: { today: 1, thisWeek: 4, ...period },
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it("renders the hero without destination names", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      byDestination: { trakt: 0, simkl: 0, tvtime: 0, bingers: 0 },
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText("That's 10 successful syncs.")
    ).toBeInTheDocument();
  });

  it("falls back to lastSyncedAt when recent history is empty", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText("Last sync")).toBeInTheDocument();
    expect(screen.getByText("Jun 1, 2026")).toBeInTheDocument();
  });

  it("shows an em dash when the peak day is invalid", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      peakDay: 9,
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    const heading = await screen.findByText("Most Active Day");
    expect(heading.parentElement?.parentElement).toHaveTextContent("—");
  });

  it("shows an em dash when the peak day is missing", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      peakDay: null,
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    const heading = await screen.findByText("Most Active Day");
    expect(heading.parentElement?.parentElement).toHaveTextContent("—");
  });

  it("omits the last-sync card when no timestamp is available", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      lastSyncedAt: null,
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText("You've synced 12 titles.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Last sync")).not.toBeInTheDocument();
  });

  it.each([
    [96, "96%"],
    [70, "70%"],
  ] as const)("renders a %s success rate", async (successRate, label) => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      successRate,
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it("links the last failure", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      lastFailure: {
        mediaTitle: "Broken Show",
        syncedAt: "2026-05-30T12:00:00.000Z",
      },
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    const link = await screen.findByRole("link", { name: "Broken Show" });
    expect(link).toHaveAttribute("href", "/sync?filter=failed");
  });

  it("refreshes dashboard data from the toolbar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText("You've synced 12 titles.")
    ).toBeInTheDocument();
    expect(getSyncStatistics).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(getSyncStatistics).toHaveBeenCalledTimes(2);
    });
  });

  it("uses the translated fallback when load fails with a non-Error", async () => {
    vi.mocked(getSyncStatistics).mockRejectedValueOnce("nope");

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText("Failed to load statistics")
    ).toBeInTheDocument();
  });

  it("ignores a stale statistics response after the signed-in user changes", async () => {
    let resolvePreviousStats!: (value: SyncStatistics) => void;
    const previousStats = new Promise<SyncStatistics>((resolve) => {
      resolvePreviousStats = resolve;
    });
    let currentUserId = "user-1";

    vi.mocked(getSyncStatistics).mockImplementation(async () => {
      if (currentUserId === "user-1") {
        return previousStats;
      }
      return {
        ...statisticsFixture(),
        total: 3,
        successful: 3,
        failed: 0,
        successRate: 100,
      };
    });

    const { rerender } = renderWithProviders(<DashboardPage />, { route: "/" });

    currentUserId = "user-2";
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-2", username: "bob", isAdmin: false },
      loading: false,
      logout: vi.fn(),
      checkAuth: vi.fn(),
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: false,
    });
    rerender(<DashboardPage />);

    expect(
      await screen.findByText("You've synced 3 titles.")
    ).toBeInTheDocument();

    resolvePreviousStats(statisticsFixture());

    await waitFor(() => {
      expect(
        screen.queryByText("You've synced 12 titles.")
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("You've synced 3 titles.")).toBeInTheDocument();
  });

  it("ignores a stale load error after the signed-in user changes", async () => {
    let rejectPreviousStats!: (reason: unknown) => void;
    const previousStats = new Promise<SyncStatistics>((_resolve, reject) => {
      rejectPreviousStats = reject;
    });
    let currentUserId = "user-1";

    vi.mocked(getSyncStatistics).mockImplementation(async () => {
      if (currentUserId === "user-1") {
        return previousStats;
      }
      return {
        ...statisticsFixture(),
        total: 3,
        successful: 3,
      };
    });

    const { rerender } = renderWithProviders(<DashboardPage />, { route: "/" });

    currentUserId = "user-2";
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-2", username: "bob", isAdmin: false },
      loading: false,
      logout: vi.fn(),
      checkAuth: vi.fn(),
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: false,
    });
    rerender(<DashboardPage />);

    expect(
      await screen.findByText("You've synced 3 titles.")
    ).toBeInTheDocument();

    rejectPreviousStats(new Error("stale failure"));

    await waitFor(() => {
      expect(screen.queryByText("stale failure")).not.toBeInTheDocument();
    });
    expect(screen.getByText("You've synced 3 titles.")).toBeInTheDocument();
  });

  it("matches top-this-month artwork from recent history", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      topThisMonth: [{ mediaTitle: "Arrival", mediaType: "movie", count: 4 }],
    });
    vi.mocked(getSyncHistory).mockImplementation(
      async (_page, _size, _filters, _sortBy, sortOrder) => {
        if (sortOrder === "ASC") {
          return historyResponse([]);
        }
        return historyResponse([
          historyItem({ mediaTitle: "Arrival", mediaType: "movie" }),
        ]);
      }
    );

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findAllByText("Arrival")).not.toHaveLength(0);
    expect(screen.getAllByText("4 watches").length).toBeGreaterThan(0);
  });

  it("shows a negative pace delta when behind the average", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      byPeriod: { today: 1, thisWeek: 4, thisMonth: 12, lastMonth: 8 },
      averages: { perDay: 10, perWeek: 3, perMonth: 12 },
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText("−90%")).toBeInTheDocument();
  });

  it("shows the empty activity chart when the week series is incomplete", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      last7Days: [1, 2, 3],
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findAllByText("No recent syncs to show")
    ).not.toHaveLength(0);
  });

  it("marks unsuccessful recent syncs", async () => {
    vi.mocked(getSyncHistory).mockImplementation(
      async (_page, _size, _filters, _sortBy, sortOrder) => {
        if (sortOrder === "ASC") {
          return historyResponse([]);
        }
        return historyResponse([
          historyItem({ success: false, mediaTitle: "Failed Watch" }),
        ]);
      }
    );

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findAllByText("Failed Watch")).not.toHaveLength(0);
  });

  it("renders zero-width mix bars when media totals are empty", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      byMediaType: { episode: 0, movie: 0, series: 0 },
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    const totalLabel = await screen.findByText("total");
    expect(totalLabel.previousElementSibling).toHaveTextContent("0");
  });

  it("fills pace bars when the yearly average is zero", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue({
      ...statisticsFixture(),
      byPeriod: { today: 1, thisWeek: 0, thisMonth: 0, lastMonth: 0 },
      averages: { perDay: 0, perWeek: 0, perMonth: 0 },
    });

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText("1 today")).toBeInTheDocument();
    expect(screen.getByText("0 this week")).toBeInTheDocument();
  });

  it("renders the page chrome when statistics are missing", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue(
      null as unknown as SyncStatistics
    );

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByRole("heading", { name: "Dashboard" })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".animate-pulse")).toBeNull();
    });
    expect(screen.queryByText("No sync data yet")).not.toBeInTheDocument();
  });

  it("navigates from populated dashboard actions", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <CurrentPath />
        <DashboardPage />
      </>,
      { route: "/" }
    );

    expect(
      await screen.findByText("You've synced 12 titles.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View Sync History" }));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/sync");
    await user.click(screen.getByRole("button", { name: "Profile" }));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/profile");
  });

  it("renders the empty-state description without TVTime", async () => {
    const user = userEvent.setup();
    vi.mocked(getSyncStatistics).mockResolvedValue(emptyStatisticsFixture());

    renderWithProviders(
      <>
        <CurrentPath />
        <DashboardPage />
      </>,
      { route: "/" }
    );

    expect(
      await screen.findByText(
        /make sure webhooks are configured and your trakt, simkl, or bingers account is linked/i
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("By Destination")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Check profile & links" })
    );
    expect(screen.getByTestId("current-path")).toHaveTextContent("/profile");
    await user.click(screen.getByRole("button", { name: "View Sync History" }));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/sync");
  });
});
