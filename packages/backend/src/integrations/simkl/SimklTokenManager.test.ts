import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
}));

const simklOAuthMocks = vi.hoisted(() => ({
  refreshToken: vi.fn(),
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findById = userRepositoryMocks.findById;
    update = userRepositoryMocks.update;
  },
}));

vi.mock("./SimklOAuth", () => ({
  SimklOAuth: class {
    refreshToken = simklOAuthMocks.refreshToken;
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    simkl: {
      error: vi.fn(),
    },
  },
}));

import {
  clearInFlightSimklRefreshesForTests,
  SimklTokenManager,
} from "./SimklTokenManager";

describe("SimklTokenManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearInFlightSimklRefreshesForTests();
  });

  it("returns stored AUTH V1 tokens without refreshing", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      simklAccessToken:
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      simklClientId: "client-id",
    });
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).resolves.toBe(
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    );
    expect(simklOAuthMocks.refreshToken).not.toHaveBeenCalled();
  });

  it("returns unexpired V2 tokens without refreshing", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      simklAccessToken: "simkl_at_access_token_value_here_xx",
      simklRefreshToken: "simkl_rt_refresh_token_value_here",
      simklTokenExpiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
      simklClientId: "client-id",
    });
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).resolves.toBe(
      "simkl_at_access_token_value_here_xx"
    );
    expect(simklOAuthMocks.refreshToken).not.toHaveBeenCalled();
  });

  it("refreshes V2 tokens near expiry", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      simklAccessToken: "simkl_at_access_token_value_here_xx",
      simklRefreshToken: "simkl_rt_refresh_token_value_here",
      simklTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      simklClientId: "client-id",
    });
    simklOAuthMocks.refreshToken.mockResolvedValue({
      accessToken: "simkl_at_new_access_token_value_xx",
      refreshToken: "simkl_rt_refresh_token_value_here",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).resolves.toBe(
      "simkl_at_new_access_token_value_xx"
    );
    expect(simklOAuthMocks.refreshToken).toHaveBeenCalledWith(
      "simkl_rt_refresh_token_value_here"
    );
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccessToken: "simkl_at_new_access_token_value_xx",
        simklRefreshToken: "simkl_rt_refresh_token_value_here",
      })
    );
  });

  it("keeps the existing refresh token when the refresh response omits it", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      simklAccessToken: "simkl_at_access_token_value_here_xx",
      simklRefreshToken: "simkl_rt_refresh_token_value_here",
      simklTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      simklClientId: "client-id",
    });
    simklOAuthMocks.refreshToken.mockResolvedValue({
      accessToken: "simkl_at_new_access_token_value_xx",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    const manager = new SimklTokenManager();

    await manager.getValidAccessToken("user-id");
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("user-id", {
      simklAccessToken: "simkl_at_new_access_token_value_xx",
      simklTokenExpiresAt: expect.any(Number),
    });
  });

  it("surfaces refresh failures", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      simklAccessToken: "simkl_at_access_token_value_here_xx",
      simklRefreshToken: "simkl_rt_refresh_token_value_here",
      simklTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      simklClientId: "client-id",
    });
    simklOAuthMocks.refreshToken.mockRejectedValue(new Error("refresh failed"));
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).rejects.toThrow(
      "Failed to refresh Simkl token: refresh failed"
    );
  });

  it("shares one in-flight refresh across concurrent callers", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      simklAccessToken: "simkl_at_access_token_value_here_xx",
      simklRefreshToken: "simkl_rt_refresh_token_value_here",
      simklTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      simklClientId: "client-id",
    });

    let resolveRefresh:
      | ((tokens: {
          accessToken: string;
          refreshToken: string;
          expiresAt: number;
        }) => void)
      | undefined;
    simklOAuthMocks.refreshToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        })
    );

    const managerA = new SimklTokenManager();
    const managerB = new SimklTokenManager();
    const refreshA = managerA.refreshAccessToken("user-id");
    const refreshB = managerB.refreshAccessToken("user-id");

    await vi.waitFor(() => {
      expect(simklOAuthMocks.refreshToken).toHaveBeenCalledTimes(1);
    });
    resolveRefresh?.({
      accessToken: "simkl_at_new_access_token_value_xx",
      refreshToken: "simkl_rt_refresh_token_value_here",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    await expect(Promise.all([refreshA, refreshB])).resolves.toEqual([
      "simkl_at_new_access_token_value_xx",
      "simkl_at_new_access_token_value_xx",
    ]);
    expect(simklOAuthMocks.refreshToken).toHaveBeenCalledTimes(1);
    expect(userRepositoryMocks.update).toHaveBeenCalledTimes(1);
  });

  it("rejects refresh when the user disappears mid-flight", async () => {
    userRepositoryMocks.findById
      .mockResolvedValueOnce({
        id: "user-id",
        simklAccessToken: "simkl_at_access_token_value_here_xx",
        simklRefreshToken: "simkl_rt_refresh_token_value_here",
        simklTokenExpiresAt: Date.now() + 60 * 60 * 1000,
        simklClientId: "client-id",
      })
      .mockResolvedValueOnce(null);
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).rejects.toThrow(
      "User user-id not found"
    );
  });

  it("rejects refresh when Simkl is no longer linked", async () => {
    userRepositoryMocks.findById
      .mockResolvedValueOnce({
        id: "user-id",
        simklAccessToken: "simkl_at_access_token_value_here_xx",
        simklRefreshToken: "simkl_rt_refresh_token_value_here",
        simklTokenExpiresAt: Date.now() + 60 * 60 * 1000,
        simklClientId: "client-id",
      })
      .mockResolvedValueOnce({
        id: "user-id",
        simklAccessToken: null,
        simklRefreshToken: null,
        simklClientId: "client-id",
      });
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).rejects.toThrow(
      "Simkl not linked for this user"
    );
  });

  it("rejects refresh when the client ID is missing", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      simklAccessToken: "simkl_at_access_token_value_here_xx",
      simklRefreshToken: "simkl_rt_refresh_token_value_here",
      simklTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      simklClientId: null,
    });
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).rejects.toThrow(
      "Simkl client ID not configured"
    );
  });

  it("rejects refresh when the user disappears before OAuth setup", async () => {
    userRepositoryMocks.findById
      .mockResolvedValueOnce({
        id: "user-id",
        simklAccessToken: "simkl_at_access_token_value_here_xx",
        simklRefreshToken: "simkl_rt_refresh_token_value_here",
        simklTokenExpiresAt: Date.now() + 60 * 60 * 1000,
        simklClientId: "client-id",
      })
      .mockResolvedValueOnce({
        id: "user-id",
        simklAccessToken: "simkl_at_access_token_value_here_xx",
        simklRefreshToken: "simkl_rt_refresh_token_value_here",
        simklClientId: "client-id",
      })
      .mockResolvedValueOnce(null);
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).rejects.toThrow(
      "Failed to refresh Simkl token: User user-id not found"
    );
  });

  it("wraps non-Error refresh failures", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      simklAccessToken: "simkl_at_access_token_value_here_xx",
      simklRefreshToken: "simkl_rt_refresh_token_value_here",
      simklTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      simklClientId: "client-id",
    });
    simklOAuthMocks.refreshToken.mockRejectedValue("boom");
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).rejects.toThrow(
      "Failed to refresh Simkl token: Unknown error"
    );
  });

  it("rejects users without linked Simkl accounts", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      simklAccessToken: null,
    });
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).rejects.toThrow(
      "Simkl not linked for this user"
    );
  });

  it("rejects missing users", async () => {
    userRepositoryMocks.findById.mockResolvedValue(null);
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("missing-user")).rejects.toThrow(
      "User missing-user not found"
    );
  });
});
