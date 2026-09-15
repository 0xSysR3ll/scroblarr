import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlexOAuth, PlexPinNotFoundError } from "./PlexOAuth";

describe("PlexOAuth.createPin", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a pin with a request timeout", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ id: 42, code: "ABCD" }),
    } as unknown as Response);

    await expect(new PlexOAuth("client-id").createPin()).resolves.toEqual({
      id: 42,
      code: "ABCD",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://plex.tv/api/v2/pins?strong=true",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          "X-Plex-Client-Identifier": "client-id",
        }),
      })
    );
  });
});

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
        signal: expect.any(AbortSignal),
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

describe("PlexOAuth.getTokenFromPin", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null while the pin is pending", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ authToken: null }),
    } as Response);

    await expect(
      new PlexOAuth("client-id").getTokenFromPin(99)
    ).resolves.toBeNull();
  });

  it("returns user token data when the pin is authorized", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ authToken: "plex-token" }),
    } as Response);

    const plexOAuth = new PlexOAuth("client-id");
    vi.spyOn(plexOAuth, "getUserInfo").mockResolvedValue({
      username: "plex-user",
      email: "plex@example.com",
      thumb: "https://img",
    });

    await expect(plexOAuth.getTokenFromPin(99)).resolves.toEqual({
      accessToken: "plex-token",
      username: "plex-user",
      email: "plex@example.com",
      thumb: "https://img",
    });
  });
});

describe("PlexPinNotFoundError", () => {
  it("uses the default message when none is provided", () => {
    const error = new PlexPinNotFoundError();
    expect(error.name).toBe("PlexPinNotFoundError");
    expect(error.message).toBe("Plex PIN not found or expired");
  });
});
