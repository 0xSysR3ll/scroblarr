import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    trakt: {
      error: vi.fn(),
    },
  },
}));

import { TRAKT_REAUTH_MESSAGE } from "./TraktApiError";
import { TraktOAuth } from "./TraktOAuth";

describe("TraktOAuth", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
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
