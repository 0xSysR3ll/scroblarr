import { beforeEach, describe, expect, it, vi } from "vitest";

const findOneMock = vi.hoisted(() => vi.fn());

vi.mock("@config/database", () => ({
  dataSource: {
    getRepository: vi.fn(() => ({
      findOne: findOneMock,
    })),
  },
}));

import { UserRepository } from "./UserRepository";

describe("UserRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds a user by Bingers user id", async () => {
    findOneMock.mockResolvedValue({ id: "user-id", bingersUserId: "b1" });

    const repository = new UserRepository();
    await expect(repository.findByBingersUserId("b1")).resolves.toEqual({
      id: "user-id",
      bingersUserId: "b1",
    });

    expect(findOneMock).toHaveBeenCalledWith({
      where: { bingersUserId: "b1" },
    });
  });

  it("returns null when no user has that Bingers user id", async () => {
    findOneMock.mockResolvedValue(null);

    const repository = new UserRepository();
    await expect(repository.findByBingersUserId("missing")).resolves.toBeNull();
  });
});
