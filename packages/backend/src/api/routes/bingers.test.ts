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

const authState = vi.hoisted(() => ({
  user: {
    id: "user-id",
    plexUsername: "plex-user",
  } as { id: string; plexUsername?: string; jellyfinUsername?: string } | null,
}));

vi.mock("../middleware/auth", () => ({
  auth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    if (authState.user) {
      req.user = authState.user as never;
    }
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
    authState.user = { id: "user-id", plexUsername: "plex-user" };
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
      })
      .expect(200);

    expect(bingersAuthMocks.verifyMagicLink).toHaveBeenCalledWith(
      "magic-token"
    );
    expect(sessionManagerMocks.storeSessionFromVerify).toHaveBeenCalledWith(
      "user-id",
      expect.anything(),
      null
    );
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

    expect(response.body).toEqual({
      error: "Failed to unlink Bingers account",
    });
  });

  it("returns 500 when status validation fails unexpectedly", async () => {
    sessionManagerMocks.validateAndRefresh.mockRejectedValue(
      new Error("session service down")
    );

    const response = await request(app).get("/bingers/status").expect(500);

    expect(response.body).toEqual({
      error: "Failed to get Bingers status",
    });
  });

  it("returns 401 when auth middleware leaves no user", async () => {
    authState.user = null;

    await request(app).post("/bingers/link").send({ token: "tok" }).expect(401);
    await request(app).post("/bingers/unlink").expect(401);
    await request(app).get("/bingers/status").expect(401);
  });

  it("returns 401 when the user record is missing on link", async () => {
    userRepositoryMocks.findById.mockResolvedValue(null);

    const response = await request(app)
      .post("/bingers/link")
      .send({ token: "tok" })
      .expect(401);

    expect(response.body).toEqual({ error: "User not found" });
  });

  it("returns 500 when link fails unexpectedly", async () => {
    bingersAuthMocks.verifyMagicLink.mockRejectedValue(new Error("db down"));

    const response = await request(app)
      .post("/bingers/link")
      .send({ token: "tok" })
      .expect(500);

    expect(response.body).toEqual({
      error: "Failed to link Bingers account",
    });
  });

  it("clamps BingersApiError statuses outside 400-599 to 400", async () => {
    const { BingersApiError } =
      await import("@integrations/bingers/BingersApiError");
    bingersAuthMocks.verifyMagicLink.mockRejectedValue(
      new BingersApiError("weird", 200, { code: "odd" })
    );

    const response = await request(app)
      .post("/bingers/link")
      .send({ token: "tok" })
      .expect(400);

    expect(response.body).toEqual({ error: "weird", code: "odd" });
  });

  it("returns a generic message when unlink rejects a non-Error", async () => {
    sessionManagerMocks.clearAll.mockRejectedValue("string failure");

    const response = await request(app).post("/bingers/unlink").expect(500);

    expect(response.body).toEqual({
      error: "Failed to unlink Bingers account",
    });
  });

  it("falls back to stored email and ignores client-supplied email", async () => {
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      plexUsername: "plex-user",
      bingersEmail: "stored@example.com",
    });
    bingersAuthMocks.verifyMagicLink.mockResolvedValue({
      session: {},
      user: { id: "b1" },
      cookieJar: { session_token: { name: "session_token", value: "s" } },
    });
    sessionManagerMocks.storeSessionFromVerify.mockResolvedValue(undefined);

    await request(app)
      .post("/bingers/link")
      .send({ token: "magic-token", email: "spoofed@example.com" })
      .expect(200);

    expect(sessionManagerMocks.storeSessionFromVerify).toHaveBeenCalledWith(
      "user-id",
      expect.anything(),
      "stored@example.com"
    );
  });

  it("returns a generic message when link rejects a non-Error", async () => {
    bingersAuthMocks.verifyMagicLink.mockRejectedValue("string failure");

    const response = await request(app)
      .post("/bingers/link")
      .send({ token: "tok" })
      .expect(500);

    expect(response.body).toEqual({
      error: "Failed to link Bingers account",
    });
  });

  it("logs jellyfin username when unlinking without plex", async () => {
    authState.user = { id: "user-id", jellyfinUsername: "jf-user" };
    sessionManagerMocks.clearAll.mockResolvedValue(undefined);

    await request(app).post("/bingers/unlink").expect(200);
    expect(sessionManagerMocks.clearAll).toHaveBeenCalledWith("user-id");
  });

  it("returns a generic message when status rejects a non-Error", async () => {
    sessionManagerMocks.validateAndRefresh.mockRejectedValue("string failure");

    const response = await request(app).get("/bingers/status").expect(500);

    expect(response.body).toEqual({
      error: "Failed to get Bingers status",
    });
  });
});
