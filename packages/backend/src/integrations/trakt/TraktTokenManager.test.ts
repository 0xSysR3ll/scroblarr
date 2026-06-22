import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
}));

const traktOAuthMocks = vi.hoisted(() => ({
  refreshToken: vi.fn(),
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findById = userRepositoryMocks.findById;
    update = userRepositoryMocks.update;
  },
}));

vi.mock("./TraktOAuth", () => ({
  TraktOAuth: class {
    refreshToken = traktOAuthMocks.refreshToken;
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    trakt: {
      error: vi.fn(),
    },
  },
}));

import { TraktApiError } from "./TraktApiError";
import { TraktTokenManager } from "./TraktTokenManager";

const linkedUser = {
  id: "user-id",
  traktAccessToken: "access-token",
  traktRefreshToken: "refresh-token",
  traktClientId: "client-id",
  traktClientSecret: "client-secret",
  traktTokenExpiresAt: Date.now() + 60 * 60 * 1000,
};

describe("TraktTokenManager", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    userRepositoryMocks.findById.mockResolvedValue(linkedUser);
    userRepositoryMocks.update.mockResolvedValue(undefined);
    traktOAuthMocks.refreshToken.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
  });

  it("returns a still-valid stored access token", async () => {
    const manager = new TraktTokenManager();

    await expect(manager.getValidAccessToken("user-id")).resolves.toBe(
      "access-token"
    );
    expect(traktOAuthMocks.refreshToken).not.toHaveBeenCalled();
  });

  it("refreshes expired access tokens", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      ...linkedUser,
      traktTokenExpiresAt: Date.now() - 1000,
    });
    const manager = new TraktTokenManager();

    await expect(manager.getValidAccessToken("user-id")).resolves.toBe(
      "new-access-token"
    );
    expect(traktOAuthMocks.refreshToken).toHaveBeenCalledWith("refresh-token");
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        traktAccessToken: "new-access-token",
        traktRefreshToken: "new-refresh-token",
      })
    );
  });

  it("validates access tokens against Trakt", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const manager = new TraktTokenManager();

    await expect(
      manager.validateAccessToken("access-token", "client-id")
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.trakt.tv/users/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "trakt-api-key": "client-id",
        }),
      })
    );
  });

  it("reports invalid access tokens", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const manager = new TraktTokenManager();

    await expect(
      manager.validateAccessToken("bad-token", "client-id")
    ).resolves.toBe(false);
  });

  it("rethrows Trakt auth errors from refresh", async () => {
    const authError = new TraktApiError("re-auth required", 400, true);
    traktOAuthMocks.refreshToken.mockRejectedValue(authError);
    const manager = new TraktTokenManager();

    await expect(manager.refreshAccessToken("user-id")).rejects.toBe(authError);
  });

  it("wraps unexpected refresh failures", async () => {
    traktOAuthMocks.refreshToken.mockRejectedValue(new Error("network down"));
    const manager = new TraktTokenManager();

    await expect(manager.refreshAccessToken("user-id")).rejects.toThrow(
      "Failed to refresh Trakt token: network down"
    );
  });

  it("rejects missing users when resolving a valid access token", async () => {
    userRepositoryMocks.findById.mockResolvedValue(null);
    const manager = new TraktTokenManager();

    await expect(manager.getValidAccessToken("missing-user")).rejects.toThrow(
      "User missing-user not found"
    );
  });

  it("rejects users without linked Trakt accounts", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      traktAccessToken: null,
      traktRefreshToken: null,
    });
    const manager = new TraktTokenManager();

    await expect(manager.getValidAccessToken("user-id")).rejects.toThrow(
      "Trakt not linked for this user"
    );
  });

  it("rejects refresh for missing users", async () => {
    userRepositoryMocks.findById.mockResolvedValue(null);
    const manager = new TraktTokenManager();

    await expect(manager.refreshAccessToken("missing-user")).rejects.toThrow(
      "User missing-user not found"
    );
  });

  it("rejects refresh when Trakt credentials are missing", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      ...linkedUser,
      traktClientId: null,
      traktClientSecret: null,
    });
    const manager = new TraktTokenManager();

    await expect(manager.refreshAccessToken("user-id")).rejects.toThrow(
      "Trakt client ID and secret not configured"
    );
  });

  it("rejects refresh when the user disappears before OAuth lookup", async () => {
    userRepositoryMocks.findById
      .mockResolvedValueOnce(linkedUser)
      .mockResolvedValueOnce(null);
    const manager = new TraktTokenManager();

    await expect(manager.refreshAccessToken("user-id")).rejects.toThrow(
      "User user-id not found"
    );
  });

  it("rejects refresh for users without linked Trakt accounts", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      traktAccessToken: null,
      traktRefreshToken: null,
    });
    const manager = new TraktTokenManager();

    await expect(manager.refreshAccessToken("user-id")).rejects.toThrow(
      "Trakt not linked for this user"
    );
  });
});
