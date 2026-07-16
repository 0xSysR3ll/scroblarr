import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findByPlexUsername: vi.fn(),
  findByJellyfinUsername: vi.fn(),
  update: vi.fn(),
}));

const settingsRepositoryMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

const sessionRepositoryMocks = vi.hoisted(() => ({
  deleteAllForUser: vi.fn(),
}));

const plexOAuthMocks = vi.hoisted(() => ({
  getUserInfo: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  auth: (req: express.Request, _res: express.Response, next: () => void) => {
    const mode = req.headers["x-test-auth-mode"];
    if (mode === "no-user") {
      next();
      return;
    }

    const plexHeader = req.headers["x-test-plex-username"];
    const jellyfinHeader = req.headers["x-test-jellyfin-username"];
    const plexUsername =
      plexHeader !== undefined ? String(plexHeader) : "plex-user";
    const jellyfinUsername =
      jellyfinHeader !== undefined ? String(jellyfinHeader) : undefined;

    req.user = {
      id: "current-user-id",
      isAdmin: req.headers["x-test-admin"] === "true",
      plexUsername,
      jellyfinUsername,
    } as never;
    next();
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findByPlexUsername = userRepositoryMocks.findByPlexUsername;
    findByJellyfinUsername = userRepositoryMocks.findByJellyfinUsername;
    update = userRepositoryMocks.update;
    findAdmin = vi.fn();
    findBySessionToken = vi.fn();
    findByAccessToken = vi.fn();
    findByPlexUsernameOrCreate = vi.fn();
    findByJellyfinUsernameOrCreate = vi.fn();
    findAll = vi.fn();
    createSession = vi.fn();
    getPrimaryUsername = vi.fn((u) => u.plexUsername || u.jellyfinUsername);
  },
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    getAll = settingsRepositoryMocks.getAll;
    get = settingsRepositoryMocks.get;
    set = settingsRepositoryMocks.set;
    delete = vi.fn();
    deleteMany = vi.fn();
  },
}));

vi.mock("@repositories/SessionRepository", () => ({
  SessionRepository: class {
    deleteAllForUser = sessionRepositoryMocks.deleteAllForUser;
  },
}));

vi.mock("@integrations/plex/PlexOAuth", () => ({
  PlexOAuth: class {
    getUserInfo = plexOAuthMocks.getUserInfo;
    createPin = vi.fn();
    getTokenFromPin = vi.fn();
    getServers = vi.fn();
  },
}));

vi.mock("@integrations/jellyfin/JellyfinClient", () => ({
  JellyfinClient: class {
    login = vi.fn();
    getUserInfo = vi.fn();
    createApiKey = vi.fn();
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    auth: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  },
}));

vi.mock("@utils/userSanitizer", () => ({
  getProxiedThumbUrl: vi.fn(() => undefined),
}));

import { authRoutes } from "./auth";

describe("auth route sensitive guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 on /plex/link when auth middleware yields no user", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex/link")
      .set("x-test-auth-mode", "no-user")
      .send({ authToken: "token" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid token" });
  });

  it("blocks /plex/link if Plex account already linked to another user", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      plexServerUrl: "http://plex.local:32400",
    });
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "shared-plex-user",
      email: "shared@example.com",
      thumb: "https://img",
    });
    userRepositoryMocks.findByPlexUsername.mockResolvedValue({
      id: "other-user-id",
      plexUsername: "shared-plex-user",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex/link")
      .send({ authToken: "token" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "This Plex account is already linked to another user",
    });
  });

  it("prevents admin from unlinking their last remaining Plex account", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex/unlink")
      .set("x-test-admin", "true")
      .set("x-test-plex-username", "admin-plex")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error:
        "Cannot unlink Plex account. As an admin, you must have at least one linked account. Please link a Jellyfin account first before unlinking Plex.",
    });
    expect(sessionRepositoryMocks.deleteAllForUser).not.toHaveBeenCalled();
  });

  it("prevents admin from unlinking their last remaining Jellyfin account", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/unlink")
      .set("x-test-admin", "true")
      .set("x-test-plex-username", "")
      .set("x-test-jellyfin-username", "admin-jellyfin")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error:
        "Cannot unlink Jellyfin account. As an admin, you must have at least one linked account. Please link a Plex account first before unlinking Jellyfin.",
    });
    expect(sessionRepositoryMocks.deleteAllForUser).not.toHaveBeenCalled();
  });

  it("unlinks Plex for non-admin and clears Plex credentials", async () => {
    userRepositoryMocks.update.mockResolvedValue({
      id: "current-user-id",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex/unlink")
      .set("x-test-admin", "false")
      .set("x-test-plex-username", "user-plex")
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(sessionRepositoryMocks.deleteAllForUser).toHaveBeenCalledWith(
      "current-user-id"
    );
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("current-user-id", {
      plexUsername: null,
      plexAccessToken: null,
      plexThumb: null,
    });
  });

  it("unlinks Jellyfin for non-admin and clears Jellyfin credentials", async () => {
    userRepositoryMocks.update.mockResolvedValue({
      id: "current-user-id",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/unlink")
      .set("x-test-admin", "false")
      .set("x-test-jellyfin-username", "user-jellyfin")
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(sessionRepositoryMocks.deleteAllForUser).toHaveBeenCalledWith(
      "current-user-id"
    );
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("current-user-id", {
      jellyfinUsername: null,
      jellyfinAccessToken: null,
      jellyfinUserId: null,
      jellyfinThumb: null,
    });
  });

  it("returns current user details from /me", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: "current-user-id",
        username: "plex-user",
        isAdmin: false,
        hasPlex: true,
        hasJellyfin: false,
        hasTrakt: false,
        hasSimkl: false,
      })
    );
    expect(response.body).not.toHaveProperty("hasTVTime");
  });
});
