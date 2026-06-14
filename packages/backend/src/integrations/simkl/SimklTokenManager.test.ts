import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findById = userRepositoryMocks.findById;
  },
}));

import { SimklTokenManager } from "./SimklTokenManager";

describe("SimklTokenManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the stored Simkl access token", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      simklAccessToken: "access-token",
    });
    const manager = new SimklTokenManager();

    await expect(manager.getValidAccessToken("user-id")).resolves.toBe(
      "access-token"
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
});
