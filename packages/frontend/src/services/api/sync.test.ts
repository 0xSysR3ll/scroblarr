import { jsonResponse } from "@test/jsonResponse";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSyncHistory,
  deleteSyncHistoryItems,
  getSyncHistory,
  getSyncStatistics,
  retrySyncHistoryItem,
} from "./sync";

describe("sync api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("builds sync-history query params from paging, filters, and sorting", async () => {
    const response = {
      data: [],
      pagination: { page: 2, pageSize: 50, total: 0, totalPages: 0 },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    await expect(
      getSyncHistory(
        2,
        50,
        { mediaType: "movie", success: false, source: "plex" },
        "mediaTitle",
        "ASC"
      )
    ).resolves.toEqual(response);

    const actualUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://app");

    expect(actualUrl.pathname).toBe("/api/v1/sync/history");
    expect(actualUrl.searchParams.get("page")).toBe("2");
    expect(actualUrl.searchParams.get("pageSize")).toBe("50");
    expect(actualUrl.searchParams.get("sortBy")).toBe("mediaTitle");
    expect(actualUrl.searchParams.get("sortOrder")).toBe("ASC");
    expect(actualUrl.searchParams.get("mediaType")).toBe("movie");
    expect(actualUrl.searchParams.get("success")).toBe("false");
    expect(actualUrl.searchParams.get("source")).toBe("plex");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("clears all sync history", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));

    await expect(clearSyncHistory()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/sync/history",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("bulk deletes selected sync-history items", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));

    await expect(deleteSyncHistoryItems(["a", "b"])).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/sync/history",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ ids: ["a", "b"] }),
      })
    );
  });

  it("retries a sync-history item", async () => {
    const response = { success: true, destinations: ["TVTime"] };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    await expect(retrySyncHistoryItem("sync-id")).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/sync/history/sync-id/retry",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("throws on failed statistics requests", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(getSyncStatistics()).rejects.toThrow(
      "Failed to fetch sync statistics"
    );
  });
});
