import { useAuth } from "@contexts/AuthContext";
import type { SyncHistoryItem, SyncHistoryResponse } from "@services/api";
import {
  getSyncHistory,
  getSyncStatistics,
  type SyncStatistics,
} from "@services/api/sync";
import { renderWithProviders } from "@test/render";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@services/api/sync", () => ({
  getSyncStatistics: vi.fn(),
  getSyncHistory: vi.fn(),
}));

function statisticsFixture() {
  return {
    total: 12,
    successful: 10,
    failed: 2,
    successRate: 83,
    byMediaType: { episode: 8, movie: 4, series: 0 },
    bySource: { plex: 10, jellyfin: 2 },
    byDestination: { trakt: 5, tvtime: 4, simkl: 3 },
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
    byDestination: { trakt: 0, simkl: 0, tvtime: 0 },
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
  beforeEach(() => {
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
  });

  it("renders destination statistics including Simkl", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });

    const heading = await screen.findByText("By Destination");
    const card = heading.closest("div");
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

  it("renders compact trend and peak-day metrics", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(await screen.findByText("Wednesday")).toBeInTheDocument();
    expect(screen.getByText("Up 50%")).toBeInTheDocument();
    expect(screen.getByText("10 / 12")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Today: 1 syncs" })
    ).toBeInTheDocument();
    expect(screen.getByText("Per Day")).toBeInTheDocument();
    expect(screen.getByText("1 today")).toBeInTheDocument();
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
    expect(screen.getByText("First sync")).toBeInTheDocument();
    expect(screen.getAllByText("The Latest Watch").length).toBeGreaterThan(0);
    expect(screen.getByText("The First Watch")).toBeInTheDocument();
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

  it("renders the empty-state description without TVTime", async () => {
    vi.mocked(getSyncStatistics).mockResolvedValue(emptyStatisticsFixture());

    renderWithProviders(<DashboardPage />, { route: "/" });

    expect(
      await screen.findByText(
        /make sure webhooks are configured and your trakt or simkl account is linked/i
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("By Destination")).not.toBeInTheDocument();
  });
});
