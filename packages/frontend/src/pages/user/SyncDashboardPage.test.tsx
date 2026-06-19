import type { SyncHistoryItem, SyncHistoryResponse } from "@services/api";
import {
  getSyncHistory,
  retrySyncHistoryItem,
  retrySyncHistoryItems,
} from "@services/api";
import { renderWithProviders } from "@test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showSuccess } from "@utils/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncDashboardPage } from "./SyncDashboardPage";

const syncHistoryTableRowMock = vi.hoisted(() => ({
  renderRows: false,
}));

vi.mock("@components/sync/SyncHistoryCard", () => ({
  SyncHistoryCard: ({
    item,
    isSelected,
    onSelect,
    onRetry,
    retrying,
  }: {
    item: SyncHistoryItem;
    isSelected: boolean;
    onSelect: () => void;
    onRetry: () => void;
    retrying: string | null;
  }) => (
    <article>
      <input
        type="checkbox"
        aria-label={`Select ${item.mediaTitle}`}
        checked={isSelected}
        onChange={onSelect}
      />
      <span>{item.mediaTitle}</span>
      {!item.success && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying !== null}
          aria-label={`Retry ${item.mediaTitle}`}
        >
          Retry
        </button>
      )}
    </article>
  ),
}));

vi.mock("@components/sync/SyncHistoryTableRow", () => ({
  SyncHistoryTableRow: ({ item }: { item: SyncHistoryItem }) =>
    syncHistoryTableRowMock.renderRows ? (
      <tr data-testid="sync-history-table-row">
        <td>{item.mediaTitle}</td>
      </tr>
    ) : null,
}));

vi.mock("@services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@services/api")>();
  return {
    ...actual,
    clearSyncHistory: vi.fn(),
    deleteSyncHistoryItem: vi.fn(),
    deleteSyncHistoryItems: vi.fn(),
    getSyncHistory: vi.fn(),
    retrySyncHistoryItem: vi.fn(),
    retrySyncHistoryItems: vi.fn(),
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
    syncHistoryTableRowMock.renderRows = false;
    vi.mocked(getSyncHistory).mockReset();
    vi.mocked(getSyncHistory).mockResolvedValue(syncHistoryResponse());
    vi.mocked(retrySyncHistoryItem).mockReset();
    vi.mocked(retrySyncHistoryItem).mockResolvedValue({
      success: true,
      destinations: ["TVTime"],
    });
    vi.mocked(retrySyncHistoryItems).mockReset();
    vi.mocked(retrySyncHistoryItems).mockResolvedValue({
      success: true,
      retried: 1,
      failed: 0,
      results: [{ success: true, destinations: ["TVTime"] }],
    });
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

  it("renders sync history rows in the table view", async () => {
    syncHistoryTableRowMock.renderRows = true;

    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });

    expect(await screen.findByText("Media")).toBeVisible();
    await waitFor(() => {
      expect(screen.getAllByTestId("sync-history-table-row")).toHaveLength(2);
    });
  });

  it("prevents overlapping retry requests while one retry is in flight", async () => {
    let resolveRetry: (value: {
      success: boolean;
      destinations: string[];
    }) => void;
    vi.mocked(retrySyncHistoryItem).mockReturnValue(
      new Promise((resolve) => {
        resolveRetry = resolve;
      })
    );

    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });

    const retryButton = await screen.findByRole("button", {
      name: "Retry Broken Episode",
    });
    const loadCallsBeforeRetry = vi.mocked(getSyncHistory).mock.calls.length;

    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    expect(retrySyncHistoryItem).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(retryButton).toBeDisabled());

    resolveRetry!({ success: true, destinations: ["TVTime"] });

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith("Sync retried successfully");
    });
    expect(getSyncHistory).toHaveBeenCalledTimes(loadCallsBeforeRetry + 1);
  });

  it("shows the singular bulk retry success message after retrying one selected failure", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });

    await screen.findByText("Broken Episode");

    await user.click(
      screen.getByRole("checkbox", { name: "Select Broken Episode" })
    );
    await user.click(screen.getByRole("button", { name: "Retry Failed (1)" }));

    await waitFor(() => {
      expect(retrySyncHistoryItems).toHaveBeenCalledWith(["2"]);
      expect(showSuccess).toHaveBeenCalledWith("Retried 1 failed sync item");
    });
  });
});
