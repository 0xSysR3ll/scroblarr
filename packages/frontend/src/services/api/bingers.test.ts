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
      linkBingers("https://bingers.app/m?token=abc")
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
        new Response(JSON.stringify({ error: "Magic link expired" }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "Failed to unlink Bingers account" }),
          {
            status: 500,
            statusText: "Internal Server Error",
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "Failed to fetch Bingers status" }),
          {
            status: 500,
            statusText: "Internal Server Error",
            headers: { "Content-Type": "application/json" },
          }
        )
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

  it("keeps raw body text when JSON lacks a string error field", async () => {
    const body = JSON.stringify({ message: "session expired", code: "gone" });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      // No clone — previously json() would consume the body before text().
      text: vi.fn().mockResolvedValue(body),
      json: vi.fn().mockResolvedValue({
        message: "session expired",
        code: "gone",
      }),
    });

    await expect(linkBingers("token")).rejects.toThrow(body);
  });

  it("falls back when the error body cannot be read", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: vi.fn().mockRejectedValue(new Error("stream closed")),
    });

    await expect(linkBingers("token")).rejects.toThrow(
      "Failed to link Bingers account (502 Bad Gateway)"
    );
  });

  it("falls back to the default message when body and status text are empty", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 0,
      statusText: "",
      text: vi.fn().mockResolvedValue("   "),
    });

    await expect(getBingersStatus()).rejects.toThrow(
      "Failed to fetch Bingers status"
    );
  });
});
