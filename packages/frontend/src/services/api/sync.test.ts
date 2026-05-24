import { jsonResponse } from "@test/jsonResponse";
import { beforeEach, describe, expect, it, vi } from "vitest";


import {
  clearSyncHistory,
  deleteSyncHistoryItems,
  getSyncHistory,
  getSyncStatistics,
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

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/sync/history?page=2&pageSize=50&sortBy=mediaTitle&sortOrder=ASC&mediaType=movie&success=false&source=plex",
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

  it("throws on failed statistics requests", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(getSyncStatistics()).rejects.toThrow(
      "Failed to fetch sync statistics"
    );
  });
});
