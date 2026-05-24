import { jsonResponse } from "@test/jsonResponse";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAuthHeaders } from "./common";
import {
  getSettings,
  removeJellyfinServer,
  removePlexServer,
  updateSettings,
} from "./settings";

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

    const expectedHeaders = getAuthHeaders();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/settings", {
      headers: expectedHeaders,
    });
  });

  it("updates settings with a PATCH body", async () => {
    const settings = { syncHistoryLimit: "1000" };
    fetchMock.mockResolvedValueOnce(jsonResponse(settings));

    await expect(updateSettings(settings)).resolves.toEqual(settings);

    const expectedHeaders = getAuthHeaders();
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

    const expectedHeaders = getAuthHeaders();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/settings/plex", {
      method: "DELETE",
      headers: expectedHeaders,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/settings/jellyfin", {
      method: "DELETE",
      headers: expectedHeaders,
    });
  });

  it("throws on failed settings updates", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(updateSettings({ apiKey: "secret" })).rejects.toThrow(
      "Failed to update settings"
    );
  });
});
