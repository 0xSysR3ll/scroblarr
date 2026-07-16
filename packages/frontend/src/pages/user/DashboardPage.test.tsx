import { useAuth } from "@contexts/AuthContext";
import type { SyncHistoryResponse } from "@services/api";
import {
  getSyncHistory,
  getSyncStatistics,
  type SyncStatistics,
} from "@services/api/sync";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
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
    vi.mocked(getSyncHistory).mockResolvedValue({
      data: [],
      pagination: {
        page: 1,
        pageSize: 5,
        total: 0,
        totalPages: 0,
      },
    } satisfies SyncHistoryResponse);
  });

  it("renders destination statistics including Simkl", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });

    await waitFor(() => {
      expect(screen.getByText("By Destination")).toBeInTheDocument();
    });

    const simklRow = screen.getByText("Simkl").closest("div");
    expect(simklRow).not.toBeNull();
    expect(simklRow).toHaveTextContent("3");
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
