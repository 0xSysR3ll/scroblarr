import { jsonResponse } from "@test/jsonResponse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getTVTimeProfile,
  getTVTimeStatus,
  invalidateTVTimeCache,
  linkTVTime,
  unlinkTVTime,
} from "./tvtime";

const expectedHeaders = { "Content-Type": "application/json" };

describe("tvtime api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    invalidateTVTimeCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    invalidateTVTimeCache();
  });

  it("caches TV Time status responses", async () => {
    const status = {
      linked: true,
      email: "alice@example.test",
      username: "alice",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(status));

    await expect(getTVTimeStatus()).resolves.toEqual(status);
    await expect(getTVTimeStatus()).resolves.toEqual(status);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/tvtime/status", {
      headers: expectedHeaders,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts TV Time credentials and invalidates cached status", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ linked: false, email: null, username: null })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          linked: true,
          email: "alice@example.test",
          username: "alice",
        })
      );

    await getTVTimeStatus();
    await expect(linkTVTime("alice@example.test", "secret")).resolves.toEqual({
      success: true,
    });
    await expect(getTVTimeStatus()).resolves.toMatchObject({ linked: true });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/tvtime/link", {
      method: "POST",
      headers: expectedHeaders,
      body: JSON.stringify({
        email: "alice@example.test",
        password: "secret",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("unlinks TV Time accounts and clears cached status", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          linked: true,
          email: "alice@example.test",
          username: "alice",
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({ linked: false, email: null, username: null })
      );

    await getTVTimeStatus();
    await expect(unlinkTVTime()).resolves.toEqual({ success: true });
    await expect(getTVTimeStatus()).resolves.toMatchObject({ linked: false });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/tvtime/unlink", {
      method: "POST",
      headers: expectedHeaders,
    });
  });

  it("fetches and caches TV Time profiles", async () => {
    const profile = {
      id: "tvtime-1",
      username: "alice",
      email: "alice@example.test",
      image: "https://img.example/alice.png",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(profile));

    await expect(getTVTimeProfile()).resolves.toEqual(profile);
    await expect(getTVTimeProfile()).resolves.toEqual(profile);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/tvtime/profile", {
      headers: expectedHeaders,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses profile error messages returned by the server", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "TV Time session expired" }, false)
    );

    await expect(getTVTimeProfile()).rejects.toThrow("TV Time session expired");
  });

  it("falls back to status text when profile error bodies are invalid", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      statusText: "Unauthorized",
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
    } as unknown as Response);

    await expect(getTVTimeProfile()).rejects.toThrow("Unauthorized");
  });

  it("throws when status requests fail", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(getTVTimeStatus()).rejects.toThrow(
      "Failed to fetch TVTime status"
    );
  });
});
