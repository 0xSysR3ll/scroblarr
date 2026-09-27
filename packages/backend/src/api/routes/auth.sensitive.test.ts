import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findByPlexUsername: vi.fn(),
  findByJellyfinUsername: vi.fn(),
  findByPlexUsernameOrCreate: vi.fn(),
  findByJellyfinUsernameOrCreate: vi.fn(),
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

const plexOAuthMocks = vi.hoisted(() => {
  class PlexPinNotFoundError extends Error {
    constructor(message = "Plex PIN not found or expired") {
      super(message);
      this.name = "PlexPinNotFoundError";
    }
  }

  return {
    PlexPinNotFoundError,
    getUserInfo: vi.fn(),
    getServers: vi.fn(),
    createPin: vi.fn(),
    getTokenFromPin: vi.fn(),
    pollPinAuthToken: vi.fn(),
    constructedWith: [] as Array<string | undefined>,
  };
});

const jellyfinClientMocks = vi.hoisted(() => ({
  login: vi.fn(),
  getUserInfo: vi.fn(),
  createApiKey: vi.fn(),
  constructedWith: [] as string[],
  constructedConfigs: [] as Array<{
    baseUrl: string;
    serverKind?: "jellyfin" | "emby";
  }>,
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
    const jellyfinTokenHeader = req.headers["x-test-jellyfin-access-token"];
    const jellyfinUserIdHeader = req.headers["x-test-jellyfin-user-id"];
    const plexUsername =
      plexHeader !== undefined ? String(plexHeader) : "plex-user";
    const jellyfinUsername =
      jellyfinHeader !== undefined ? String(jellyfinHeader) : undefined;

    req.user = {
      id: "current-user-id",
      isAdmin: req.headers["x-test-admin"] === "true",
      plexUsername,
      jellyfinUsername,
      jellyfinAccessToken:
        jellyfinTokenHeader !== undefined
          ? String(jellyfinTokenHeader)
          : undefined,
      jellyfinUserId:
        jellyfinUserIdHeader !== undefined
          ? String(jellyfinUserIdHeader)
          : undefined,
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
    findByJellyfinUsernameOrCreate =
      userRepositoryMocks.findByJellyfinUsernameOrCreate;
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
  PlexPinNotFoundError: plexOAuthMocks.PlexPinNotFoundError,
  PlexOAuth: class {
    constructor(clientIdentifier?: string) {
      plexOAuthMocks.constructedWith.push(clientIdentifier);
    }
    getUserInfo = plexOAuthMocks.getUserInfo;
    createPin = plexOAuthMocks.createPin;
    getTokenFromPin = plexOAuthMocks.getTokenFromPin;
    pollPinAuthToken = plexOAuthMocks.pollPinAuthToken;
    getServers = plexOAuthMocks.getServers;
  },
}));

vi.mock("@integrations/jellyfin/JellyfinClient", () => ({
  JellyfinClient: class {
    constructor(
      baseUrl: string,
      _deviceId?: string,
      serverKind?: "jellyfin" | "emby"
    ) {
      jellyfinClientMocks.constructedWith.push(baseUrl);
      jellyfinClientMocks.constructedConfigs.push({ baseUrl, serverKind });
    }
    login = jellyfinClientMocks.login;
    getUserInfo = jellyfinClientMocks.getUserInfo;
    createApiKey = jellyfinClientMocks.createApiKey;
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
    jellyfinClientMocks.constructedWith.length = 0;
    jellyfinClientMocks.constructedConfigs.length = 0;
    plexOAuthMocks.constructedWith.length = 0;
    getEnvMock.mockReturnValue({
      NODE_ENV: "test",
      PORT: "3000",
    });
    userRepositoryMocks.findByPlexUsername.mockResolvedValue(null);
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

  it("keeps stored email when Plex account omits it", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "imported-user",
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
      displayName: "imported-user",
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
      displayName: "imported-user",
      plexThumb: null,
    });
  });

  it("rejects Plex login when username is empty", async () => {
    plexOAuthMocks.getUserInfo.mockResolvedValue({
      username: "   ",
      email: "user@example.com",
      thumb: null,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex")
      .send({ authToken: "plex-token", clientIdentifier: "client-id" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Plex username is required" });
    expect(userRepositoryMocks.findAdmin).not.toHaveBeenCalled();
    expect(userRepositoryMocks.findByPlexUsername).not.toHaveBeenCalled();
    expect(
      userRepositoryMocks.findByPlexUsernameOrCreate
    ).not.toHaveBeenCalled();
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
      username: "first-admin",
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
      displayName: "first-admin",
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
      plexUsername: "first-admin",
      plexAccessToken: "admin-token",
      email: "stored@example.com",
      displayName: "first-admin",
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
    expect(response.body).toEqual({ error: "Unable to authenticate" });
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

  it("prevents unlinking the last remaining Plex account", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/plex/unlink")
      .set("x-test-admin", "true")
      .set("x-test-plex-username", "admin-plex")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain(
      "keep at least one media server account linked"
    );
    expect(sessionRepositoryMocks.deleteAllForUser).not.toHaveBeenCalled();
  });

  it("prevents unlinking the last remaining Jellyfin account", async () => {
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
    expect(response.body.error).toContain(
      "keep at least one media server account linked"
    );
    expect(sessionRepositoryMocks.deleteAllForUser).not.toHaveBeenCalled();
  });

  it("prevents non-admin from unlinking their only Emby/Jellyfin account", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/emby/unlink")
      .set("x-test-admin", "false")
      .set("x-test-plex-username", "")
      .set("x-test-jellyfin-username", "user-emby")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain(
      "keep at least one media server account linked"
    );
    expect(sessionRepositoryMocks.deleteAllForUser).not.toHaveBeenCalled();
  });

  it("unlinks Plex when another media account remains", async () => {
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
      .set("x-test-jellyfin-username", "user-jellyfin")
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

  it("unlinks Jellyfin when another media account remains", async () => {
    userRepositoryMocks.update.mockResolvedValue({
      id: "current-user-id",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/unlink")
      .set("x-test-admin", "false")
      .set("x-test-plex-username", "user-plex")
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

  it("returns jellyfin mediaBrowserType when host is jellyfin", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "http://jellyfin.local:8096",
      mediaBrowserType: "jellyfin",
    });

    const app = express();
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).get("/api/v1/auth/providers");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      hasAdmin: true,
      jellyfinConfigured: true,
      embyConfigured: false,
      plexConfigured: false,
      mediaBrowserType: "jellyfin",
    });
  });

  it("returns configured auth providers for Emby installations", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "http://emby.local:8096",
      mediaBrowserType: "emby",
      plexServerUrl: "https://plex.local:32400",
    });

    const app = express();
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).get("/api/v1/auth/providers");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      hasAdmin: true,
      jellyfinConfigured: false,
      embyConfigured: true,
      plexConfigured: true,
      mediaBrowserType: "emby",
    });
  });

  it("omits mediaBrowserType from providers when no media server is configured", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    settingsRepositoryMocks.getAll.mockResolvedValue({});

    const app = express();
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).get("/api/v1/auth/providers");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      hasAdmin: false,
      jellyfinConfigured: false,
      embyConfigured: false,
      plexConfigured: false,
    });
    expect(response.body).not.toHaveProperty("mediaBrowserType");
  });

  it("refreshes /me Jellyfin thumbs with the Emby client kind", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      mediaBrowserType: "emby",
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "emby-user-id",
      username: "user-emby",
      displayName: "user-emby",
      thumb: "/api/v1/avatars/jellyfin/emby-user-id",
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "current-user-id",
      isAdmin: false,
      jellyfinUsername: "user-emby",
      jellyfinAccessToken: "emby-token",
      jellyfinUserId: "emby-user-id",
      jellyfinThumb: "/api/v1/avatars/jellyfin/emby-user-id",
      displayName: "user-emby",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("x-test-plex-username", "")
      .set("x-test-jellyfin-username", "user-emby")
      .set("x-test-jellyfin-access-token", "emby-token")
      .set("x-test-jellyfin-user-id", "emby-user-id");

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "https://emby.local",
        serverKind: "emby",
      },
    ]);
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("current-user-id", {
      jellyfinThumb: "/api/v1/avatars/jellyfin/emby-user-id",
    });
  });

  it("refreshes /me Jellyfin thumbs with the Jellyfin client kind", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.local",
      mediaBrowserType: "jellyfin",
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "jf-user-id",
      username: "user-jf",
      displayName: "user-jf",
      thumb: "/api/v1/avatars/jellyfin/jf-user-id",
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "current-user-id",
      isAdmin: false,
      jellyfinUsername: "user-jf",
      jellyfinAccessToken: "jf-token",
      jellyfinUserId: "jf-user-id",
      jellyfinThumb: "/api/v1/avatars/jellyfin/jf-user-id",
      displayName: "user-jf",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("x-test-plex-username", "")
      .set("x-test-jellyfin-username", "user-jf")
      .set("x-test-jellyfin-access-token", "jf-token")
      .set("x-test-jellyfin-user-id", "jf-user-id");

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "https://jellyfin.local",
        serverKind: "jellyfin",
      },
    ]);
  });

  it("ignores client hostname on Jellyfin login when admin and host are configured", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue({
      id: "imported-id",
      jellyfinUsername: "imported-user",
      isAdmin: false,
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.real:8920",
    });
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "jf-token",
      User: { Id: "jf-user-id", Name: "imported-user" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "jf-user-id",
      username: "imported-user",
      displayName: "Imported",
      thumb: null,
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "imported-id",
      jellyfinUsername: "imported-user",
      displayName: "Imported",
      isAdmin: false,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).post("/api/v1/auth/jellyfin").send({
      username: "imported-user",
      password: "any-password",
      hostname: "evil.example",
      port: 443,
      useSsl: true,
    });

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedWith).toEqual([
      "https://jellyfin.real:8920",
    ]);
    expect(userRepositoryMocks.createSession).toHaveBeenCalled();
  });

  it("rejects Jellyfin login host override when admin exists but jellyfinHost is unset", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue({
      id: "imported-id",
      jellyfinUsername: "imported-user",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({});

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).post("/api/v1/auth/jellyfin").send({
      username: "imported-user",
      password: "any-password",
      hostname: "evil.example",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Jellyfin server not configured. Please provide server details.",
    });
    expect(jellyfinClientMocks.constructedWith).toEqual([]);
    expect(jellyfinClientMocks.login).not.toHaveBeenCalled();
  });

  it("uses the /emby alias to log in first admin users as Emby", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    settingsRepositoryMocks.getAll.mockResolvedValue({});
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "emby-token",
      User: { Id: "emby-admin-id", Name: "first-emby-admin" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "emby-admin-id",
      username: "first-emby-admin",
      displayName: "First Emby Admin",
      thumb: null,
    });
    jellyfinClientMocks.createApiKey.mockResolvedValue("emby-api-key");
    userRepositoryMocks.findByJellyfinUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "first-emby-admin",
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "first-emby-admin",
      displayName: "First Emby Admin",
      isAdmin: true,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).post("/api/v1/auth/emby").send({
      username: "first-emby-admin",
      password: "secret",
      hostname: "emby.bootstrap",
      port: 8096,
      useSsl: false,
    });

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "http://emby.bootstrap:8096",
        serverKind: "emby",
      },
    ]);
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "mediaBrowserType",
      "emby"
    );
  });

  it("ignores client hostname on Jellyfin link for non-admin users", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.real:8920",
    });
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "jf-token",
      User: { Id: "jf-user-id", Name: "link-user" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "jf-user-id",
      username: "link-user",
      displayName: "Link User",
      thumb: null,
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "current-user-id",
      jellyfinUsername: "link-user",
      displayName: "Link User",
      isAdmin: false,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .set("x-test-admin", "false")
      .send({
        username: "link-user",
        password: "secret",
        hostname: "evil.example",
        port: 443,
        useSsl: true,
      });

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedWith).toEqual([
      "https://jellyfin.real:8920",
    ]);
    expect(settingsRepositoryMocks.set).not.toHaveBeenCalledWith(
      "jellyfinHost",
      expect.anything()
    );
  });

  it("allows client hostname on Jellyfin login during first-admin bootstrap", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.stale:8920",
    });
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "jf-token",
      User: { Id: "jf-admin-id", Name: "first-admin" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "jf-admin-id",
      username: "first-admin",
      displayName: "First Admin",
      thumb: null,
    });
    jellyfinClientMocks.createApiKey.mockResolvedValue("jf-api-key");
    userRepositoryMocks.findByJellyfinUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "first-admin",
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "first-admin",
      displayName: "First Admin",
      isAdmin: true,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).post("/api/v1/auth/jellyfin").send({
      username: "first-admin",
      password: "secret",
      hostname: "jellyfin.bootstrap",
      port: 8096,
      useSsl: false,
      urlBase: "/jf",
    });

    expect(response.status).toBe(200);
    expect(response.body.isAdmin).toBe(true);
    expect(jellyfinClientMocks.constructedWith).toEqual([
      "http://jellyfin.bootstrap:8096/jf",
    ]);
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "jellyfinHost",
      "http://jellyfin.bootstrap:8096/jf"
    );
  });

  it("uses stored jellyfinHost on first-admin login when body omits hostname", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.preconfigured:8920",
    });
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "jf-token",
      User: { Id: "jf-admin-id", Name: "first-admin" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "jf-admin-id",
      username: "first-admin",
      displayName: "First Admin",
      thumb: null,
    });
    jellyfinClientMocks.createApiKey.mockRejectedValue(new Error("no key"));
    userRepositoryMocks.findByJellyfinUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "first-admin",
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "first-admin",
      displayName: "First Admin",
      isAdmin: true,
    });
    userRepositoryMocks.createSession.mockResolvedValue("session-token");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).post("/api/v1/auth/jellyfin").send({
      username: "first-admin",
      password: "secret",
    });

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedWith).toEqual([
      "https://jellyfin.preconfigured:8920",
    ]);
  });

  it("rejects first-admin Jellyfin login when no host is available", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    settingsRepositoryMocks.getAll.mockResolvedValue({});

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).post("/api/v1/auth/jellyfin").send({
      username: "first-admin",
      password: "secret",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Jellyfin server not configured. Please provide server details.",
    });
    expect(jellyfinClientMocks.login).not.toHaveBeenCalled();
  });

  it("rejects Jellyfin setup-admin when an admin already exists", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/setup-admin")
      .send({
        username: "admin",
        password: "secret",
        hostname: "jellyfin.local",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Admin already configured" });
    expect(jellyfinClientMocks.login).not.toHaveBeenCalled();
  });

  it("requires a hostname for Jellyfin setup-admin", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/setup-admin")
      .send({
        username: "admin",
        password: "secret",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Jellyfin hostname is required" });
    expect(jellyfinClientMocks.login).not.toHaveBeenCalled();
  });

  it("requires Jellyfin setup-admin credentials", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/setup-admin")
      .send({
        username: "admin",
        hostname: "jellyfin.local",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Username and password are required",
    });
  });

  it("creates an Emby admin via /emby/setup-admin", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "emby-token",
      User: { Id: "emby-admin-id", Name: "emby-admin" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "emby-admin-id",
      username: "emby-admin",
      displayName: "Emby Admin",
      thumb: null,
    });
    jellyfinClientMocks.createApiKey.mockResolvedValue("emby-api-key");
    userRepositoryMocks.findByJellyfinUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "emby-admin",
      jellyfinAccessToken: null,
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "emby-admin",
      displayName: "Emby Admin",
      isAdmin: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/emby/setup-admin")
      .send({
        username: "emby-admin",
        password: "secret",
        hostname: "emby.local",
        port: 8096,
        useSsl: false,
        urlBase: "/emby",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: "new-admin-id",
        username: "emby-admin",
        displayName: "Emby Admin",
        email: undefined,
        isAdmin: true,
      },
      accessToken: "emby-token",
    });
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "http://emby.local:8096/emby",
        serverKind: "emby",
      },
    ]);
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "jellyfinApiKey",
      "emby-api-key"
    );
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "jellyfinHost",
      "http://emby.local:8096/emby"
    );
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "mediaBrowserType",
      "emby"
    );
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "jellyfinPort",
      "8096"
    );
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "jellyfinUseSsl",
      "false"
    );
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "jellyfinUrlBase",
      "/emby"
    );
  });

  it("defaults Jellyfin setup-admin to jellyfin and tolerates API key failures", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "jf-token",
      User: { Id: "jf-admin-id", Name: "jf-admin" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "jf-admin-id",
      username: "jf-admin",
      displayName: "Jellyfin Admin",
      thumb: null,
    });
    jellyfinClientMocks.createApiKey.mockRejectedValue(new Error("no api key"));
    userRepositoryMocks.findByJellyfinUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "jf-admin",
      jellyfinAccessToken: null,
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "jf-admin",
      displayName: "Jellyfin Admin",
      isAdmin: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/setup-admin")
      .send({
        username: "jf-admin",
        password: "secret",
        hostname: "jellyfin.local",
      });

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "http://jellyfin.local:8096",
        serverKind: "jellyfin",
      },
    ]);
    expect(settingsRepositoryMocks.set).not.toHaveBeenCalledWith(
      "jellyfinApiKey",
      expect.anything()
    );
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "mediaBrowserType",
      "jellyfin"
    );
  });

  it("maps Jellyfin setup-admin invalid credentials to 401", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    jellyfinClientMocks.login.mockRejectedValue(
      new Error("Invalid credentials")
    );

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/setup-admin")
      .send({
        username: "admin",
        password: "bad-secret",
        hostname: "jellyfin.local",
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid credentials" });
  });

  it("returns generic Jellyfin setup-admin failures", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    jellyfinClientMocks.login.mockRejectedValue(new Error("server exploded"));

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/setup-admin")
      .send({
        username: "admin",
        password: "secret",
        hostname: "jellyfin.local",
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "server exploded" });
  });

  it("falls back to a generic setup-admin message for non-Error throws", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    jellyfinClientMocks.login.mockRejectedValue("boom");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/setup-admin")
      .send({
        username: "admin",
        password: "secret",
        hostname: "jellyfin.local",
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Failed to setup admin" });
  });

  it("falls back to the Jellyfin username when setup-admin has no displayName", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "jf-token",
      User: { Id: "jf-admin-id", Name: "jf-admin" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "jf-admin-id",
      username: "jf-admin",
      displayName: "",
      thumb: null,
    });
    jellyfinClientMocks.createApiKey.mockResolvedValue("jf-api-key");
    userRepositoryMocks.findByJellyfinUsernameOrCreate.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "jf-admin",
      jellyfinAccessToken: null,
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "new-admin-id",
      jellyfinUsername: "jf-admin",
      displayName: "jf-admin",
      isAdmin: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/setup-admin")
      .send({
        username: "jf-admin",
        password: "secret",
        hostname: "jellyfin.local",
      });

    expect(response.status).toBe(200);
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "new-admin-id",
      expect.objectContaining({
        displayName: "jf-admin",
      })
    );
  });

  it("forces Emby mediaBrowserType when /emby receives a non-object body", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", (req, _res, next) => {
      // Simulate a non-object body after parsing so forceEmby uses {}.
      req.body = null;
      next();
    });
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).post("/api/v1/auth/emby").send({
      username: "first-emby-admin",
      password: "secret",
      hostname: "emby.bootstrap",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Username and password are required",
    });
    expect(jellyfinClientMocks.constructedConfigs).toEqual([]);
  });

  it("allows admin Jellyfin link to supply hostname and update settings", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.stale:8920",
    });
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "jf-token",
      User: { Id: "jf-user-id", Name: "admin-link" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "jf-user-id",
      username: "admin-link",
      displayName: "Admin Link",
      thumb: null,
    });
    jellyfinClientMocks.createApiKey.mockResolvedValue("jf-api-key");
    userRepositoryMocks.update.mockResolvedValue({
      id: "current-user-id",
      jellyfinUsername: "admin-link",
      displayName: "Admin Link",
      isAdmin: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .set("x-test-admin", "true")
      .send({
        username: "admin-link",
        password: "secret",
        hostname: "jellyfin.admin",
        port: 443,
        useSsl: true,
      });

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedWith).toEqual([
      "https://jellyfin.admin:443",
    ]);
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "jellyfinHost",
      "https://jellyfin.admin:443"
    );
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "jellyfinApiKey",
      "jf-api-key"
    );
  });

  it("rejects non-admin Jellyfin link when jellyfinHost is unset", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({});
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .set("x-test-admin", "false")
      .send({
        username: "link-user",
        password: "secret",
        hostname: "evil.example",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Jellyfin server not configured. Please provide server details.",
    });
    expect(jellyfinClientMocks.login).not.toHaveBeenCalled();
  });

  it("uses configured jellyfinHost on admin link when hostname is omitted", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.real:8920",
    });
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "jf-token",
      User: { Id: "jf-user-id", Name: "admin-link" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "jf-user-id",
      username: "admin-link",
      displayName: "Admin Link",
      thumb: null,
    });
    jellyfinClientMocks.createApiKey.mockResolvedValue("jf-api-key");
    userRepositoryMocks.update.mockResolvedValue({
      id: "current-user-id",
      jellyfinUsername: "admin-link",
      displayName: "Admin Link",
      isAdmin: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .set("x-test-admin", "true")
      .send({
        username: "admin-link",
        password: "secret",
      });

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedWith).toEqual([
      "https://jellyfin.real:8920",
    ]);
    expect(settingsRepositoryMocks.set).not.toHaveBeenCalledWith(
      "jellyfinHost",
      expect.anything()
    );
  });

  it("rejects admin Jellyfin link when neither hostname nor jellyfinHost is set", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({});
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .set("x-test-admin", "true")
      .send({
        username: "admin-link",
        password: "secret",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Jellyfin server not configured. Please provide server details.",
    });
    expect(jellyfinClientMocks.login).not.toHaveBeenCalled();
  });

  it("requires an authenticated user for Jellyfin link", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .set("x-test-auth-mode", "no-user")
      .send({
        username: "link-user",
        password: "secret",
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid token" });
  });

  it("requires Jellyfin link credentials", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .send({
        username: "link-user",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Username and password are required",
    });
  });

  it("rejects Jellyfin link when the account is linked elsewhere", async () => {
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue({
      id: "other-user-id",
      jellyfinUsername: "shared-user",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .send({
        username: "shared-user",
        password: "secret",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "This Jellyfin account is already linked to another user",
    });
  });

  it("maps Jellyfin link invalid credentials to 401", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.real:8920",
    });
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);
    jellyfinClientMocks.login.mockRejectedValue(
      new Error("Invalid credentials")
    );

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .set("x-test-admin", "true")
      .send({
        username: "link-user",
        password: "wrong-secret",
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid credentials" });
  });

  it("uses stored Emby settings for Jellyfin link when body omits mediaBrowserType", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.real:8096",
      mediaBrowserType: "emby",
    });
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "emby-token",
      User: { Id: "emby-user-id", Name: "emby-link" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "emby-user-id",
      username: "emby-link",
      displayName: "Emby Link",
      email: "emby@example.com",
      thumb: null,
    });
    jellyfinClientMocks.createApiKey.mockResolvedValue("emby-api-key");
    userRepositoryMocks.update.mockResolvedValue({
      id: "current-user-id",
      jellyfinUsername: "emby-link",
      displayName: "Emby Link",
      email: "emby@example.com",
      isAdmin: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .set("x-test-admin", "true")
      .send({
        username: "emby-link",
        password: "secret",
      });

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "https://emby.real:8096",
        serverKind: "emby",
      },
    ]);
  });

  it("returns generic Jellyfin link failures", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.real:8920",
    });
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);
    jellyfinClientMocks.login.mockRejectedValue(new Error("server exploded"));

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .set("x-test-admin", "true")
      .send({
        username: "link-user",
        password: "secret",
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "server exploded" });
  });

  it("returns generic link error when thrown value is not an Error", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.local:8920",
    });
    jellyfinClientMocks.login.mockRejectedValue("boom-string");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/link")
      .set("x-test-admin", "true")
      .send({
        username: "link-user",
        password: "secret",
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Unable to link Jellyfin account" });
  });

  it("uses the /emby/link alias to persist Emby media browser type", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.old:8096",
    });
    userRepositoryMocks.findByJellyfinUsername.mockResolvedValue(null);
    jellyfinClientMocks.login.mockResolvedValue({
      AccessToken: "emby-token",
      User: { Id: "emby-user-id", Name: "emby-link" },
    });
    jellyfinClientMocks.getUserInfo.mockResolvedValue({
      id: "emby-user-id",
      username: "emby-link",
      displayName: "Emby Link",
      email: "emby@example.com",
      thumb: null,
    });
    jellyfinClientMocks.createApiKey.mockResolvedValue("emby-api-key");
    userRepositoryMocks.update.mockResolvedValue({
      id: "current-user-id",
      jellyfinUsername: "emby-link",
      displayName: "Emby Link",
      email: "emby@example.com",
      isAdmin: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/emby/link")
      .set("x-test-admin", "true")
      .send({
        username: "emby-link",
        password: "secret",
        hostname: "emby.admin",
        port: 8096,
        useSsl: false,
      });

    expect(response.status).toBe(200);
    expect(jellyfinClientMocks.constructedConfigs).toEqual([
      {
        baseUrl: "http://emby.admin:8096",
        serverKind: "emby",
      },
    ]);
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "mediaBrowserType",
      "emby"
    );
  });

  it("creates a Plex OAuth pin", async () => {
    settingsRepositoryMocks.get.mockResolvedValue("client-id");
    plexOAuthMocks.createPin.mockResolvedValue({ id: 42, code: "ABCD" });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).post("/api/v1/auth/plex/pin").send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      pinId: 42,
      code: "ABCD",
      clientIdentifier: "client-id",
    });
    expect(plexOAuthMocks.createPin).toHaveBeenCalled();
  });

  it("returns 500 when Plex OAuth pin creation fails", async () => {
    settingsRepositoryMocks.get.mockResolvedValue("client-id");
    plexOAuthMocks.createPin.mockRejectedValue(new Error("plex down"));

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).post("/api/v1/auth/plex/pin").send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Failed to create OAuth pin" });
  });

  it("shares one in-flight plex client identifier across concurrent first use", async () => {
    let releaseGet!: () => void;
    const getGate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    settingsRepositoryMocks.get.mockImplementation(async () => {
      await getGate;
      return null;
    });
    settingsRepositoryMocks.set.mockResolvedValue(undefined);
    plexOAuthMocks.createPin.mockResolvedValue({ id: 1, code: "ABCD" });

    let pinRequests = 0;
    let secondDispatched!: () => void;
    const secondDispatchedPromise = new Promise<void>((resolve) => {
      secondDispatched = resolve;
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", (req, _res, next) => {
      if (req.method === "POST" && req.path === "/plex/pin") {
        pinRequests += 1;
        if (pinRequests === 2) {
          // After this middleware returns, the route handler joins in-flight
          setImmediate(secondDispatched);
        }
      }
      next();
    });
    app.use("/api/v1/auth", authRoutes);

    try {
      // Supertest only sends once the request is then'd/awaited
      const firstPromise = request(app).post("/api/v1/auth/plex/pin").send({});
      void firstPromise.catch(() => undefined);

      await vi.waitFor(() => {
        expect(settingsRepositoryMocks.get).toHaveBeenCalled();
      });

      const secondPromise = request(app).post("/api/v1/auth/plex/pin").send({});
      void secondPromise.catch(() => undefined);

      await secondDispatchedPromise;
      releaseGet();

      const [firstResponse, secondResponse] = await Promise.all([
        firstPromise,
        secondPromise,
      ]);

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(firstResponse.body.clientIdentifier).toBe(
        secondResponse.body.clientIdentifier
      );
      expect(settingsRepositoryMocks.get).toHaveBeenCalledTimes(1);
      expect(settingsRepositoryMocks.set).toHaveBeenCalledTimes(1);
      expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
        "plexClientIdentifier",
        firstResponse.body.clientIdentifier
      );
    } finally {
      // Unblock any gated get so module in-flight state cannot poison later tests
      releaseGet();
    }
  });

  it("polls setup-admin with the same client identifier used to create the PIN", async () => {
    settingsRepositoryMocks.get.mockResolvedValue("installation-client-id");
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    plexOAuthMocks.createPin.mockResolvedValue({ id: 99, code: "ABCD" });
    plexOAuthMocks.getTokenFromPin.mockResolvedValue({
      accessToken: "plex-token",
      username: "admin-user",
      email: "admin@example.com",
      thumb: "https://img",
    });
    userRepositoryMocks.findByPlexUsernameOrCreate.mockResolvedValue({
      id: "user-1",
      plexUsername: "admin-user",
      plexAccessToken: null,
    });
    userRepositoryMocks.update.mockResolvedValue({
      id: "user-1",
      plexUsername: "admin-user",
      displayName: "admin-user",
      email: "admin@example.com",
      isAdmin: true,
    });
    plexOAuthMocks.getServers.mockResolvedValue([]);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const createResponse = await request(app)
      .post("/api/v1/auth/plex/pin")
      .send({});
    expect(createResponse.status).toBe(200);
    expect(createResponse.body.clientIdentifier).toBe("installation-client-id");
    expect(plexOAuthMocks.constructedWith).toEqual(["installation-client-id"]);

    plexOAuthMocks.constructedWith.length = 0;

    const setupResponse = await request(app)
      .post("/api/v1/auth/plex/setup-admin")
      .send({ pinId: createResponse.body.pinId });

    expect(setupResponse.status).toBe(200);
    expect(plexOAuthMocks.constructedWith).toEqual(["installation-client-id"]);
    expect(plexOAuthMocks.getTokenFromPin).toHaveBeenCalledWith(99);
  });

  it("requires an authenticated user for Emby unlink", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/emby/unlink")
      .set("x-test-auth-mode", "no-user")
      .send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when Jellyfin unlink cleanup fails", async () => {
    sessionRepositoryMocks.deleteAllForUser.mockRejectedValue(
      new Error("delete failed")
    );

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/unlink")
      .set("x-test-admin", "false")
      .set("x-test-plex-username", "user-plex")
      .set("x-test-jellyfin-username", "user-jellyfin")
      .send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "delete failed" });
  });

  it("uses a generic message when Jellyfin unlink throws a non-Error", async () => {
    sessionRepositoryMocks.deleteAllForUser.mockRejectedValue("unlink failed");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app)
      .post("/api/v1/auth/jellyfin/unlink")
      .set("x-test-admin", "false")
      .set("x-test-plex-username", "user-plex")
      .set("x-test-jellyfin-username", "user-jellyfin")
      .send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "Failed to unlink Jellyfin account",
    });
  });
});
