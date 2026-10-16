import { getAppVersionForClients, getUserAgent } from "@utils/appVersion";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    simkl: {
      error: vi.fn(),
      warn: vi.fn(),
    },
  },
}));

import {
  clearSimklDevice,
  rememberSimklDevice,
  resolveSimklDeviceCode,
  SimklOAuth,
} from "./SimklOAuth";

describe("SimklOAuth", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    clearSimklDevice("user-id");
  });

  it("requests device codes via AUTH V2", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        device_code: "device-code",
        user_code: "BDWP-HQPK",
        verification_uri: "https://simkl.com/pin",
        verification_uri_complete: "https://simkl.com/pin?user_code=BDWP-HQPK",
        expires_in: 900,
        interval: 5,
      }),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.requestPinCode()).resolves.toEqual({
      device_code: "device-code",
      user_code: "BDWP-HQPK",
      verification_uri: "https://simkl.com/pin",
      verification_uri_complete: "https://simkl.com/pin?user_code=BDWP-HQPK",
      expires_in: 900,
      interval: 5,
    });

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      {
        method: string;
        headers: Record<string, string>;
        body: URLSearchParams;
      },
    ];
    const actualUrl = new URL(url);
    expect(actualUrl.pathname).toBe("/oauth2/device");
    expect(actualUrl.searchParams.get("client_id")).toBe("client-id");
    expect(actualUrl.searchParams.get("app-name")).toBe("scroblarr");
    expect(actualUrl.searchParams.get("app-version")).toBe(
      getAppVersionForClients()
    );
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual(
      expect.objectContaining({
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": getUserAgent(),
        "simkl-api-key": "client-id",
      })
    );
    expect(request.body.toString()).toContain("client_id=client-id");
    expect(request.body.toString()).toContain(
      "scope=media%3Aread+media%3Awrite"
    );
  });

  it("surfaces device code request timeouts", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.requestPinCode()).rejects.toThrow(
      "Simkl device code request timed out"
    );
  });

  it("rejects AUTH V1 client IDs with a clear message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: "invalid_client",
          error_description: "This client_id is not enabled for OAuth 2.0",
        })
      ),
    });
    const oauth = new SimklOAuth("v1-client-id");

    await expect(oauth.requestPinCode()).rejects.toThrow(
      "not supported for Simkl linking"
    );
  });

  it("surfaces generic device code request failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: "server_error",
          error_description: "temporary outage",
        })
      ),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.requestPinCode()).rejects.toThrow("temporary outage");
  });

  it("falls back to status text when device request errors are unparseable", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: vi.fn().mockResolvedValue("bad gateway"),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.requestPinCode()).rejects.toThrow(
      "Failed to request Simkl device code: 502 - bad gateway"
    );
  });

  it("rejects incomplete device code responses", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        device_code: "device-code",
      }),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.requestPinCode()).rejects.toThrow(
      "Simkl device response did not include a user code"
    );
  });

  it("exchanges approved device codes for V2 tokens", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "simkl_at_access",
        token_type: "Bearer",
        expires_in: 604800,
        refresh_token: "simkl_rt_refresh",
        scope: "media:read media:write",
      }),
    });
    const oauth = new SimklOAuth("client-id");

    const tokens = await oauth.exchangePinForToken("device-code");
    expect(tokens.accessToken).toBe("simkl_at_access");
    expect(tokens.refreshToken).toBe("simkl_rt_refresh");
    expect(tokens.scope).toBe("media:read media:write");
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body: URLSearchParams },
    ];
    const actualUrl = new URL(url);
    expect(actualUrl.pathname).toBe("/oauth2/token");
    expect(request.method).toBe("POST");
    expect(request.body.toString()).toContain(
      "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"
    );
    expect(request.body.toString()).toContain("device_code=device-code");
  });

  it("warns when the granted scope is missing media:write", async () => {
    const { logger } = await import("@utils/logger");
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "simkl_at_access",
        token_type: "Bearer",
        expires_in: 604800,
        refresh_token: "simkl_rt_refresh",
        scope: "media:read",
      }),
    });
    const oauth = new SimklOAuth("client-id");

    await oauth.exchangePinForToken("device-code");
    expect(logger.simkl.warn).toHaveBeenCalledWith(
      { scope: "media:read" },
      "Simkl token is missing media:write; scrobbling may fail"
    );
  });

  it("rejects token responses without an access token", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        token_type: "Bearer",
        refresh_token: "simkl_rt_refresh",
      }),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.exchangePinForToken("device-code")).rejects.toThrow(
      "did not include an access token"
    );
  });

  it("surfaces pending and slow-down device poll responses", async () => {
    const oauth = new SimklOAuth("client-id");

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: vi
        .fn()
        .mockResolvedValue(JSON.stringify({ error: "authorization_pending" })),
    });
    await expect(oauth.exchangePinForToken("device-code")).rejects.toThrow(
      "authorization pending"
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "slow_down" })),
    });
    await expect(oauth.exchangePinForToken("device-code")).rejects.toThrow(
      "slow down"
    );
  });

  it("surfaces expired device codes", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi
        .fn()
        .mockResolvedValue(JSON.stringify({ error: "expired_token" })),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.exchangePinForToken("device-code")).rejects.toThrow(
      "Simkl device code expired"
    );
  });

  it("rejects invalid clients while polling for tokens", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi
        .fn()
        .mockResolvedValue(JSON.stringify({ error: "invalid_client" })),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.exchangePinForToken("device-code")).rejects.toThrow(
      "not supported for Simkl linking"
    );
  });

  it("surfaces generic device token poll failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("boom"),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.exchangePinForToken("device-code")).rejects.toThrow(
      "Failed to poll Simkl device token: 500 - boom"
    );
  });

  it("refreshes V2 access tokens", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "simkl_at_new",
        token_type: "Bearer",
        expires_in: 604800,
        refresh_token: "simkl_rt_refresh",
        scope: "media:read media:write",
      }),
    });
    const oauth = new SimklOAuth("client-id");

    const tokens = await oauth.refreshToken("simkl_rt_refresh");
    expect(tokens.accessToken).toBe("simkl_at_new");
    expect(tokens.refreshToken).toBe("simkl_rt_refresh");

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { body: URLSearchParams },
    ];
    expect(new URL(url).pathname).toBe("/oauth2/token");
    expect(request.body.toString()).toContain("grant_type=refresh_token");
    expect(request.body.toString()).toContain("refresh_token=simkl_rt_refresh");
  });

  it("revokes tokens via AUTH V2", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(""),
    });
    const oauth = new SimklOAuth("client-id");

    await oauth.revokeToken("simkl_rt_refresh");

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body: URLSearchParams },
    ];
    expect(new URL(url).pathname).toBe("/oauth2/revoke");
    expect(request.method).toBe("POST");
    expect(request.body.toString()).toContain("token=simkl_rt_refresh");
  });

  it("surfaces refresh token failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue("invalid"),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.refreshToken("simkl_rt_refresh")).rejects.toThrow(
      "Failed to refresh Simkl token: 401 - invalid"
    );
  });

  it("warns when revoke returns a non-OK status", async () => {
    const { logger } = await import("@utils/logger");
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("down"),
    });
    const oauth = new SimklOAuth("client-id");

    await oauth.revokeToken("simkl_rt_refresh");
    expect(logger.simkl.warn).toHaveBeenCalledWith(
      { status: 500, errorText: "down" },
      "Simkl token revoke returned a non-OK status"
    );
  });

  it("remembers and resolves pending device codes", () => {
    rememberSimklDevice("user-id", {
      device_code: "device-code",
      user_code: "BDWP-HQPK",
      expires_in: 900,
    });

    expect(resolveSimklDeviceCode("user-id", "BDWP-HQPK")).toBe("device-code");
    expect(() => resolveSimklDeviceCode("user-id", "WRONG")).toThrow(
      "does not match"
    );
  });
});
