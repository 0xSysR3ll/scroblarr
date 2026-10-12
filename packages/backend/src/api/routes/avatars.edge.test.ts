import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsRepositoryMocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
}));

const userRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
}));

const routeParamMocks = vi.hoisted(() => ({
  forceUndefined: false,
}));

const authState = vi.hoisted(() => ({
  mode: "user" as "user" | "none" | "admin",
}));

vi.mock("@utils/routeParams", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@utils/routeParams")>();
  return {
    routeParam: (value: string | string[] | undefined) => {
      if (routeParamMocks.forceUndefined) {
        return undefined;
      }
      return actual.routeParam(value);
    },
  };
});

vi.mock("../middleware/auth", () => ({
  auth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    if (authState.mode === "none") {
      next();
      return;
    }
    req.user = {
      id: authState.mode === "admin" ? "admin-id" : "owner-id",
      isAdmin: authState.mode === "admin",
    } as never;
    next();
  },
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    get = settingsRepositoryMocks.get;
    getAll = settingsRepositoryMocks.getAll;
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
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

describe("avatar edge coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    routeParamMocks.forceUndefined = false;
    authState.mode = "user";
  });

  it("returns 400 when the user id path param is missing", async () => {
    routeParamMocks.forceUndefined = true;

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .expect(400);

    expect(response.body).toEqual({ error: "Missing user id" });
  });

  it("returns 403 when auth middleware leaves no viewer", async () => {
    authState.mode = "none";

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .expect(403);

    expect(response.body).toEqual({ error: "Forbidden" });
  });

  it("allows admins to fetch another user's avatar metadata path", async () => {
    authState.mode = "admin";
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      plexThumb: null,
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .expect(404);

    expect(response.body).toEqual({ error: "User or Plex avatar not found" });
    expect(userRepositoryMocks.findById).toHaveBeenCalledWith("owner-id");
  });

  it.each(["jellyfin", "trakt", "simkl"] as const)(
    "returns 400 when %s user id path param is missing",
    async (provider) => {
      routeParamMocks.forceUndefined = true;

      const app = express();
      app.use("/api/v1/avatars", avatarRoutes);

      const response = await request(app)
        .get(`/api/v1/avatars/${provider}/owner-id`)
        .expect(400);

      expect(response.body).toEqual({ error: "Missing user id" });
    }
  );
});
