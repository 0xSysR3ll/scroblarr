import { jsonResponse } from "@test/jsonResponse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getTraktAuthorizeUrl,
  getTraktStatus,
  invalidateTraktCache,
  linkTrakt,
  unlinkTrakt,
} from "./trakt";

const expectedHeaders = { "Content-Type": "application/json" };

describe("trakt api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    invalidateTraktCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    invalidateTraktCache();
  });

  it("builds PIN authorization requests with optional credentials", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        userCode: "ABCD1234",
        verificationUrl: "https://trakt.tv/activate",
        expiresIn: 600,
        interval: 5,
      })
    );

    await expect(
      getTraktAuthorizeUrl("client id", "client secret")
    ).resolves.toEqual({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 600,
      interval: 5,
    });

    const actualUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://app");
    expect(actualUrl.pathname).toBe("/api/v1/trakt/authorize");
    expect(actualUrl.searchParams.get("clientId")).toBe("client id");
    expect(actualUrl.searchParams.get("clientSecret")).toBe("client secret");
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      headers: expectedHeaders,
    });
  });

  it("uses server messages for authorization errors", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Missing Trakt client credentials" }, false)
    );

    await expect(getTraktAuthorizeUrl()).rejects.toThrow(
      "Missing Trakt client credentials"
    );
  });

  it("posts PIN codes and invalidates cached status", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          linked: false,
          username: null,
          image: null,
          hasCredentials: true,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          linked: true,
          username: "alice",
          image: "https://img.example/alice.png",
          hasCredentials: true,
        })
      );

    await getTraktStatus();
    await expect(linkTrakt("ABCD1234", "id", "secret")).resolves.toEqual({
      success: true,
    });
    await expect(getTraktStatus()).resolves.toMatchObject({
      linked: true,
      username: "alice",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/trakt/link", {
      method: "POST",
      headers: expectedHeaders,
      body: JSON.stringify({
        userCode: "ABCD1234",
        clientId: "id",
        clientSecret: "secret",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("caches trakt status responses", async () => {
    const status = {
      linked: true,
      username: "alice",
      image: null,
      hasCredentials: true,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(status));

    await expect(getTraktStatus()).resolves.toEqual(status);
    await expect(getTraktStatus()).resolves.toEqual(status);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bypasses cache when force is true", async () => {
    const status = {
      linked: true,
      needsReauthorization: false,
      username: "alice",
      image: null,
      hasCredentials: true,
    };
    fetchMock.mockResolvedValue(jsonResponse(status));

    await expect(getTraktStatus()).resolves.toEqual(status);
    await expect(getTraktStatus({ force: true })).resolves.toEqual(status);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache status that requires re-authorization", async () => {
    const status = {
      linked: true,
      needsReauthorization: true,
      username: "alice",
      image: null,
      hasCredentials: true,
    };
    fetchMock.mockResolvedValue(jsonResponse(status));

    await expect(getTraktStatus()).resolves.toEqual(status);
    await expect(getTraktStatus()).resolves.toEqual(status);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("unlinks accounts and clears cached status", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          linked: true,
          username: "alice",
          image: null,
          hasCredentials: true,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          linked: false,
          username: null,
          image: null,
          hasCredentials: true,
        })
      );

    await getTraktStatus();
    await expect(unlinkTrakt()).resolves.toEqual({ success: true });
    await expect(getTraktStatus()).resolves.toMatchObject({ linked: false });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/trakt/unlink", {
      method: "POST",
      headers: expectedHeaders,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws when status requests fail", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(getTraktStatus()).rejects.toThrow(
      "Failed to fetch Trakt status"
    );
  });

  it("surfaces link errors from the backend", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "authorization pending" }, false, 400)
    );

    await expect(linkTrakt("ABCD1234")).rejects.toThrow(
      "authorization pending"
    );
  });

  it("surfaces unlink errors from the backend", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Failed to unlink Trakt account" }, false, 500)
    );

    await expect(unlinkTrakt()).rejects.toThrow(
      "Failed to unlink Trakt account"
    );
  });

  it("surfaces non-JSON authorize, link, and unlink errors", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("proxy failed", {
          status: 502,
          statusText: "Bad Gateway",
        })
      )
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

    await expect(getTraktAuthorizeUrl()).rejects.toThrow("proxy failed");
    await expect(linkTrakt("ABCD1234")).rejects.toThrow("link proxy failed");
    await expect(unlinkTrakt()).rejects.toThrow("unlink proxy failed");
  });

  it("falls back to status text when error bodies are empty", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      clone: () => ({
        json: vi.fn().mockRejectedValue(new Error("invalid json")),
      }),
      text: vi.fn().mockResolvedValue("   "),
    });

    await expect(getTraktAuthorizeUrl()).rejects.toThrow(
      "Failed to get Trakt PIN code (503 Service Unavailable)"
    );
  });

  it("falls back to status when JSON has no error field", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      clone: () => ({
        json: vi.fn().mockResolvedValue({
          message: "boom",
          statusCode: 500,
        }),
      }),
      text: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ message: "boom", statusCode: 500 })
        ),
    });

    await expect(getTraktAuthorizeUrl()).rejects.toThrow(
      "Failed to get Trakt PIN code (500 Internal Server Error)"
    );
  });

  it("falls back to status text when reading the error body throws", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      clone: () => ({
        json: vi.fn().mockRejectedValue(new Error("invalid json")),
      }),
      text: vi.fn().mockRejectedValue(new Error("stream failed")),
    });

    await expect(getTraktAuthorizeUrl()).rejects.toThrow(
      "Failed to get Trakt PIN code (502 Bad Gateway)"
    );
  });

  it("falls back to the default message when status metadata is missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 0,
      statusText: "",
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
      text: vi.fn().mockResolvedValue(""),
    });

    await expect(getTraktAuthorizeUrl()).rejects.toThrow(
      "Failed to get Trakt PIN code"
    );
  });
});
