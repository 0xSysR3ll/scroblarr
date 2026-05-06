import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findAll: vi.fn(),
  delete: vi.fn(),
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
    findByJellyfinUsername = vi.fn();
    create = vi.fn();
    update = vi.fn();
  },
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    getAll = vi.fn();
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
  });

  it("rejects deleting own account", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/users", userRoutes);

    const response = await request(app).delete("/api/v1/users/admin-current");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Cannot delete your own account" });
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
});
