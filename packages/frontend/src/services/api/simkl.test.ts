import { jsonResponse } from "@test/jsonResponse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSimklAuthorizeUrl,
  getSimklProfile,
  getSimklStatus,
  invalidateSimklCache,
  linkSimkl,
  unlinkSimkl,
} from "./simkl";

const expectedHeaders = { "Content-Type": "application/json" };

describe("simkl api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    invalidateSimklCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    invalidateSimklCache();
  });

  it("requests a PIN authorization payload with client ID", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        userCode: "ABCDE",
        verificationUrl: "https://simkl.com/pin/",
        expiresIn: 900,
        interval: 5,
      })
    );

    await expect(getSimklAuthorizeUrl("client id")).resolves.toEqual({
      userCode: "ABCDE",
      verificationUrl: "https://simkl.com/pin/",
      expiresIn: 900,
      interval: 5,
    });

    const actualUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://app");
    expect(actualUrl.pathname).toBe("/api/v1/simkl/authorize");
    expect(actualUrl.searchParams.get("clientId")).toBe("client id");
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      headers: expectedHeaders,
    });
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

    await getSimklStatus();
    await expect(linkSimkl("ABCDE", "id")).resolves.toEqual({
      success: true,
    });
    await expect(getSimklStatus()).resolves.toMatchObject({
      linked: true,
      username: "alice",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/simkl/link", {
      method: "POST",
      headers: expectedHeaders,
      body: JSON.stringify({
        userCode: "ABCDE",
        clientId: "id",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
          hasCredentials: false,
        })
      );

    await getSimklStatus();
    await expect(unlinkSimkl()).resolves.toEqual({ success: true });
    await expect(getSimklStatus()).resolves.toMatchObject({ linked: false });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/simkl/unlink", {
      method: "POST",
      headers: expectedHeaders,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("loads and caches Simkl profiles", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 51,
        username: "alice",
        image: "https://img.example/alice.png",
      })
    );

    await expect(getSimklProfile()).resolves.toEqual({
      id: 51,
      username: "alice",
      image: "https://img.example/alice.png",
    });
    await expect(getSimklProfile()).resolves.toMatchObject({
      username: "alice",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/simkl/profile", {
      headers: expectedHeaders,
    });
  });

  it("surfaces authorization errors from the backend", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Simkl client ID is required" }, false, 400)
    );

    await expect(getSimklAuthorizeUrl()).rejects.toThrow(
      "Simkl client ID is required"
    );
  });

  it("surfaces link errors from the backend", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Authorization pending" }, false, 400)
    );

    await expect(linkSimkl("ABCDE")).rejects.toThrow("Authorization pending");
  });

  it("surfaces unlink errors from the backend", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Failed to unlink Simkl account" }, false, 500)
    );

    await expect(unlinkSimkl()).rejects.toThrow(
      "Failed to unlink Simkl account"
    );
  });

  it("surfaces status and profile fetch failures", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "nope" }, false, 500))
      .mockResolvedValueOnce({
        ok: false,
        statusText: "Service Unavailable",
        json: vi.fn().mockRejectedValue(new Error("invalid json")),
      });

    await expect(getSimklStatus()).rejects.toThrow(
      "Failed to fetch Simkl status"
    );
    await expect(getSimklProfile()).rejects.toThrow("Service Unavailable");
  });
});
