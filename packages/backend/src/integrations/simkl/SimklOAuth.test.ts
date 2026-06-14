import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    simkl: {
      error: vi.fn(),
    },
  },
}));

import { SimklOAuth } from "./SimklOAuth";

describe("SimklOAuth", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("builds an authorization URL with redirect URI and state", () => {
    const oauth = new SimklOAuth("client-id", "client-secret");
    const authUrl = new URL(
      oauth.getAuthUrl("urn:ietf:wg:oauth:2.0:oob", "state")
    );

    expect(authUrl.origin).toBe("https://simkl.com");
    expect(authUrl.pathname).toBe("/oauth/authorize");
    expect(authUrl.searchParams.get("response_type")).toBe("code");
    expect(authUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      "urn:ietf:wg:oauth:2.0:oob"
    );
    expect(authUrl.searchParams.get("state")).toBe("state");
  });

  it("exchanges authorization codes for access tokens", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "access-token",
        token_type: "bearer",
        scope: "public",
      }),
    });
    const oauth = new SimklOAuth("client-id", "client-secret");

    await expect(
      oauth.exchangeCodeForToken("code", "urn:ietf:wg:oauth:2.0:oob")
    ).resolves.toEqual({ accessToken: "access-token" });

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    const actualUrl = new URL(url);
    expect(actualUrl.pathname).toBe("/oauth/token");
    expect(actualUrl.searchParams.get("client_id")).toBe("client-id");
    expect(actualUrl.searchParams.get("app-name")).toBe("scroblarr");
    expect(actualUrl.searchParams.get("app-version")).toBe("1.0.0");
    expect(request.headers).toEqual(
      expect.objectContaining({
        "simkl-api-key": "client-id",
        "User-Agent": "Scroblarr/1.0.0",
      })
    );
    expect(JSON.parse(request.body)).toEqual({
      code: "code",
      client_id: "client-id",
      client_secret: "client-secret",
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
      grant_type: "authorization_code",
    });
  });

  it("requires a client secret for authorization code exchange", async () => {
    const oauth = new SimklOAuth("client-id");

    await expect(
      oauth.exchangeCodeForToken("code", "urn:ietf:wg:oauth:2.0:oob")
    ).rejects.toThrow("Simkl client secret is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces token exchange failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "grant_error" })),
    });
    const oauth = new SimklOAuth("client-id", "client-secret");

    await expect(
      oauth.exchangeCodeForToken("bad-code", "urn:ietf:wg:oauth:2.0:oob")
    ).rejects.toThrow("Failed to exchange Simkl authorization code: 401");
  });

  it("requests PIN codes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        result: "OK",
        device_code: "device-code",
        user_code: "ABCDE",
        verification_url: "https://simkl.com/pin/",
        expires_in: 900,
        interval: 5,
      }),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.requestPinCode()).resolves.toEqual({
      result: "OK",
      device_code: "device-code",
      user_code: "ABCDE",
      verification_url: "https://simkl.com/pin/",
      expires_in: 900,
      interval: 5,
      message: "",
    });

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string> },
    ];
    const actualUrl = new URL(url);
    expect(actualUrl.pathname).toBe("/oauth/pin");
    expect(actualUrl.searchParams.get("client_id")).toBe("client-id");
    expect(request.method).toBe("GET");
    expect(request.headers).toEqual(
      expect.objectContaining({ "simkl-api-key": "client-id" })
    );
  });

  it("surfaces PIN request timeouts", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.requestPinCode()).rejects.toThrow(
      "Simkl PIN code request timed out"
    );
  });

  it("rejects invalid PIN code responses", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        result: "KO",
        message: "invalid client",
      }),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.requestPinCode()).rejects.toThrow("invalid client");
  });

  it("exchanges approved PIN codes for access tokens", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        result: "OK",
        access_token: "access-token",
      }),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.exchangePinForToken("AB CD")).resolves.toEqual({
      accessToken: "access-token",
    });

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { method: string },
    ];
    const actualUrl = new URL(url);
    expect(actualUrl.pathname).toBe("/oauth/pin/AB%20CD");
    expect(request.method).toBe("GET");
  });

  it("surfaces pending PIN authorization responses", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        result: "KO",
        message: "Authorization pending",
      }),
    });
    const oauth = new SimklOAuth("client-id");

    await expect(oauth.exchangePinForToken("ABCDE")).rejects.toThrow(
      "Authorization pending"
    );
  });
});
