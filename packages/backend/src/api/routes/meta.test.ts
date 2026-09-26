import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const appVersionMocks = vi.hoisted(() => ({
  getAppVersion: vi.fn(),
  getCommitTag: vi.fn(),
}));

const versionCheckMocks = vi.hoisted(() => ({
  getVersionCheck: vi.fn(),
  GITHUB_REPOSITORY: "0xsysr3ll/scroblarr",
}));

vi.mock("@utils/appVersion", () => ({
  getAppVersion: appVersionMocks.getAppVersion,
  getCommitTag: appVersionMocks.getCommitTag,
}));

vi.mock("@utils/versionCheck", () => ({
  getVersionCheck: versionCheckMocks.getVersionCheck,
  GITHUB_REPOSITORY: versionCheckMocks.GITHUB_REPOSITORY,
}));

import { metaRoutes } from "./meta";

describe("meta routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appVersionMocks.getAppVersion.mockReturnValue("v1.2.3");
    appVersionMocks.getCommitTag.mockReturnValue("abc123");
    versionCheckMocks.getVersionCheck.mockResolvedValue({
      updateAvailable: false,
      commitsBehind: 0,
      latestTag: "v1.2.3",
      latestUrl: "https://github.com/0xsysr3ll/scroblarr/releases/tag/v1.2.3",
      error: null,
    });
  });

  it("returns version metadata from appVersion and versionCheck", async () => {
    const app = express();
    app.use("/api/v1/meta", metaRoutes);

    const response = await request(app).get("/api/v1/meta/version");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      version: "v1.2.3",
      commitTag: "abc123",
      updateAvailable: false,
      commitsBehind: 0,
      latestTag: "v1.2.3",
      latestUrl: "https://github.com/0xsysr3ll/scroblarr/releases/tag/v1.2.3",
      releasesError: null,
      githubRepository: "0xsysr3ll/scroblarr",
    });
    expect(versionCheckMocks.getVersionCheck).toHaveBeenCalledWith(
      "v1.2.3",
      "abc123"
    );
  });
});
