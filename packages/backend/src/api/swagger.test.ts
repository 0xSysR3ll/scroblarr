import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import express from "express";
import request from "supertest";
import { describe, afterEach, expect, it, vi } from "vitest";

import { setupSwagger } from "./swagger";

function makeSwaggerApp() {
  const app = express();
  setupSwagger(app);
  return app;
}

describe("setupSwagger", () => {
  it("redirects root-level swagger asset URLs to /api-docs", async () => {
    const response = await request(makeSwaggerApp())
      .get("/swagger-ui.css")
      .redirects(0);

    expect(response.status).toBe(301);
    expect(response.headers.location).toBe("/api-docs/swagger-ui.css");
  });

  it("serves swagger UI at /api-docs/", async () => {
    const response = await request(makeSwaggerApp()).get("/api-docs/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("swagger-ui");
    expect(response.text).toContain("Scroblarr API Documentation");
  });
});

describe("createApp with swagger", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("serves swagger UI at /api-docs instead of the SPA shell", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "PUBLIC_DIR",
      mkdtempSync(join(tmpdir(), "scroblarr-public-swagger-"))
    );
    writeFileSync(
      join(process.env.PUBLIC_DIR!, "index.html"),
      '<!doctype html><html><body id="root">spa</body></html>'
    );

    vi.resetModules();
    const { createApp: createProductionApp } = await import("./index");
    const response = await request(createProductionApp()).get("/api-docs/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("swagger-ui");
    expect(response.text).not.toContain('id="root"');
  });
});
