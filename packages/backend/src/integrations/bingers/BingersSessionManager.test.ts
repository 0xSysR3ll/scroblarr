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
    userRepositoryMocks.update.mockReset();
    userRepositoryMocks.update.mockResolvedValue(undefined);
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

  it("returns linked status after a successful validateAndRefresh", async () => {
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

    await expect(manager.validateAndRefresh("user-id")).resolves.toEqual({
      linked: true,
      needsReauthorization: false,
      username: "handle",
      image: "https://img.example/avatar.png",
    });
  });

  it("accepts better-auth prefixed session cookies during validateAndRefresh", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        "better-auth.session_token": {
          name: "better-auth.session_token",
          value: "old",
        },
      }),
      bingersEmail: "user@example.com",
    });
    authMocks.getSession.mockResolvedValue({
      session: { id: "s1" },
      user: {
        id: "b1",
        email: "user@example.com",
        username: "handle",
        image: "https://img.example/avatar.png",
      },
      cookieJar: {
        "better-auth.session_token": {
          name: "better-auth.session_token",
          value: "new",
        },
      },
    });

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await expect(manager.validateAndRefresh("user-id")).resolves.toEqual({
      linked: true,
      needsReauthorization: false,
      username: "handle",
      image: "https://img.example/avatar.png",
    });
    expect(authMocks.getSession).toHaveBeenCalled();
  });

  it("clears the jar on auth errors from getValidCookieJar", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: "user@example.com",
      bingersUsername: "User",
      bingersUserId: "b1",
      bingersThumb: null,
    });
    authMocks.getSession.mockRejectedValue(
      new BingersApiError("dead", 401, { isAuthError: true })
    );

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await expect(manager.getValidCookieJar("user-id")).rejects.toBeInstanceOf(
      BingersApiError
    );
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        bingersCookieJar: null,
        bingersEmail: "user@example.com",
      })
    );
  });

  it("falls back to email and null image when auth validation clears the jar", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: "only@example.com",
      bingersUsername: undefined,
      bingersUserId: undefined,
      bingersThumb: undefined,
    });
    authMocks.getSession.mockRejectedValue(
      new BingersApiError("dead", 401, { isAuthError: true })
    );

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await expect(manager.validateAndRefresh("user-id")).resolves.toEqual({
      linked: false,
      needsReauthorization: true,
      username: "only@example.com",
      image: null,
    });
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        bingersCookieJar: null,
        bingersEmail: "only@example.com",
        bingersUserId: null,
        bingersUsername: null,
        bingersThumb: null,
      })
    );

    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: null,
      bingersUsername: null,
      bingersUserId: null,
      bingersThumb: null,
    });
    await expect(manager.validateAndRefresh("user-id")).resolves.toEqual({
      linked: false,
      needsReauthorization: true,
      username: null,
      image: null,
    });
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        bingersEmail: null,
        bingersUserId: null,
        bingersUsername: null,
        bingersThumb: null,
      })
    );
  });

  it("throws when getValidCookieJar has no stored jar", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: null,
    });

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await expect(manager.getValidCookieJar("user-id")).rejects.toMatchObject({
      isAuthError: true,
    });
  });

  it("clears corrupt stored jars and requires re-authorization", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: "not-json",
      bingersEmail: "user@example.com",
    });

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await expect(manager.getValidCookieJar("user-id")).rejects.toMatchObject({
      isAuthError: true,
    });
    expect(authMocks.getSession).not.toHaveBeenCalled();
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        bingersCookieJar: null,
        bingersEmail: "user@example.com",
      })
    );
  });

  it("reports needsReauthorization when validateAndRefresh finds a corrupt jar", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: "not-json",
      bingersEmail: "user@example.com",
      bingersUsername: "User",
      bingersThumb: "https://img.example/avatar.png",
    });

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
    expect(authMocks.getSession).not.toHaveBeenCalled();
  });

  it("falls back to stored email when a corrupt jar has no username", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: "not-json",
      bingersEmail: "user@example.com",
      bingersUsername: null,
      bingersThumb: null,
    });

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    const status = await manager.validateAndRefresh("user-id");
    expect(status).toEqual({
      linked: false,
      needsReauthorization: true,
      username: "user@example.com",
      image: null,
    });
  });

  it("returns null profile fields when a corrupt jar has no stored identity", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: "not-json",
      bingersEmail: null,
      bingersUsername: null,
      bingersThumb: null,
    });

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    const status = await manager.validateAndRefresh("user-id");
    expect(status).toEqual({
      linked: false,
      needsReauthorization: true,
      username: null,
      image: null,
    });
  });

  it("clears all Bingers fields on clearAll", async () => {
    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await manager.clearAll("user-id");
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        bingersCookieJar: null,
        bingersEmail: null,
        bingersUserId: null,
        bingersUsername: null,
        bingersThumb: null,
        bingersMarkMoviesAsRewatched: false,
        bingersMarkEpisodesAsRewatched: false,
      })
    );
  });

  it("propagates persistence failures from validateAndRefresh", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: "user@example.com",
    });
    authMocks.getSession.mockResolvedValue({
      session: { id: "s1" },
      user: { id: "b1", email: "user@example.com" },
      cookieJar: {
        session_token: { name: "session_token", value: "new" },
      },
    });
    userRepositoryMocks.update.mockRejectedValue(new Error("db down"));

    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await expect(manager.validateAndRefresh("user-id")).rejects.toThrow(
      "db down"
    );
  });

  it("returns cached linked status on non-auth validateAndRefresh failures", async () => {
    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: "cached@example.com",
      bingersUsername: "cached-user",
      bingersThumb: "https://img.example/cached.png",
    });
    authMocks.getSession.mockRejectedValue(new Error("network down"));

    await expect(manager.validateAndRefresh("user-id")).resolves.toEqual({
      linked: true,
      needsReauthorization: false,
      username: "cached-user",
      image: "https://img.example/cached.png",
    });
    expect(userRepositoryMocks.update).not.toHaveBeenCalled();

    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: "email-only@example.com",
      bingersUsername: null,
      bingersThumb: null,
    });
    authMocks.getSession.mockRejectedValue(new Error("upstream 503"));

    await expect(manager.validateAndRefresh("user-id")).resolves.toEqual({
      linked: true,
      needsReauthorization: false,
      username: "email-only@example.com",
      image: null,
    });

    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: null,
      bingersUsername: null,
      bingersThumb: null,
    });
    authMocks.getSession.mockRejectedValue(new Error("timeout"));

    await expect(manager.validateAndRefresh("user-id")).resolves.toEqual({
      linked: true,
      needsReauthorization: false,
      username: null,
      image: null,
    });
  });

  it("throws when the user is missing", async () => {
    userRepositoryMocks.findById.mockResolvedValue(null);
    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await expect(manager.getValidCookieJar("missing")).rejects.toThrow(
      /User missing not found/
    );
    await expect(manager.validateAndRefresh("missing")).rejects.toThrow(
      /User missing not found/
    );
  });

  it("falls back through name, stored username, and email for display", async () => {
    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: "stored@example.com",
      bingersUsername: "stored-user",
      bingersThumb: "https://img.example/stored.png",
    });
    authMocks.getSession.mockResolvedValue({
      session: { id: "s1" },
      user: {
        id: "b1",
        email: "session@example.com",
        name: "Session Name",
      },
      cookieJar: {
        session_token: { name: "session_token", value: "new" },
      },
    });

    await expect(manager.validateAndRefresh("user-id")).resolves.toEqual({
      linked: true,
      needsReauthorization: false,
      username: "Session Name",
      image: "https://img.example/stored.png",
    });

    authMocks.getSession.mockResolvedValue({
      session: { id: "s1" },
      user: { id: "b1", email: "session@example.com" },
      cookieJar: {
        session_token: { name: "session_token", value: "new" },
      },
    });
    await expect(manager.validateAndRefresh("user-id")).resolves.toMatchObject({
      username: "stored-user",
    });

    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: "stored@example.com",
      bingersUsername: null,
      bingersThumb: null,
    });
    await expect(manager.validateAndRefresh("user-id")).resolves.toMatchObject({
      username: "session@example.com",
      image: null,
    });

    authMocks.getSession.mockResolvedValue({
      session: { id: "s1" },
      user: { id: "b1" },
      cookieJar: {
        session_token: { name: "session_token", value: "new" },
      },
    });
    await expect(manager.validateAndRefresh("user-id")).resolves.toMatchObject({
      username: "stored@example.com",
    });

    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      bingersCookieJar: serializeCookieJar({
        session_token: { name: "session_token", value: "old" },
      }),
      bingersEmail: null,
      bingersUsername: null,
      bingersThumb: null,
    });
    await expect(manager.validateAndRefresh("user-id")).resolves.toMatchObject({
      username: null,
      image: null,
    });
  });

  it("persists a verified session via storeSessionFromVerify", async () => {
    const manager = new BingersSessionManager(
      userRepositoryMocks as never,
      authMocks as unknown as BingersAuth
    );

    await manager.storeSessionFromVerify(
      "user-id",
      {
        session: { id: "s1" },
        user: {
          id: "b1",
          email: "fresh@example.com",
          username: "handle",
          image: "https://img.example/a.png",
        },
        expiresAt: 1_800_000_000_000,
        cookieJar: {
          session_token: { name: "session_token", value: "sess" },
        },
      },
      "fallback@example.com"
    );

    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        bingersEmail: "fresh@example.com",
        bingersUsername: "handle",
        bingersThumb: "https://img.example/a.png",
      })
    );
  });
});
