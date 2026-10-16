import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWithTimeout } from "./fetchWithTimeout";

describe("fetchWithTimeout", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns a successful response", async () => {
    const response = { ok: true } as Response;
    fetchMock.mockResolvedValue(response);

    await expect(
      fetchWithTimeout("https://example.com", { method: "GET" }, "example")
    ).resolves.toBe(response);
  });

  it("maps AbortError to a timed-out message", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );

    await expect(
      fetchWithTimeout("https://example.com", undefined, "example call")
    ).rejects.toThrow("example call timed out");
  });

  it("rethrows non-abort fetch failures", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(
      fetchWithTimeout("https://example.com", undefined, "example call")
    ).rejects.toThrow("network down");
  });

  it("rethrows non-Error rejection values", async () => {
    fetchMock.mockRejectedValue("network down");

    await expect(
      fetchWithTimeout(
        "https://example.com",
        { method: "GET" },
        "example",
        5_000
      )
    ).rejects.toBe("network down");
  });

  it("preserves caller abort errors instead of timeout messages", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );

    await expect(
      fetchWithTimeout(
        "https://example.com",
        { signal: controller.signal },
        "example call"
      )
    ).rejects.toThrow("aborted");
  });

  it("forwards a caller abort signal to fetch", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, init) => {
      expect(init?.signal?.aborted).toBe(false);
      controller.abort();
      expect(init?.signal?.aborted).toBe(true);
      return Promise.reject(
        Object.assign(new Error("aborted"), { name: "AbortError" })
      );
    });

    await expect(
      fetchWithTimeout(
        "https://example.com",
        { signal: controller.signal },
        "example call"
      )
    ).rejects.toThrow("aborted");
  });
});
