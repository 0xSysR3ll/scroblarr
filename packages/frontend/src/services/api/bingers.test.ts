import { jsonResponse } from "@test/jsonResponse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBingersStatus,
  invalidateBingersCache,
  linkBingers,
  unlinkBingers,
} from "./bingers";

const expectedHeaders = { "Content-Type": "application/json" };

describe("bingers api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    invalidateBingersCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    invalidateBingersCache();
  });

  it("links with a magic-link token and invalidates cached status", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          linked: false,
          needsReauthorization: false,
          username: null,
          image: null,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          linked: true,
          needsReauthorization: false,
          username: "alice",
          image: "https://img.example/alice.png",
        })
      );

    await getBingersStatus();
    await expect(
      linkBingers("https://bingers.app/m?token=abc", "alice@example.com")
    ).resolves.toEqual({ success: true });
    await expect(getBingersStatus()).resolves.toMatchObject({
      linked: true,
      username: "alice",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/bingers/link", {
      method: "POST",
      headers: expectedHeaders,
      body: JSON.stringify({
        token: "https://bingers.app/m?token=abc",
        email: "alice@example.com",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("caches status until force refresh", async () => {
    const status = {
      linked: true,
      needsReauthorization: false,
      username: "alice",
      image: null,
    };
    fetchMock.mockResolvedValue(jsonResponse(status));

    await expect(getBingersStatus()).resolves.toEqual(status);
    await expect(getBingersStatus()).resolves.toEqual(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(getBingersStatus({ force: true })).resolves.toEqual(status);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("unlinks and clears cached status", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          linked: true,
          needsReauthorization: false,
          username: "alice",
          image: null,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          linked: false,
          needsReauthorization: false,
          username: null,
          image: null,
        })
      );

    await getBingersStatus();
    await expect(unlinkBingers()).resolves.toEqual({ success: true });
    await expect(getBingersStatus()).resolves.toMatchObject({ linked: false });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/bingers/unlink", {
      method: "POST",
      headers: expectedHeaders,
    });
  });

  it("surfaces link, unlink, and status errors from the backend", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: "Magic link expired" }, false, 400)
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: "Failed to unlink Bingers account" }, false, 500)
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: "Failed to fetch Bingers status" }, false, 500)
      );

    await expect(linkBingers("token")).rejects.toThrow("Magic link expired");
    await expect(unlinkBingers()).rejects.toThrow(
      "Failed to unlink Bingers account"
    );
    await expect(getBingersStatus()).rejects.toThrow(
      "Failed to fetch Bingers status"
    );
  });

  it("surfaces non-JSON link and unlink errors", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("link proxy failed", {
          status: 503,
          statusText: "Service Unavailable",
        })
      )
      .mockResolvedValueOnce(
        new Response("unlink proxy failed", {
          status: 504,
          statusText: "Gateway Timeout",
        })
      );

    await expect(linkBingers("token")).rejects.toThrow("link proxy failed");
    await expect(unlinkBingers()).rejects.toThrow("unlink proxy failed");
  });
});
