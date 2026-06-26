import { jsonResponse } from "@test/jsonResponse";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSettings,
  removeJellyfinServer,
  removePlexServer,
  testTmdbConnection,
  updateSettings,
} from "./settings";

const expectedHeaders = { "Content-Type": "application/json" };

describe("settings api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("loads settings with auth headers", async () => {
    const settings = { plexServerUrl: "https://plex.example.test" };
    fetchMock.mockResolvedValueOnce(jsonResponse(settings));

    await expect(getSettings()).resolves.toEqual(settings);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/settings", {
      headers: expectedHeaders,
    });
  });

  it("throws when settings cannot be loaded", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(getSettings()).rejects.toThrow("Failed to fetch settings");
  });

  it("updates settings with a PATCH body", async () => {
    const settings = { syncHistoryLimit: "1000" };
    fetchMock.mockResolvedValueOnce(jsonResponse(settings));

    await expect(updateSettings(settings)).resolves.toEqual(settings);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/settings", {
      method: "PATCH",
      headers: expectedHeaders,
      body: JSON.stringify(settings),
    });
  });

  it("removes configured media servers through dedicated endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ plexServerUrl: undefined }))
      .mockResolvedValueOnce(jsonResponse({ jellyfinHost: undefined }));

    await removePlexServer();
    await removeJellyfinServer();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/settings/plex", {
      method: "DELETE",
      headers: expectedHeaders,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/settings/jellyfin", {
      method: "DELETE",
      headers: expectedHeaders,
    });
  });

  it("throws when media server removal fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(removePlexServer()).rejects.toThrow(
      "Failed to remove Plex server"
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(removeJellyfinServer()).rejects.toThrow(
      "Failed to remove Jellyfin server"
    );
  });

  it("throws on failed settings updates", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(updateSettings({ apiKey: "secret" })).rejects.toThrow(
      "Failed to update settings"
    );
  });

  it("tests TMDB connection through the dedicated endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await expect(testTmdbConnection("draft-token")).resolves.toEqual({
      success: true,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/settings/tmdb/test", {
      method: "POST",
      headers: expectedHeaders,
      body: JSON.stringify({ tmdbAccessToken: "draft-token" }),
    });
  });

  it("throws when TMDB connection test fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          message: "Invalid TMDB access token",
        },
        false,
        401
      )
    );

    await expect(testTmdbConnection("bad-token")).rejects.toThrow(
      "Invalid TMDB access token"
    );
  });
});
