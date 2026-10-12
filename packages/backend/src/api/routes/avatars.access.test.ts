import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsRepositoryMocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
}));

const userRepositoryMocks = vi.hoisted(() => ({
  findBySessionToken: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    get = settingsRepositoryMocks.get;
    getAll = settingsRepositoryMocks.getAll;
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findBySessionToken = userRepositoryMocks.findBySessionToken;
    findById = userRepositoryMocks.findById;
  },
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

import { avatarRoutes } from "./avatars";

describe("avatar sensitive access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns 403 when non-admin requests another user's avatar", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "viewer-id",
      isAdmin: false,
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer viewer-token");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Forbidden" });
  });

  it("allows owner path and returns 404 for missing avatar data", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      plexThumb: null,
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer owner-token");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "User or Plex avatar not found" });
  });

  it("proxies Simkl avatars for the owning user", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue("image/png"),
      },
      arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("image-bytes").buffer),
    });
    vi.stubGlobal("fetch", fetchMock);
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      simklThumb: "https://simkl.example/avatar.png",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/simkl/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(200);

    expect(fetchMock).toHaveBeenCalledWith("https://simkl.example/avatar.png", {
      headers: {
        Accept: "image/*",
      },
    });
    expect(response.headers["content-type"]).toContain("image/png");
  });

  it("returns upstream failures for Simkl avatars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      simklThumb: "https://simkl.example/missing.png",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/simkl/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(404);

    expect(response.body).toEqual({ error: "Failed to fetch Simkl avatar" });
  });

  it("returns 500 when Simkl avatar proxying throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      simklThumb: "https://simkl.example/avatar.png",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/simkl/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(500);

    expect(response.body).toEqual({ error: "Failed to fetch Simkl avatar" });
  });

  it("uses Emby auth headers when proxying Jellyfin avatars for Emby", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue("image/jpeg"),
      },
      arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("image-bytes").buffer),
    });
    vi.stubGlobal("fetch", fetchMock);
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      jellyfinThumb: "/api/v1/avatars/jellyfin/emby-user-id",
      jellyfinUserId: "emby-user-id",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://emby.local",
      jellyfinApiKey: "emby-api-key",
      mediaBrowserType: "emby",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/jellyfin/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(200);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://emby.local/Users/emby-user-id/Images/Primary",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Emby /),
          "X-Emby-Authorization": expect.stringMatching(/^Emby /),
          "X-Emby-Token": "emby-api-key",
          Accept: "image/*",
        }),
      })
    );
    expect(response.headers["content-type"]).toContain("image/jpeg");
  });

  it("uses Jellyfin auth headers when mediaBrowserType is jellyfin", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue("image/jpeg"),
      },
      arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("image-bytes").buffer),
    });
    vi.stubGlobal("fetch", fetchMock);
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      jellyfinThumb: "/api/v1/avatars/jellyfin/jf-user-id",
      jellyfinUserId: "jf-user-id",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.local",
      jellyfinApiKey: "jf-api-key",
      mediaBrowserType: "jellyfin",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/jellyfin/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(200);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://jellyfin.local/Users/jf-user-id/Images/Primary",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^MediaBrowser /),
          Accept: "image/*",
        }),
      })
    );
    expect(response.headers["content-type"]).toContain("image/jpeg");
  });

  it("allows API-key auth to fetch another user's Trakt avatar", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("image-bytes").buffer),
    });
    vi.stubGlobal("fetch", fetchMock);
    settingsRepositoryMocks.get.mockResolvedValue("admin-api-key");
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      traktThumb: "https://trakt.example/avatar.png",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/trakt/owner-id")
      .set("x-api-key", "admin-api-key")
      .expect(200);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://trakt.example/avatar.png",
      expect.objectContaining({
        headers: { Accept: "image/*" },
      })
    );
    expect(response.headers["content-type"]).toContain("image/jpeg");
  });

  it("returns upstream failures for Trakt avatars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      })
    );
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      traktThumb: "https://trakt.example/missing.png",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/trakt/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(502);

    expect(response.body).toEqual({ error: "Failed to fetch Trakt avatar" });
  });

  it("returns 500 when Trakt avatar proxying throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      traktThumb: "https://trakt.example/avatar.png",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/trakt/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(500);

    expect(response.body).toEqual({ error: "Failed to fetch Trakt avatar" });
  });

  it("returns 404 when Trakt thumb is missing", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      traktThumb: null,
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/trakt/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(404);

    expect(response.body).toEqual({ error: "User or Trakt avatar not found" });
  });

  it("returns 404 when Simkl thumb is missing", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      simklThumb: null,
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/simkl/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(404);

    expect(response.body).toEqual({ error: "User or Simkl avatar not found" });
  });

  it("returns 503 when Jellyfin is not configured", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      jellyfinThumb: "thumb",
      jellyfinUserId: "jf-user-id",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({});

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/jellyfin/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(503);

    expect(response.body).toEqual({ error: "Jellyfin not configured" });
  });

  it("returns upstream failures for Jellyfin avatars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      jellyfinThumb: "thumb",
      jellyfinUserId: "jf-user-id",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.local",
      jellyfinApiKey: "jf-api-key",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/jellyfin/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(404);

    expect(response.body).toEqual({ error: "Failed to fetch avatar" });
  });

  it("returns 500 when Jellyfin avatar proxying throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      jellyfinThumb: "thumb",
      jellyfinUserId: "jf-user-id",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.local",
      jellyfinApiKey: "jf-api-key",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/jellyfin/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(500);

    expect(response.body).toEqual({ error: "Failed to proxy avatar" });
  });

  it("returns 404 when Jellyfin avatar metadata is missing", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      jellyfinThumb: null,
      jellyfinUserId: null,
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/jellyfin/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(404);

    expect(response.body).toEqual({
      error: "User or Jellyfin avatar not found",
    });
  });

  it("proxies remote Plex thumbs directly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue("image/png"),
      },
      arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("image-bytes").buffer),
    });
    vi.stubGlobal("fetch", fetchMock);
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      plexThumb: "https://images.plex.tv/photo.jpeg",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(200);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://images.plex.tv/photo.jpeg",
      expect.objectContaining({
        headers: { Accept: "image/*" },
      })
    );
    expect(response.headers["content-type"]).toContain("image/png");
  });

  it("proxies Plex server thumbs with the user access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue("image/jpeg"),
      },
      arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("image-bytes").buffer),
    });
    vi.stubGlobal("fetch", fetchMock);
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      plexThumb: "https://plex.local:32400/library/metadata/1/thumb",
      plexAccessToken: "plex-token",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      plexServerUrl: "https://plex.local:32400/",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(200);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://plex.local:32400/library/metadata/1/thumb",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "image/*",
          "X-Plex-Token": "plex-token",
        }),
      })
    );
    expect(response.status).toBe(200);
  });

  it("requires a Plex token for server-local thumbs", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      plexThumb: "https://plex.local:32400/library/metadata/1/thumb",
      plexAccessToken: null,
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(403);

    expect(response.body).toEqual({ error: "Plex authentication required" });
  });

  it("returns 500 when Plex server URL is not configured for server thumbs", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      plexThumb: "https://plex.local:32400/library/metadata/1/thumb",
      plexAccessToken: "plex-token",
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({});

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(500);

    expect(response.body).toEqual({ error: "Plex server not configured" });
  });

  it("returns upstream failures for Plex avatars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      plexThumb: "https://images.plex.tv/photo.jpeg",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(404);

    expect(response.body).toEqual({ error: "Failed to fetch Plex avatar" });
  });

  it("returns 500 when Plex avatar proxying throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      plexThumb: "https://images.plex.tv/photo.jpeg",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(500);

    expect(response.body).toEqual({ error: "Failed to fetch Plex avatar" });
  });

  it("returns 500 when Plex user lookup throws before proxying", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockRejectedValue(new Error("db down"));

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(500);

    expect(response.body).toEqual({ error: "Internal server error" });
  });

  it("returns 500 when Trakt user lookup throws before proxying", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockRejectedValue(new Error("db down"));

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/trakt/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(500);

    expect(response.body).toEqual({ error: "Internal server error" });
  });

  it("returns 500 when Simkl user lookup throws before proxying", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockRejectedValue(new Error("db down"));

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/simkl/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(500);

    expect(response.body).toEqual({ error: "Internal server error" });
  });
});
