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

  it("builds authorization URLs with optional credentials", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ authUrl: "https://trakt.tv/oauth/authorize" })
    );

    await expect(
      getTraktAuthorizeUrl("client id", "client secret")
    ).resolves.toEqual({ authUrl: "https://trakt.tv/oauth/authorize" });

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

  it("posts link codes and invalidates cached status", async () => {
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
    await expect(linkTrakt("oauth-code", "id", "secret")).resolves.toEqual({
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
        code: "oauth-code",
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
      needsReauthorization: true,
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
});
