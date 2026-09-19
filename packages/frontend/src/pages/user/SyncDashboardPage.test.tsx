import type { SyncHistoryItem, SyncHistoryResponse } from "@services/api";
import {
  getSyncHistory,
  retrySyncHistoryItem,
  retrySyncHistoryItems,
} from "@services/api";
import { renderWithProviders } from "@test/render";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@utils/toast";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function makeItem(
  id: string,
  title: string,
  overrides: Partial<SyncHistoryItem> = {}
): SyncHistoryItem {
  return {
    id,
    userId: "user-1",
    username: "alice",
    mediaType: "movie",
    mediaTitle: title,
    source: "plex",
    success: true,
    syncedAt: "2026-01-01T12:00:00.000Z",
    destinations: ["Trakt"],
    ...overrides,
  };
}

function syncHistoryResponse(
  data = history,
  pagination: Partial<SyncHistoryResponse["pagination"]> = {}
): SyncHistoryResponse {
  return {
    data,
    pagination: {
      page: 1,
      pageSize: 100,
      total: data.length,
      totalPages: 1,
      ...pagination,
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
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("quietly refreshes and shows new history after the auto-refresh interval", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const newer = [
      makeItem("3", "Fresh Movie", {
        syncedAt: "2026-01-01T13:00:00.000Z",
      }),
      ...history,
    ];

    vi.mocked(getSyncHistory)
      .mockResolvedValueOnce(syncHistoryResponse())
      .mockResolvedValue(syncHistoryResponse(newer));

    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });

    expect(await screen.findByText("Example Movie")).toBeVisible();
    const callsAfterMount = vi.mocked(getSyncHistory).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    await waitFor(() => {
      expect(vi.mocked(getSyncHistory).mock.calls.length).toBeGreaterThan(
        callsAfterMount
      );
      expect(screen.getByText("Fresh Movie")).toBeVisible();
    });
  });

  it("skips applying quiet refresh results when the fingerprint is unchanged", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getSyncHistory).mockResolvedValue(syncHistoryResponse());

    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });
    expect(await screen.findByText("Example Movie")).toBeVisible();
    const callsAfterMount = vi.mocked(getSyncHistory).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    await waitFor(() => {
      expect(vi.mocked(getSyncHistory).mock.calls.length).toBe(
        callsAfterMount + 1
      );
    });
    expect(screen.getByText("Example Movie")).toBeVisible();
    expect(screen.getByText("Broken Episode")).toBeVisible();
  });

  it("does not quiet-refresh while the document is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    vi.mocked(getSyncHistory).mockResolvedValue(syncHistoryResponse());

    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });
    expect(await screen.findByText("Example Movie")).toBeVisible();
    const callsAfterMount = vi.mocked(getSyncHistory).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(getSyncHistory).toHaveBeenCalledTimes(callsAfterMount);
  });

  it("loads up to five pages when history total exceeds 500", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      makeItem(`p1-${i}`, `Page1 ${i}`)
    );
    const page2 = Array.from({ length: 100 }, (_, i) =>
      makeItem(`p2-${i}`, `Page2 ${i}`)
    );
    const page3 = Array.from({ length: 100 }, (_, i) =>
      makeItem(`p3-${i}`, `Page3 ${i}`)
    );
    const page4 = Array.from({ length: 100 }, (_, i) =>
      makeItem(`p4-${i}`, `Page4 ${i}`)
    );
    const page5 = Array.from({ length: 100 }, (_, i) =>
      makeItem(`p5-${i}`, `Page5 ${i}`)
    );

    vi.mocked(getSyncHistory).mockImplementation(async (page = 1) => {
      const pages = [page1, page2, page3, page4, page5];
      return syncHistoryResponse(pages[page - 1] ?? [], {
        page,
        total: 600,
        totalPages: 6,
      });
    });

    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });

    expect(await screen.findByText("Page1 0")).toBeVisible();
    await waitFor(() => {
      const requestedPages = vi
        .mocked(getSyncHistory)
        .mock.calls.map((call) => call[0] ?? 1);
      expect(requestedPages).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
    });
    expect(
      screen.getByText(/You have more than 500 sync history items/i)
    ).toBeVisible();
  });

  it("force-refreshes via pull-to-refresh even when the fingerprint matches", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      makeItem(`p1-${i}`, `Movie ${i}`)
    );
    const page2 = Array.from({ length: 50 }, (_, i) =>
      makeItem(`p2-${i}`, `Later ${i}`)
    );

    vi.mocked(getSyncHistory).mockImplementation(async (page = 1) => {
      if (page === 1) {
        return syncHistoryResponse(page1, {
          page: 1,
          total: 150,
          totalPages: 2,
        });
      }
      return syncHistoryResponse(page2, {
        page: 2,
        total: 150,
        totalPages: 2,
      });
    });

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
      writable: true,
    });

    const { container } = renderWithProviders(<SyncDashboardPage />, {
      route: "/sync",
    });
    expect(await screen.findByText("Movie 0")).toBeVisible();
    await waitFor(() => {
      expect(
        vi.mocked(getSyncHistory).mock.calls.some((call) => call[0] === 2)
      ).toBe(true);
    });
    const callsAfterInitialLoad = vi.mocked(getSyncHistory).mock.calls.length;

    const root = container.firstElementChild!;

    fireEvent.touchStart(root, {
      touches: [{ clientY: 0 }],
    });
    fireEvent.touchMove(root, {
      touches: [{ clientY: 200 }],
    });
    await act(async () => {
      fireEvent.touchEnd(root);
    });

    await waitFor(() => {
      expect(vi.mocked(getSyncHistory).mock.calls.length).toBeGreaterThan(
        callsAfterInitialLoad
      );
      const page2Calls = vi
        .mocked(getSyncHistory)
        .mock.calls.filter((call) => call[0] === 2);
      expect(page2Calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows an error toast when the initial history load fails", async () => {
    vi.mocked(getSyncHistory).mockRejectedValue(new Error("network down"));

    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Failed to load sync history");
    });
  });

  it("quietly refreshes when the document becomes visible again", async () => {
    let hidden = true;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    vi.mocked(getSyncHistory).mockResolvedValue(syncHistoryResponse());

    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });
    expect(await screen.findByText("Example Movie")).toBeVisible();
    const callsAfterMount = vi.mocked(getSyncHistory).mock.calls.length;

    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(vi.mocked(getSyncHistory).mock.calls.length).toBeGreaterThan(
        callsAfterMount
      );
    });
  });

  it("skips overlapping quiet refreshes while a load is already in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveHang!: (value: SyncHistoryResponse) => void;
    let hangNext = false;

    vi.mocked(getSyncHistory).mockImplementation(() => {
      if (!hangNext) {
        return Promise.resolve(syncHistoryResponse());
      }
      return new Promise((resolve) => {
        resolveHang = resolve;
      });
    });

    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });
    expect(await screen.findByText("Example Movie")).toBeVisible();
    const callsAfterMount = vi.mocked(getSyncHistory).mock.calls.length;

    hangNext = true;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    await waitFor(() => {
      expect(vi.mocked(getSyncHistory).mock.calls.length).toBe(
        callsAfterMount + 1
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(vi.mocked(getSyncHistory).mock.calls.length).toBe(
      callsAfterMount + 1
    );

    await act(async () => {
      resolveHang(syncHistoryResponse());
    });
  });

  it("ignores stale multi-page results after a newer load starts", async () => {
    const stalePage2 = Array.from({ length: 20 }, (_, i) =>
      makeItem(`p2-${i}`, `Later ${i}`)
    );
    const filtered = [makeItem("f1", "Filtered Movie")];

    let resolveStalePage2!: (value: SyncHistoryResponse) => void;
    let hangPage2 = false;

    vi.mocked(getSyncHistory).mockImplementation(async (page = 1, ...rest) => {
      const filters = rest[1] as { mediaType?: string } | undefined;
      if (filters?.mediaType === "movie") {
        return syncHistoryResponse(filtered, {
          page: 1,
          total: 1,
          totalPages: 1,
        });
      }
      if (page === 1) {
        return syncHistoryResponse(
          Array.from({ length: 100 }, (_, i) =>
            makeItem(`p1-${i}`, `Movie ${i}`)
          ),
          {
            page: 1,
            total: 120,
            totalPages: 2,
          }
        );
      }
      if (hangPage2) {
        return new Promise((resolve) => {
          resolveStalePage2 = resolve;
        });
      }
      return syncHistoryResponse(stalePage2, {
        page: 2,
        total: 120,
        totalPages: 2,
      });
    });

    const user = userEvent.setup();
    renderWithProviders(<SyncDashboardPage />, { route: "/sync" });
    expect(await screen.findByText("Movie 0")).toBeVisible();

    hangPage2 = true;

    await user.click(screen.getByRole("button", { name: "Advanced Filters" }));
    const mediaTypeSelect = screen.getAllByRole("combobox")[0];
    await user.selectOptions(mediaTypeSelect, "episode");

    await waitFor(() => {
      expect(resolveStalePage2).toBeTypeOf("function");
    });

    await user.selectOptions(mediaTypeSelect, "movie");

    await waitFor(() => {
      expect(screen.getByText("Filtered Movie")).toBeVisible();
    });

    await act(async () => {
      resolveStalePage2(
        syncHistoryResponse(stalePage2, {
          page: 2,
          total: 120,
          totalPages: 2,
        })
      );
    });

    expect(screen.getByText("Filtered Movie")).toBeVisible();
    expect(screen.queryByText("Later 0")).not.toBeInTheDocument();
  });
});
