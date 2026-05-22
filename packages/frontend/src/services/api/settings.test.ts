import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSettings,
  removeJellyfinServer,
  removePlexServer,
  updateSettings,
} from "./settings";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

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
      headers: { "Content-Type": "application/json" },
    });
  });

  it("updates settings with a PATCH body", async () => {
    const settings = { syncHistoryLimit: "1000" };
    fetchMock.mockResolvedValueOnce(jsonResponse(settings));

    await expect(updateSettings(settings)).resolves.toEqual(settings);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/settings/jellyfin", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("throws on failed settings updates", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(updateSettings({ apiKey: "secret" })).rejects.toThrow(
      "Failed to update settings"
    );
  });
});
