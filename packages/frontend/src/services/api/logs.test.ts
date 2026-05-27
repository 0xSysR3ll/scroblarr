import { jsonResponse } from "@test/jsonResponse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadLogFile, getLogFiles, getLogs } from "./logs";

const expectedHeaders = { "Content-Type": "application/json" };

function blobResponse(blob: Blob, ok = true): Response {
  return {
    ok,
    blob: vi.fn().mockResolvedValue(blob),
  } as unknown as Response;
}

describe("logs api", () => {
  const fetchMock = vi.fn();
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("builds log query params from paging and filters", async () => {
    const response = {
      logs: [{ level: 30, time: 1770000000000, msg: "synced", label: "sync" }],
      pagination: { page: 2, pageSize: 25, total: 1, totalPages: 1 },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    await expect(
      getLogs({
        page: 2,
        pageSize: 25,
        level: "info",
        label: "sync",
        search: "synced",
      })
    ).resolves.toEqual(response);

    const actualUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://app");
    expect(actualUrl.pathname).toBe("/api/v1/logs");
    expect(actualUrl.searchParams.get("page")).toBe("2");
    expect(actualUrl.searchParams.get("pageSize")).toBe("25");
    expect(actualUrl.searchParams.get("level")).toBe("info");
    expect(actualUrl.searchParams.get("label")).toBe("sync");
    expect(actualUrl.searchParams.get("search")).toBe("synced");
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      headers: expectedHeaders,
    });
  });

  it("fetches available log files", async () => {
    const response = {
      files: [{ name: "scroblarr.log", size: 1024, modified: "2026-01-01" }],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    await expect(getLogFiles()).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/logs/files", {
      headers: expectedHeaders,
    });
  });

  it("downloads encoded log filenames and revokes the object URL", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:log-download");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window.URL, "createObjectURL", {
      value: createObjectURL,
      writable: true,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      value: revokeObjectURL,
      writable: true,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const blob = new Blob(["hello"], { type: "text/plain" });
    fetchMock.mockResolvedValueOnce(blobResponse(blob));

    await downloadLogFile("archived logs/scroblarr.log");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/logs/download/archived%20logs%2Fscroblarr.log",
      { headers: expectedHeaders }
    );
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:log-download");
    expect(document.querySelector("a")).not.toBeInTheDocument();
  });

  it("throws when log requests fail", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(getLogs()).rejects.toThrow("Failed to fetch logs");
  });

  it("throws when a log download fails", async () => {
    fetchMock.mockResolvedValueOnce(blobResponse(new Blob(), false));

    await expect(downloadLogFile("missing.log")).rejects.toThrow(
      "Failed to download log file"
    );
  });
});
