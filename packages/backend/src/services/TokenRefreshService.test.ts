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

  it("counts linked Simkl accounts without refreshing them", async () => {
    userRepositoryMocks.findAll.mockResolvedValue([
      {
        id: "simkl-user",
        simklAccessToken: "simkl-token",
      },
    ]);

    const service = new TokenRefreshService();
    await service.refreshAllTokens();

    expect(traktTokenManagerMocks.getValidAccessToken).not.toHaveBeenCalled();
    expect(bingersSessionManagerMocks.getValidCookieJar).not.toHaveBeenCalled();
    expect(loggerMocks.simklDebug).toHaveBeenCalledWith(
      { userId: "simkl-user" },
      "Simkl token does not expire; skipping refresh"
    );
    expect(loggerMocks.systemInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        totalUsers: 1,
        simklLinked: 1,
      }),
      "Completed scheduled token refresh"
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
