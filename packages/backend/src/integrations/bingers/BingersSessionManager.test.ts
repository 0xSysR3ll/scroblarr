import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findById = userRepositoryMocks.findById;
    update = userRepositoryMocks.update;
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    bingers: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

import { BingersApiError } from "./BingersApiError";
import { BingersAuth } from "./BingersAuth";
import { BingersSessionManager } from "./BingersSessionManager";
import { serializeCookieJar } from "./cookieJar";

describe("BingersSessionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists refreshed session cookies and profile image on success", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: "user@example.com",
    });

    authMocks.getSession.mockResolvedValue({
      session: { id: "s1" },
      user: {
        id: "b1",
        email: "user@example.com",
        name: "User",
        username: "handle",
        image: "https://img.example/avatar.png",
      },
      expiresAt: 1_800_000_000_000,
      cookieJar: {
        session_token: { name: "session_token", value: "new" },
      },
    });

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    const jar = await manager.getValidCookieJar("user-id");
    expect(jar.session_token?.value).toBe("new");
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        bingersCookieJar: serializeCookieJar({
          session_token: { name: "session_token", value: "new" },
        }),
        bingersSessionExpiresAt: 1_800_000_000_000,
        bingersEmail: "user@example.com",
        bingersUserId: "b1",
        bingersUsername: "handle",
        bingersThumb: "https://img.example/avatar.png",
      })
    );
  });

  it("clears jar and reports needsReauthorization when session is dead", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: "user@example.com",
      bingersUsername: "User",
      bingersUserId: "b1",
      bingersThumb: "https://img.example/avatar.png",
    });
    authMocks.getSession.mockRejectedValue(
      new BingersApiError("dead", 401, { isAuthError: true })
    );

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    const status = await manager.validateAndRefresh("user-id");
    expect(status).toEqual({
      linked: false,
      needsReauthorization: true,
      username: "User",
      image: "https://img.example/avatar.png",
    });
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        bingersCookieJar: null,
        bingersSessionExpiresAt: null,
        bingersEmail: "user@example.com",
        bingersThumb: "https://img.example/avatar.png",
      })
    );
  });

  it("reports needsReauthorization when jar was already cleared but profile remains", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: null,
      bingersEmail: "user@example.com",
      bingersUsername: "User",
      bingersUserId: "b1",
      bingersThumb: "https://img.example/avatar.png",
    });

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await expect(manager.validateAndRefresh("user-id")).resolves.toEqual({
      linked: false,
      needsReauthorization: true,
      username: "User",
      image: "https://img.example/avatar.png",
    });
    expect(authMocks.getSession).not.toHaveBeenCalled();
  });

  it("reports unlinked with no reauth when never linked", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: null,
      bingersEmail: null,
      bingersUsername: null,
      bingersUserId: null,
      bingersThumb: null,
    });

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await expect(manager.validateAndRefresh("user-id")).resolves.toEqual({
      linked: false,
      needsReauthorization: false,
      username: null,
      image: null,
    });
  });
});
