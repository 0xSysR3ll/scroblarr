import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { getAppVersionForClients } from "@utils/appVersion";
import express from "express";
import request from "supertest";
import { describe, afterEach, expect, it, vi } from "vitest";

import { buildSwaggerSpec, setupSwagger } from "./swagger";

function makeSwaggerApp() {
  const app = express();
  setupSwagger(app);
  return app;
}

describe("buildSwaggerSpec", () => {
  it("stamps the runtime app version onto the loaded OpenAPI document", () => {
    const spec = buildSwaggerSpec() as {
      info?: { version?: string; title?: string };
    };

    expect(spec.info?.version).toBe(getAppVersionForClients());
    expect(spec.info?.title).toBe("Scroblarr API");
  });

  it("falls back to a minimal document when the OpenAPI file cannot be read", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const spec = buildSwaggerSpec(() => {
      throw new Error("missing openapi");
    }) as {
      openapi?: string;
      info?: { version?: string; title?: string; description?: string };
    };

    expect(spec).toEqual({
      openapi: "3.0.0",
      info: {
        title: "Scroblarr API",
        version: getAppVersionForClients(),
        description: "API documentation failed to load",
      },
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

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
