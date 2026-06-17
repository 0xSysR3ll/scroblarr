import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findAll: vi.fn(),
}));

const traktTokenManagerMocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
}));

const tvtimeTokenManagerMocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  systemInfo: vi.fn(),
  systemError: vi.fn(),
  traktDebug: vi.fn(),
  traktWarn: vi.fn(),
  tvtimeDebug: vi.fn(),
  tvtimeWarn: vi.fn(),
  simklDebug: vi.fn(),
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

vi.mock("@integrations/tvtime/TVTimeTokenManager", () => ({
  TVTimeTokenManager: class {
    getValidAccessToken = tvtimeTokenManagerMocks.getValidAccessToken;
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
    tvtime: {
      debug: loggerMocks.tvtimeDebug,
      warn: loggerMocks.tvtimeWarn,
    },
    simkl: {
      debug: loggerMocks.simklDebug,
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
    expect(tvtimeTokenManagerMocks.getValidAccessToken).not.toHaveBeenCalled();
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
});
