import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./swagger", () => ({
  setupSwagger: vi.fn(),
}));

describe("createApp production static hosting", () => {
  let publicDir: string;
  let originalNodeEnv: string | undefined;
  let createApp: typeof import("./index").createApp;

  beforeEach(async () => {
    originalNodeEnv = process.env.NODE_ENV;
    vi.resetModules();
    publicDir = mkdtempSync(join(tmpdir(), "scroblarr-public-"));
    writeFileSync(
      join(publicDir, "index.html"),
      '<!doctype html><html><body id="root">spa</body></html>'
    );
    process.env.NODE_ENV = "production";
    process.env.PUBLIC_DIR = publicDir;
    ({ createApp } = await import("./index"));
  });

  afterEach(() => {
    delete process.env.PUBLIC_DIR;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    vi.resetModules();
  });

  it("skips the SPA shell for /api-docs paths", async () => {
    const response = await request(createApp()).get("/api-docs");

    expect(response.status).toBe(404);
    expect(response.text).not.toContain('id="root"');
  });

  it("serves the SPA shell for client routes", async () => {
    const response = await request(createApp()).get("/sync");

    expect(response.status).toBe(200);
    expect(response.text).toContain('id="root"');
  });
});
