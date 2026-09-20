import { beforeEach, describe, expect, it, vi } from "vitest";

const findOneMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());

vi.mock("@config/database", () => ({
  dataSource: {
    getRepository: vi.fn(() => ({
      findOne: findOneMock,
      create: createMock,
      save: saveMock,
      delete: deleteMock,
    })),
  },
}));

import { SessionRepository } from "./SessionRepository";

describe("SessionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the user relation when resolving a session token", async () => {
    findOneMock.mockResolvedValue({
      token: "session-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "user-1", enabled: true, plexUsername: "plex-user" },
    });

    const repository = new SessionRepository();
    await expect(repository.findUserByToken("session-token")).resolves.toEqual({
      id: "user-1",
      enabled: true,
      plexUsername: "plex-user",
    });

    expect(findOneMock).toHaveBeenCalledWith({
      where: { token: "session-token" },
      relations: { user: true },
    });
  });

  it("returns null for missing, expired, or disabled sessions", async () => {
    const repository = new SessionRepository();

    findOneMock.mockResolvedValueOnce(null);
    await expect(repository.findUserByToken("missing")).resolves.toBeNull();

    findOneMock.mockResolvedValueOnce({
      token: "expired",
      expiresAt: Date.now() - 1,
      user: { id: "user-1", enabled: true },
    });
    await expect(repository.findUserByToken("expired")).resolves.toBeNull();

    findOneMock.mockResolvedValueOnce({
      token: "disabled",
      expiresAt: Date.now() + 60_000,
      user: { id: "user-2", enabled: false },
    });
    await expect(repository.findUserByToken("disabled")).resolves.toBeNull();
  });
});
