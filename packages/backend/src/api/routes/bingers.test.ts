import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
}));

const bingersAuthMocks = vi.hoisted(() => ({
  verifyMagicLink: vi.fn(),
  getSession: vi.fn(),
}));

const sessionManagerMocks = vi.hoisted(() => ({
  storeSessionFromVerify: vi.fn(),
  clearAll: vi.fn(),
  validateAndRefresh: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  auth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.user = { id: "user-id", plexUsername: "plex-user" } as never;
    next();
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findById = userRepositoryMocks.findById;
    update = userRepositoryMocks.update;
  },
}));

vi.mock("@integrations/bingers/BingersAuth", async () => {
  const actual = await vi.importActual<
    typeof import("@integrations/bingers/BingersAuth")
  >("@integrations/bingers/BingersAuth");
  return {
    ...actual,
    BingersAuth: class {
      verifyMagicLink = bingersAuthMocks.verifyMagicLink;
      getSession = bingersAuthMocks.getSession;
    },
  };
});

vi.mock("@integrations/bingers/BingersSessionManager", () => ({
  BingersSessionManager: class {
    storeSessionFromVerify = sessionManagerMocks.storeSessionFromVerify;
    clearAll = sessionManagerMocks.clearAll;
    validateAndRefresh = sessionManagerMocks.validateAndRefresh;
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    bingers: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

import { bingersRoutes } from "./bingers";

describe("bingers routes", () => {
  const app = express();
  app.use(express.json());
  app.use("/bingers", bingersRoutes);

  beforeEach(() => {
    vi.clearAllMocks();
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      plexUsername: "plex-user",
      bingersEmail: null,
    });
  });

  it("extracts token from URL when linking", async () => {
    bingersAuthMocks.verifyMagicLink.mockResolvedValue({
      session: {},
      user: { id: "b1", email: "user@example.com" },
      cookieJar: { session_token: { name: "session_token", value: "s" } },
    });
    sessionManagerMocks.storeSessionFromVerify.mockResolvedValue(undefined);

    await request(app)
      .post("/bingers/link")
      .send({
        token: "https://bingers.app/m?token=magic-token",
        email: "user@example.com",
      })
      .expect(200);

    expect(bingersAuthMocks.verifyMagicLink).toHaveBeenCalledWith(
      "magic-token"
    );
    expect(sessionManagerMocks.storeSessionFromVerify).toHaveBeenCalled();
  });

  it("unlinks and clears stored session", async () => {
    sessionManagerMocks.clearAll.mockResolvedValue(undefined);

    const response = await request(app).post("/bingers/unlink").expect(200);

    expect(response.body).toEqual({ success: true });
    expect(sessionManagerMocks.clearAll).toHaveBeenCalledWith("user-id");
  });

  it("returns status without leaking cookie jar fields", async () => {
    sessionManagerMocks.validateAndRefresh.mockResolvedValue({
      linked: true,
      needsReauthorization: false,
      username: "User",
      image: "https://img.example/avatar.png",
    });

    const response = await request(app).get("/bingers/status").expect(200);

    expect(response.body).toEqual({
      linked: true,
      needsReauthorization: false,
      username: "User",
      image: "https://img.example/avatar.png",
    });
    expect(response.body).not.toHaveProperty("bingersCookieJar");
    expect(response.body).not.toHaveProperty("cookieJar");
  });

  it("returns validation errors for invalid link payloads", async () => {
    const response = await request(app)
      .post("/bingers/link")
      .send({ token: "" })
      .expect(400);

    expect(response.body.error).toBe("Validation error");
    expect(bingersAuthMocks.verifyMagicLink).not.toHaveBeenCalled();
  });

  it("maps BingersApiError from link to the response status", async () => {
    const { BingersApiError } =
      await import("@integrations/bingers/BingersApiError");
    bingersAuthMocks.verifyMagicLink.mockRejectedValue(
      new BingersApiError("Magic link expired", 400, {
        code: "magic_link_expired",
      })
    );

    const response = await request(app)
      .post("/bingers/link")
      .send({ token: "dead-token" })
      .expect(400);

    expect(response.body).toEqual({
      error: "Magic link expired",
      code: "magic_link_expired",
    });
  });

  it("returns 500 when unlink fails unexpectedly", async () => {
    sessionManagerMocks.clearAll.mockRejectedValue(new Error("db down"));

    const response = await request(app).post("/bingers/unlink").expect(500);

    expect(response.body).toEqual({ error: "db down" });
  });

  it("returns 500 when status validation fails unexpectedly", async () => {
    sessionManagerMocks.validateAndRefresh.mockRejectedValue(
      new Error("session service down")
    );

    const response = await request(app).get("/bingers/status").expect(500);

    expect(response.body).toEqual({ error: "session service down" });
  });
});
