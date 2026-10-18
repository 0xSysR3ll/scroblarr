import { getAppVersionForClients } from "@utils/appVersion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PlexOAuth,
  PlexPinNotFoundError,
  redactUrlUserinfo,
} from "./PlexOAuth";

describe("redactUrlUserinfo", () => {
  it("redacts credentials in the authority section", () => {
    expect(redactUrlUserinfo("https://user:secret@plex.local:32400")).toBe(
      "https://***@plex.local:32400"
    );
    expect(
      redactUrlUserinfo("https://user:secret@plex.local:32400/library")
    ).toBe("https://***@plex.local:32400/library");
  });

  it("leaves URLs without userinfo unchanged", () => {
    expect(redactUrlUserinfo("https://plex.local:32400")).toBe(
      "https://plex.local:32400"
    );
    expect(redactUrlUserinfo("not-a-url")).toBe("not-a-url");
    expect(redactUrlUserinfo("https://plex.local/path@file")).toBe(
      "https://plex.local/path@file"
    );
  });
});

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
          "X-Plex-Version": getAppVersionForClients(),
        }),
      })
    );
  });

  it("generates a stable client identifier when none is provided", () => {
    const oauth = new PlexOAuth();
    expect(oauth.getClientIdentifier()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("falls back to a fixed client identifier when crypto.randomUUID is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });
    try {
      expect(new PlexOAuth().getClientIdentifier()).toBe("scroblarr-client");
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it("rejects non-OK pin creation responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => "upstream failed",
    } as unknown as Response);

    await expect(new PlexOAuth("client-id").createPin()).rejects.toThrow(
      "Failed to create Plex OAuth pin: 502 Bad Gateway - upstream failed"
    );
  });

  it("rejects pin creation responses that are not JSON", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "<html>oops</html>",
    } as unknown as Response);

    await expect(new PlexOAuth("client-id").createPin()).rejects.toThrow(
      "Expected JSON but got text/html"
    );
  });

  it("rejects pin creation responses with a missing content type", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => "raw body",
    } as unknown as Response);

    await expect(new PlexOAuth("client-id").createPin()).rejects.toThrow(
      "Expected JSON but got null"
    );
  });
});

describe("PlexOAuth.getAuthUrl", () => {
  it("includes the app version in the Plex auth context", () => {
    const url = new PlexOAuth("client-id").getAuthUrl("PINCODE", "client-id");
    expect(url.startsWith("https://app.plex.tv/auth/#!?")).toBe(true);

    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(params.get("clientID")).toBe("client-id");
    expect(params.get("code")).toBe("PINCODE");
    expect(params.get("context[device][product]")).toBe("Scroblarr");
    expect(params.get("context[device][version]")).toBe(
      getAppVersionForClients()
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

describe("PlexOAuth.getUserInfo", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns profile fields from a JSON response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        username: "plex-user",
        email: "plex@example.com",
        thumb: "https://img",
      }),
    } as unknown as Response);

    await expect(
      new PlexOAuth("client-id").getUserInfo("token")
    ).resolves.toEqual({
      username: "plex-user",
      email: "plex@example.com",
      thumb: "https://img",
    });
  });

  it("rejects non-JSON user info responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "text/plain" },
      text: async () => "not json",
    } as unknown as Response);

    await expect(
      new PlexOAuth("client-id").getUserInfo("token")
    ).rejects.toThrow("Expected JSON but got text/plain");
  });

  it("logs and rejects unauthenticated user info fetches", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "nope",
    } as unknown as Response);

    await expect(
      new PlexOAuth("client-id").getUserInfo("token")
    ).rejects.toThrow("Failed to get user info: 401 Unauthorized");
  });

  it("logs and rejects other user info failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "boom",
    } as unknown as Response);

    await expect(
      new PlexOAuth("client-id").getUserInfo("token")
    ).rejects.toThrow("Failed to get user info: 500 Internal Server Error");
  });
});

describe("PlexOAuth.getServers", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects when both resource fetches fail", async () => {
    const failed = {
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "down",
    } as unknown as Response;
    vi.mocked(fetch)
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(failed);

    await expect(
      new PlexOAuth("client-id").getServers("token")
    ).rejects.toThrow("Failed to fetch Plex servers");
  });
});

describe("PlexOAuth.getServerUsers", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects failed server user fetches and redacts credentials in logs", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "denied",
    } as unknown as Response);

    await expect(
      new PlexOAuth("client-id").getServerUsers(
        "token",
        "https://user:secret@plex.local:32400"
      )
    ).rejects.toThrow("Failed to get server users: 403 Forbidden - denied");
  });
});
