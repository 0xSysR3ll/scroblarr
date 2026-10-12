import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findAll: vi.fn(),
}));

const traktTokenManagerMocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
}));

const bingersSessionManagerMocks = vi.hoisted(() => ({
  getValidCookieJar: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  systemInfo: vi.fn(),
  systemError: vi.fn(),
  traktDebug: vi.fn(),
  traktWarn: vi.fn(),
  simklDebug: vi.fn(),
  simklWarn: vi.fn(),
  bingersDebug: vi.fn(),
  bingersWarn: vi.fn(),
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findAll = userRepositoryMocks.findAll;
  },
}));

vi.mock("@integrations/trakt/TraktTokenManager", () => ({
  TraktTokenManager: class {
    getValidAccessToken = traktTokenManagerMocks.getValidAccessToken;
  },
}));

const simklTokenManagerMocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("@integrations/simkl/SimklTokenManager", () => ({
  SimklTokenManager: class {
    getValidAccessToken = simklTokenManagerMocks.getValidAccessToken;
  },
}));

vi.mock("@integrations/bingers/BingersSessionManager", () => ({
  BingersSessionManager: class {
    getValidCookieJar = bingersSessionManagerMocks.getValidCookieJar;
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    system: {
      info: loggerMocks.systemInfo,
      error: loggerMocks.systemError,
    },
    trakt: {
      debug: loggerMocks.traktDebug,
      warn: loggerMocks.traktWarn,
    },
    simkl: {
      debug: loggerMocks.simklDebug,
      warn: loggerMocks.simklWarn,
    },
    bingers: {
      debug: loggerMocks.bingersDebug,
      warn: loggerMocks.bingersWarn,
    },
  },
}));

import { TokenRefreshService } from "./TokenRefreshService";

describe("TokenRefreshService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips refresh for AUTH V1 Simkl tokens", async () => {
    userRepositoryMocks.findAll.mockResolvedValue([
      {
        id: "simkl-user",
        simklAccessToken: "simkl-v1-token",
      },
    ]);

    const service = new TokenRefreshService();
    await service.refreshAllTokens();

    expect(traktTokenManagerMocks.getValidAccessToken).not.toHaveBeenCalled();
    expect(simklTokenManagerMocks.getValidAccessToken).not.toHaveBeenCalled();
    expect(bingersSessionManagerMocks.getValidCookieJar).not.toHaveBeenCalled();
    expect(loggerMocks.simklDebug).toHaveBeenCalledWith(
      { userId: "simkl-user" },
      "Simkl legacy token does not expire; skipping refresh"
    );
    expect(loggerMocks.systemInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        totalUsers: 1,
        simklLegacy: 1,
        simklSuccess: 0,
        simklFailed: 0,
      }),
      "Completed scheduled token refresh"
    );
  });

  it("refreshes AUTH V2 Simkl tokens", async () => {
    userRepositoryMocks.findAll.mockResolvedValue([
      {
        id: "simkl-v2-user",
        simklAccessToken: "simkl_at_token",
        simklRefreshToken: "simkl_rt_token",
      },
    ]);
    simklTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "simkl_at_token"
    );

    const service = new TokenRefreshService();
    await service.refreshAllTokens();

    expect(simklTokenManagerMocks.getValidAccessToken).toHaveBeenCalledWith(
      "simkl-v2-user"
    );
    expect(loggerMocks.systemInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        simklSuccess: 1,
        simklFailed: 0,
        simklLegacy: 0,
      }),
      "Completed scheduled token refresh"
    );
  });

  it("counts failed Simkl refreshes", async () => {
    userRepositoryMocks.findAll.mockResolvedValue([
      {
        id: "simkl-v2-user",
        simklAccessToken: "simkl_at_token",
        simklRefreshToken: "simkl_rt_token",
      },
    ]);
    simklTokenManagerMocks.getValidAccessToken.mockRejectedValue(
      new Error("refresh failed")
    );

    const service = new TokenRefreshService();
    await service.refreshAllTokens();

    expect(loggerMocks.simklWarn).toHaveBeenCalledWith(
      { userId: "simkl-v2-user", error: expect.any(Error) },
      "Failed to refresh Simkl token during scheduled refresh"
    );
    expect(loggerMocks.systemInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        simklSuccess: 0,
        simklFailed: 1,
      }),
      "Completed scheduled token refresh"
    );
  });

  it("refreshes Trakt tokens and counts failures", async () => {
    userRepositoryMocks.findAll.mockResolvedValue([
      {
        id: "trakt-ok",
        traktAccessToken: "trakt-access",
        traktRefreshToken: "trakt-refresh",
      },
      {
        id: "trakt-fail",
        traktAccessToken: "trakt-access",
        traktRefreshToken: "trakt-refresh",
      },
    ]);
    traktTokenManagerMocks.getValidAccessToken
      .mockResolvedValueOnce("trakt-access")
      .mockRejectedValueOnce(new Error("trakt down"));

    const service = new TokenRefreshService();
    await service.refreshAllTokens();

    expect(loggerMocks.systemInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        traktSuccess: 1,
        traktFailed: 1,
      }),
      "Completed scheduled token refresh"
    );
  });

  it("logs top-level refresh failures", async () => {
    userRepositoryMocks.findAll.mockRejectedValue(new Error("db down"));

    const service = new TokenRefreshService();
    await service.refreshAllTokens();

    expect(loggerMocks.systemError).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      "Error during scheduled token refresh"
    );
  });

  it("keeps Bingers sessions alive via getValidCookieJar", async () => {
    userRepositoryMocks.findAll.mockResolvedValue([
      {
        id: "bingers-user",
        bingersCookieJar: "serialized-jar",
      },
    ]);
    bingersSessionManagerMocks.getValidCookieJar.mockResolvedValue({
      session_token: { name: "session_token", value: "ok" },
    });

    const service = new TokenRefreshService();
    await service.refreshAllTokens();

    expect(bingersSessionManagerMocks.getValidCookieJar).toHaveBeenCalledWith(
      "bingers-user"
    );
    expect(loggerMocks.systemInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bingersSuccess: 1,
        bingersFailed: 0,
        bingersExpired: 0,
      }),
      "Completed scheduled token refresh"
    );
  });

  it("counts expired and failed Bingers refreshes separately", async () => {
    const { BingersApiError } =
      await import("@integrations/bingers/BingersApiError");
    userRepositoryMocks.findAll.mockResolvedValue([
      { id: "expired-user", bingersCookieJar: "jar-1" },
      { id: "failed-user", bingersCookieJar: "jar-2" },
    ]);
    bingersSessionManagerMocks.getValidCookieJar
      .mockRejectedValueOnce(
        new BingersApiError("dead", 401, { isAuthError: true })
      )
      .mockRejectedValueOnce(new Error("network down"));

    const service = new TokenRefreshService();
    await service.refreshAllTokens();

    expect(loggerMocks.systemInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bingersSuccess: 0,
        bingersExpired: 1,
        bingersFailed: 1,
      }),
      "Completed scheduled token refresh"
    );
  });
});
