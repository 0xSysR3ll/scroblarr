import type { SyncHistoryItem, SyncHistoryResponse } from "@services/api";
import { getSyncHistory } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncDashboardPage } from "./SyncDashboardPage";

vi.mock("@components/sync/SyncHistoryCard", () => ({
  SyncHistoryCard: ({ item }: { item: SyncHistoryItem }) => (
    <article>{item.mediaTitle}</article>
  ),
}));

vi.mock("@components/sync/SyncHistoryTableRow", () => ({
  SyncHistoryTableRow: () => null,
}));

vi.mock("@services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@services/api")>();
  return {
    ...actual,
    clearSyncHistory: vi.fn(),
    deleteSyncHistoryItem: vi.fn(),
    deleteSyncHistoryItems: vi.fn(),
    getSyncHistory: vi.fn(),
  };
});

vi.mock("@utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const history: SyncHistoryItem[] = [
  {
    id: "1",
    userId: "user-1",
    username: "alice",
    mediaType: "movie",
    mediaTitle: "Example Movie",
    source: "plex",
    success: true,
    syncedAt: "2026-01-01T12:00:00.000Z",
    destinations: ["Trakt"],
  },
  {
    id: "2",
    userId: "user-1",
    username: "alice",
    mediaType: "episode",
    mediaTitle: "Broken Episode",
    source: "jellyfin",
    success: false,
    errorMessage: "TVTime: temporary failure",
    syncedAt: "2026-01-01T11:00:00.000Z",
  },
];

function syncHistoryResponse(data = history): SyncHistoryResponse {
  return {
    data,
    pagination: {
      page: 1,
      pageSize: 100,
      total: data.length,
      totalPages: 1,
    },
  };
}

describe("SyncDashboardPage", () => {
  beforeEach(() => {
    vi.mocked(getSyncHistory).mockReset();
    vi.mocked(getSyncHistory).mockResolvedValue(syncHistoryResponse());
  });

  it("filters loaded history with search text", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });

    expect(await screen.findByText("Example Movie")).toBeVisible();
    expect(screen.getByText("Broken Episode")).toBeVisible();

    await user.type(
      screen.getByPlaceholderText("Search by title, source, or error..."),
      "movie"
    );

    expect(screen.getByText("Example Movie")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText("Broken Episode")).not.toBeInTheDocument();
    });
  });

  it("filters loaded history with quick status filters", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });

    expect(await screen.findByText("Example Movie")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Failed Only" }));

    expect(screen.getByText("Broken Episode")).toBeVisible();
    expect(screen.queryByText("Example Movie")).not.toBeInTheDocument();
  });
});
