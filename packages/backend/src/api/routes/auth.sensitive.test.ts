import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findByPlexUsername: vi.fn(),
  findByJellyfinUsername: vi.fn(),
  findByPlexUsernameOrCreate: vi.fn(),
  findAdmin: vi.fn(),
  findAll: vi.fn(),
  createSession: vi.fn(),
  update: vi.fn(),
  getPrimaryUsername: vi.fn(
    (u: { plexUsername?: string; jellyfinUsername?: string }) =>
      u.plexUsername || u.jellyfinUsername
  ),
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
  getServers: vi.fn(),
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
    findByPlexUsernameOrCreate = userRepositoryMocks.findByPlexUsernameOrCreate;
    findAdmin = userRepositoryMocks.findAdmin;
    findAll = userRepositoryMocks.findAll;
    createSession = userRepositoryMocks.createSession;
    update = userRepositoryMocks.update;
    findBySessionToken = vi.fn();
    findByJellyfinUsernameOrCreate = vi.fn();
    getPrimaryUsername = userRepositoryMocks.getPrimaryUsername;
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
    getServers = plexOAuthMocks.getServers;
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

const getEnvMock = vi.hoisted(() =>
  vi.fn(() => ({
    NODE_ENV: "test" as "development" | "production" | "test",
    PORT: "3000",
  }))
);

vi.mock("@config/env", () => ({
  getEnv: getEnvMock,
}));

import { authRoutes } from "./auth";

describe("auth route sensitive guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvMock.mockReturnValue({
      NODE_ENV: "test",
      PORT: "3000",
    });
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

  it("does not log in by email alone when Plex usernames differ", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "attacker-plex",
      email: "victim@example.com",
      thumb: "https://img",
    });
    userRepositoryMocks.findByPlexUsername.mockResolvedValue(null);
    userRepositoryMocks.findAll.mockResolvedValue([
      {
        id: "victim-id",
        plexUsername: "victim-plex",
        email: "victim@example.com",
      },
    ]);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "attacker-token" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error:
        "Access denied. Please contact an administrator to import your account.",
    });
    expect(userRepositoryMocks.findByPlexUsername).toHaveBeenCalledWith(
      "attacker-plex"
    );
    expect(userRepositoryMocks.findAll).not.toHaveBeenCalled();
    expect(userRepositoryMocks.update).not.toHaveBeenCalled();
    expect(userRepositoryMocks.createSession).not.toHaveBeenCalled();
  });

  it("logs in by Plex username and updates the matched user", async () => {
    getEnvMock.mockReturnValue({
      NODE_ENV: "production",
      PORT: "3000",
    });
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "imported-user",
      email: "user@example.com",
      thumb: "https://img",
    });
    userRepositoryMocks.findByPlexUsername.mockResolvedValue({
      id: "imported-id",
      plexUsername: "imported-user",
      email: "old@example.com",
      displayName: "Old Name",
      isAdmin: false,
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "imported-id",
      plexUsername: "imported-user",
      email: "user@example.com",
      displayName: "imported-user",
      isAdmin: false,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "plex-token" });

    expect(response.status).toBe(200);
    expect(userRepositoryMocks.findAll).not.toHaveBeenCalled();
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("imported-id", {
      plexAccessToken: "plex-token",
      email: "user@example.com",
      displayName: "imported-user",
      plexThumb: "https://img",
    });
    expect(response.body).toMatchObject({
      id: "imported-id",
      username: "imported-user",
      isAdmin: false,
    });
  });

  it("rejects Plex login without an auth token", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).post("/api/v1/auth/plex").send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Authentication token required",
    });
  });

  it("keeps stored email/displayName when Plex account omits them", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "",
      email: undefined,
      thumb: null,
    });
    userRepositoryMocks.findByPlexUsername.mockResolvedValue({
      id: "imported-id",
      plexUsername: "imported-user",
      email: "stored@example.com",
      displayName: "Stored Name",
      isAdmin: false,
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "imported-id",
      plexUsername: "imported-user",
      email: "stored@example.com",
      displayName: "Stored Name",
      isAdmin: false,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "plex-token", clientIdentifier: "client-id" });

    expect(response.status).toBe(200);
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("imported-id", {
      plexAccessToken: "plex-token",
      email: "stored@example.com",
      displayName: "Stored Name",
      plexThumb: null,
    });
  });

  it("creates the first admin via Plex username and stores server settings", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    settingsRepositoryMocks.get.mockResolvedValue("stored-client-id");
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "first-admin",
      email: "admin@example.com",
      thumb: "https://img",
    });
    userRepositoryMocks.findByPlexUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      plexUsername: "first-admin",
      plexAccessToken: null,
      email: null,
      displayName: null,
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      plexUsername: "first-admin",
      email: "admin@example.com",
      displayName: "first-admin",
      isAdmin: true,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");
    plexOAuthMocks.getServers.mockResolvedValue([
      {
        url: "https://plex.local:32400",
        machineIdentifier: "machine-1",
      },
    ]);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "admin-token" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: "new-admin-id",
      username: "first-admin",
      isAdmin: true,
    });
    expect(userRepositoryMocks.findByPlexUsernameOrCreate).toHaveBeenCalledWith(
      "first-admin"
    );
    expect(userRepositoryMocks.findAll).not.toHaveBeenCalled();
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "plexServerUrl",
      "https://plex.local:32400"
    );
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "plexServerMachineIdentifier",
      "machine-1"
    );
  });

  it("creates a plex client identifier when none is stored during first-admin setup", async () => {
    getEnvMock.mockReturnValue({
      NODE_ENV: "production",
      PORT: "3000",
    });
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    settingsRepositoryMocks.get.mockResolvedValue(null);
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "",
      email: undefined,
      thumb: null,
    });
    userRepositoryMocks.findByPlexUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      plexUsername: "first-admin",
      plexAccessToken: "already-linked",
      email: "stored@example.com",
      displayName: "Stored",
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      plexUsername: "first-admin",
      email: "stored@example.com",
      displayName: "Stored",
      isAdmin: true,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");
    plexOAuthMocks.getServers.mockResolvedValue([
      { url: "https://plex.local" },
    ]);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "admin-token" });

    expect(response.status).toBe(200);
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "plexClientIdentifier",
      expect.any(String)
    );
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "plexServerUrl",
      "https://plex.local"
    );
    expect(settingsRepositoryMocks.set).not.toHaveBeenCalledWith(
      "plexServerMachineIdentifier",
      expect.anything()
    );
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("new-admin-id", {
      plexUsername: "",
      plexAccessToken: "admin-token",
      email: "stored@example.com",
      displayName: "Stored",
      plexThumb: null,
      isAdmin: true,
    });
  });

  it("ignores Plex server auto-config failures during first-admin setup", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "first-admin",
      email: "admin@example.com",
      thumb: "https://img",
    });
    userRepositoryMocks.findByPlexUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      plexUsername: "first-admin",
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      plexUsername: "first-admin",
      email: "admin@example.com",
      displayName: "first-admin",
      isAdmin: true,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");
    plexOAuthMocks.getServers.mockRejectedValue(new Error("plex down"));

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "admin-token", clientIdentifier: "client-id" });

    expect(response.status).toBe(200);
    expect(response.body.isAdmin).toBe(true);
  });

  it("skips server settings when first-admin discovery returns no usable URL", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "first-admin",
      email: "admin@example.com",
      thumb: "https://img",
    });
    userRepositoryMocks.findByPlexUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      plexUsername: "first-admin",
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      plexUsername: "first-admin",
      email: "admin@example.com",
      displayName: "first-admin",
      isAdmin: true,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");
    plexOAuthMocks.getServers.mockResolvedValue([{ url: "" }, {}]);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "admin-token", clientIdentifier: "client-id" });

    expect(response.status).toBe(200);
    expect(settingsRepositoryMocks.set).not.toHaveBeenCalledWith(
      "plexServerUrl",
      expect.anything()
    );
  });

  it("skips server settings when first-admin discovery returns no servers", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "first-admin",
      email: "admin@example.com",
      thumb: "https://img",
    });
    userRepositoryMocks.findByPlexUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      plexUsername: "first-admin",
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      plexUsername: "first-admin",
      email: "admin@example.com",
      displayName: "first-admin",
      isAdmin: true,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");
    plexOAuthMocks.getServers.mockResolvedValue([]);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "admin-token", clientIdentifier: "client-id" });

    expect(response.status).toBe(200);
    expect(settingsRepositoryMocks.set).not.toHaveBeenCalledWith(
      "plexServerUrl",
      expect.anything()
    );
  });

  it("returns 500 when Plex login throws an Error", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    plexOAuthMocks.getUserInfo.mockRejectedValue(new Error("plex boom"));

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "token", clientIdentifier: "client-id" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "plex boom" });
  });

  it("returns a generic 500 message when Plex login rejects a non-Error", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    plexOAuthMocks.getUserInfo.mockRejectedValue("string failure");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "token", clientIdentifier: "client-id" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Unable to authenticate" });
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
        hasBingers: false,
      })
    );
    expect(response.body).not.toHaveProperty("hasTVTime");
  });
});
