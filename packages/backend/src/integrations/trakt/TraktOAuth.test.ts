import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    trakt: {
      error: vi.fn(),
    },
  },
}));

import { TRAKT_REAUTH_MESSAGE } from "./TraktApiError";
import {
  clearTraktPin,
  rememberTraktPin,
  resolveTraktDeviceCode,
  TraktOAuth,
} from "./TraktOAuth";

describe("TraktOAuth", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    clearTraktPin("user-id");
  });

  it("requests PIN authorization codes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        device_code: "device-code",
        user_code: "ABCD1234",
        verification_url: "https://trakt.tv/activate",
        expires_in: 600,
        interval: 5,
      }),
    });
    const oauth = new TraktOAuth("client-id", "client-secret");

    await expect(oauth.requestPinCode()).resolves.toEqual({
      device_code: "device-code",
      user_code: "ABCD1234",
      verification_url: "https://trakt.tv/activate",
      expires_in: 600,
      interval: 5,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.trakt.tv/oauth/device/code",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ client_id: "client-id" }),
      })
    );
  });

  it("exchanges PIN device codes for access tokens", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
      }),
    });
    const oauth = new TraktOAuth("client-id", "client-secret");

    await expect(oauth.exchangePinForToken("device-code")).resolves.toEqual(
      expect.objectContaining({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.trakt.tv/oauth/device/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          code: "device-code",
          client_id: "client-id",
          client_secret: "client-secret",
        }),
      })
    );
  });

  it("maps pending PIN poll responses", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: "authorization_pending",
        })
      ),
    });
    const oauth = new TraktOAuth("client-id", "client-secret");

    await expect(oauth.exchangePinForToken("device-code")).rejects.toThrow(
      "authorization pending"
    );
  });

  it("treats bare 400 responses as pending authorization", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue(""),
    });
    const oauth = new TraktOAuth("client-id", "client-secret");

    await expect(oauth.exchangePinForToken("device-code")).rejects.toThrow(
      "authorization pending"
    );
  });

  it("maps expired device codes from HTTP 410", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 410,
      text: vi.fn().mockResolvedValue(""),
    });
    const oauth = new TraktOAuth("client-id", "client-secret");

    await expect(oauth.exchangePinForToken("device-code")).rejects.toThrow(
      /expired/i
    );
  });

  it("maps slow-down responses from HTTP 429", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: vi.fn().mockResolvedValue(""),
    });
    const oauth = new TraktOAuth("client-id", "client-secret");

    await expect(oauth.exchangePinForToken("device-code")).rejects.toThrow(
      "slow down"
    );
  });

  it("resolves remembered PIN device codes by user code", () => {
    rememberTraktPin("user-id", {
      device_code: "device-code",
      user_code: "ABCD1234",
      expires_in: 600,
    });

    expect(resolveTraktDeviceCode("user-id", "ABCD1234")).toBe("device-code");
  });

  it("refreshes access tokens", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
      }),
    });
    const oauth = new TraktOAuth("client-id", "client-secret");

    await expect(oauth.refreshToken("refresh-token")).resolves.toEqual(
      expect.objectContaining({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      })
    );
  });

  it("throws a re-auth error when refresh is rejected", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "The provided authorization grant is invalid",
        })
      ),
    });
    const oauth = new TraktOAuth("client-id", "client-secret");

    await expect(oauth.refreshToken("dead-refresh-token")).rejects.toThrow(
      TRAKT_REAUTH_MESSAGE
    );
  });
});
