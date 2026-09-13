import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlexOAuth, PlexPinNotFoundError } from "./PlexOAuth";

describe("PlexOAuth.pollPinAuthToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null while the pin is pending", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ authToken: null }),
    } as Response);

    const token = await new PlexOAuth("client-id").pollPinAuthToken(99);
    expect(token).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "https://plex.tv/api/v2/pins/99",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Plex-Client-Identifier": "client-id",
        }),
      })
    );
  });

  it("returns the auth token when authorized", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ authToken: "plex-token" }),
    } as Response);

    await expect(new PlexOAuth("client-id").pollPinAuthToken(99)).resolves.toBe(
      "plex-token"
    );
  });

  it("throws PlexPinNotFoundError on 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "",
    } as Response);

    await expect(
      new PlexOAuth("client-id").pollPinAuthToken(99)
    ).rejects.toBeInstanceOf(PlexPinNotFoundError);
  });

  it("throws a generic error for other non-OK responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "upstream down",
    } as Response);

    await expect(
      new PlexOAuth("client-id").pollPinAuthToken(99)
    ).rejects.toThrow("Failed to poll Plex pin: 503 Service Unavailable");
  });
});

describe("PlexPinNotFoundError", () => {
  it("uses the default message when none is provided", () => {
    const error = new PlexPinNotFoundError();
    expect(error.name).toBe("PlexPinNotFoundError");
    expect(error.message).toBe("Plex PIN not found or expired");
  });
});
