import { beforeEach, describe, expect, it, vi } from "vitest";

const findOneMock = vi.hoisted(() => vi.fn());
const findMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const getOneMock = vi.hoisted(() => vi.fn());
const andWhereMock = vi.hoisted(() => vi.fn());
const whereMock = vi.hoisted(() => vi.fn());
const createQueryBuilderMock = vi.hoisted(() => vi.fn());

vi.mock("@config/database", () => ({
  dataSource: {
    getRepository: vi.fn(() => ({
      findOne: findOneMock,
      find: findMock,
      create: createMock,
      save: saveMock,
      update: updateMock,
      createQueryBuilder: createQueryBuilderMock,
    })),
  },
}));

import { UserRepository } from "./UserRepository";

describe("UserRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockReturnValue({ andWhere: andWhereMock });
    andWhereMock.mockReturnValue({
      andWhere: andWhereMock,
      getOne: getOneMock,
    });
    createQueryBuilderMock.mockReturnValue({ where: whereMock });
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

  it("finds an orphaned media-browser user by display name", async () => {
    getOneMock.mockResolvedValue({
      id: "orphan-id",
      displayName: "alice",
      jellyfinUsername: null,
      plexUsername: null,
    });

    const repository = new UserRepository();
    await expect(
      repository.findOrphanedMediaBrowserUser("Alice")
    ).resolves.toEqual({
      id: "orphan-id",
      displayName: "alice",
      jellyfinUsername: null,
      plexUsername: null,
    });

    expect(createQueryBuilderMock).toHaveBeenCalledWith("user");
    expect(whereMock).toHaveBeenCalledWith("user.enabled = :enabled", {
      enabled: true,
    });
    expect(andWhereMock).toHaveBeenCalledWith("user.jellyfinUsername IS NULL");
    expect(andWhereMock).toHaveBeenCalledWith("user.plexUsername IS NULL");
    expect(andWhereMock).toHaveBeenCalledWith(
      "LOWER(user.displayName) = LOWER(:username)",
      { username: "Alice" }
    );
  });

  it("normalizes media-browser ids", () => {
    expect(UserRepository.normalizeMediaBrowserUserId("AA-BB-cc-DD")).toBe(
      "aabbccdd"
    );
  });

  it("finds Emby users by jellyfinUsername via source lookup", async () => {
    findOneMock.mockResolvedValue({
      id: "emby-user-id",
      jellyfinUsername: "emby-user",
    });

    const repository = new UserRepository();
    await expect(
      repository.findBySourceUsername("emby", "emby-user")
    ).resolves.toEqual({
      id: "emby-user-id",
      jellyfinUsername: "emby-user",
    });

    expect(findOneMock).toHaveBeenCalledWith({
      where: {
        jellyfinUsername: "emby-user",
        enabled: true,
      },
    });
  });

  it("finds users by normalized Jellyfin user id", async () => {
    getOneMock.mockResolvedValue({
      id: "user-id",
      jellyfinUserId: "aa-bb-cc",
    });

    const repository = new UserRepository();
    await expect(repository.findByJellyfinUserId("AA-BB-CC")).resolves.toEqual({
      id: "user-id",
      jellyfinUserId: "aa-bb-cc",
    });

    expect(createQueryBuilderMock).toHaveBeenCalledWith("user");
    expect(whereMock).toHaveBeenCalledWith("user.enabled = :enabled", {
      enabled: true,
    });
    expect(andWhereMock).toHaveBeenCalledWith(
      "LOWER(REPLACE(user.jellyfinUserId, '-', '')) = :normalizedId",
      { normalizedId: "aabbcc" }
    );
  });

  it("normalizes jellyfinUserId when creating users", async () => {
    createMock.mockImplementation((payload) => payload);
    saveMock.mockImplementation(async (payload) => ({
      id: "created-user-id",
      ...payload,
    }));

    const repository = new UserRepository();
    await expect(
      repository.create({
        jellyfinUsername: "emby-user",
        jellyfinUserId: "AA-BB-CC",
      })
    ).resolves.toEqual({
      id: "created-user-id",
      jellyfinUsername: "emby-user",
      jellyfinUserId: "aabbcc",
    });

    expect(createMock).toHaveBeenCalledWith({
      jellyfinUsername: "emby-user",
      jellyfinUserId: "aabbcc",
    });
  });

  it("normalizes jellyfinUserId when updating users", async () => {
    updateMock.mockResolvedValue(undefined);
    findOneMock.mockResolvedValue({
      id: "updated-user-id",
      jellyfinUserId: "aabbcc",
    });

    const repository = new UserRepository();
    await expect(
      repository.update("updated-user-id", {
        jellyfinUserId: "AA-BB-CC",
      })
    ).resolves.toEqual({
      id: "updated-user-id",
      jellyfinUserId: "aabbcc",
    });

    expect(updateMock).toHaveBeenCalledWith("updated-user-id", {
      jellyfinUserId: "aabbcc",
    });
    expect(findOneMock).toHaveBeenCalledWith({
      where: { id: "updated-user-id" },
    });
  });

  it("throws when an updated user can no longer be loaded", async () => {
    updateMock.mockResolvedValue(undefined);
    findOneMock.mockResolvedValue(null);

    const repository = new UserRepository();
    await expect(repository.update("missing-user-id", {})).rejects.toThrow(
      "User missing-user-id not found"
    );
  });

  it("normalizes jellyfinUserId when saving a user entity", async () => {
    saveMock.mockImplementation(async (payload) => payload);

    const repository = new UserRepository();
    const user = {
      id: "saved-user-id",
      jellyfinUserId: "AA-BB-CC",
    } as never;

    await expect(repository.save(user)).resolves.toEqual({
      id: "saved-user-id",
      jellyfinUserId: "aabbcc",
    });
    expect(saveMock).toHaveBeenCalledWith({
      id: "saved-user-id",
      jellyfinUserId: "aabbcc",
    });
  });
});
