import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findAll: vi.fn(),
  delete: vi.fn(),
  findByJellyfinUsername: vi.fn(),
  findOrphanedMediaBrowserUser: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

const settingsRepositoryMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

const jellyfinClientMocks = vi.hoisted(() => ({
  getUsers: vi.fn(),
  getUserInfo: vi.fn(),
  constructedConfigs: [] as Array<{
    baseUrl: string;
    serverKind?: "jellyfin" | "emby";
  }>,
}));

vi.mock("../middleware/adminAuth", () => ({
  adminAuth: (
    req: express.Request,
    _res: express.Response,
    next: () => void
  ) => {
    req.user = { id: "admin-current", isAdmin: true } as never;
    next();
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findById = userRepositoryMocks.findById;
    findAll = userRepositoryMocks.findAll;
    delete = userRepositoryMocks.delete;
    findAllWithFilters = vi.fn();
    findByPlexUsername = vi.fn();
    findByJellyfinUsername = userRepositoryMocks.findByJellyfinUsername;
    findOrphanedMediaBrowserUser =
      userRepositoryMocks.findOrphanedMediaBrowserUser;
    create = userRepositoryMocks.create;
    update = userRepositoryMocks.update;
  },
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    getAll = settingsRepositoryMocks.getAll;
  },
}));

vi.mock("@integrations/jellyfin/JellyfinClient", () => ({
  JellyfinClient: class {
    constructor(
      baseUrl: string,
      _deviceId?: string,
      serverKind?: "jellyfin" | "emby"
    ) {
      jellyfinClientMocks.constructedConfigs.push({ baseUrl, serverKind });
    }
    getUsers = jellyfinClientMocks.getUsers;
    getUserInfo = jellyfinClientMocks.getUserInfo;
  },
}));

vi.mock("@utils/userSanitizer", () => ({
  sanitizeUser: vi.fn((u) => u),
  sanitizeUsers: vi.fn((u) => u),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    api: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  },
}));

import { userRoutes } from "./users";

describe("sensitive user deletion routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jellyfinClientMocks.constructedConfigs.length = 0;
  });

  it("rejects deleting own account", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/users", userRoutes);

    const response = await request(app).delete("/api/v1/users/admin-current");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Cannot delete your own account" });
    expect(userRepositoryMocks.delete).not.toHaveBeenCalled();
  });

  it("rejects deleting admin users", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "admin-target",
      isAdmin: true,
    });
    userRepositoryMocks.findAll.mockResolvedValue([
      { id: "admin-current", isAdmin: true },
      { id: "admin-target", isAdmin: true },
    ]);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/users", userRoutes);

    const response = await request(app).delete("/api/v1/users/admin-target");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Cannot delete admin users" });
    expect(userRepositoryMocks.delete).not.toHaveBeenCalled();
  });

  it("uses the Emby client kind for /jellyfin-users", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      jellyfinApiKey: "emby-api-key",
      mediaBrowserType: "emby",
    });
    userRepositoryMocks.findAll.mockResolvedValue([]);
    jellyfinClientMocks.getUsers.mockResolvedValue([
      {
        Id: "emby-user-id",
        Name: "emby-user",
        PrimaryImageTag: "tag-1",
      },
    ]);
    jellyfinClientMocks.getUserInfo.mockRejectedValue(
      new Error("lookup failed")
    );

    const app = express();
    app.use(express.json());
    app.use("/api/v1/users", userRoutes);

    const response = await request(app).get("/api/v1/users/jellyfin-users");

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "https://emby.local",
        serverKind: "emby",
      },
    ]);
    expect(response.body).toEqual([
      {
        id: "emby-user-id",
        username: "emby-user",
        displayName: "emby-user",
        email: undefined,
        thumb: "/api/v1/avatars/jellyfin/emby-user-id",
        isImported: false,
      },
    ]);
  });

  it("creates new Jellyfin imports with the Emby client kind", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      jellyfinApiKey: "emby-api-key",
      mediaBrowserType: "emby",
    });
    jellyfinClientMocks.getUsers.mockResolvedValue([
      {
        Id: "emby-user-id",
        Name: "fresh-user",
      },
    ]);
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);
    userRepositoryMocks.findOrphanedMediaBrowserUser.mockResolvedValue(null);
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      displayName: "Fresh User",
      email: "fresh@example.com",
    });
    userRepositoryMocks.create.mockResolvedValue({
      id: "new-user-id",
      jellyfinUsername: "fresh-user",
      jellyfinUserId: "emby-user-id",
      displayName: "Fresh User",
      email: "fresh@example.com",
      enabled: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/users", userRoutes);

    const response = await request(app)
      .post("/api/v1/users/import-jellyfin")
      .send({ usernames: ["fresh-user"] });

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "https://emby.local",
        serverKind: "emby",
      },
    ]);
    expect(userRepositoryMocks.create).toHaveBeenCalledWith({
      jellyfinUsername: "fresh-user",
      jellyfinUserId: "emby-user-id",
      displayName: "Fresh User",
      email: "fresh@example.com",
      enabled: true,
    });
    expect(response.body.imported).toBe(1);
  });

  it("relinks orphaned media-browser imports before creating duplicates", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      jellyfinApiKey: "emby-api-key",
      mediaBrowserType: "emby",
    });
    jellyfinClientMocks.getUsers.mockResolvedValue([
      {
        Id: "emby-user-id",
        Name: "orphan-user",
      },
    ]);
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);
    userRepositoryMocks.findOrphanedMediaBrowserUser.mockResolvedValue({
      id: "orphan-id",
      jellyfinUsername: null,
      email: "old@example.com",
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      displayName: "Relinked User",
      email: undefined,
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "orphan-id",
      jellyfinUsername: "orphan-user",
      jellyfinUserId: "emby-user-id",
      displayName: "Relinked User",
      email: "old@example.com",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/users", userRoutes);

    const response = await request(app)
      .post("/api/v1/users/import-jellyfin")
      .send({ usernames: ["orphan-user"] });

    expect(response.status).toBe(200);
    expect(
      userRepositoryMocks.findOrphanedMediaBrowserUser
    ).toHaveBeenCalledWith("orphan-user");
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("orphan-id", {
      jellyfinUsername: "orphan-user",
      jellyfinUserId: "emby-user-id",
      displayName: "Relinked User",
      email: "old@example.com",
    });
    expect(response.body.imported).toBe(1);
  });
});
