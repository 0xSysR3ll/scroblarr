import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { getAppVersionForClients } from "@utils/appVersion";
import { Express } from "express";
import * as yaml from "js-yaml";
import swaggerUi from "swagger-ui-express";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openapiPath = join(__dirname, "..", "..", "openapi.yaml");

/** Build the OpenAPI document, always stamping the runtime app version. */
export function buildSwaggerSpec(
  readSpec: (path: string) => string = (path) => readFileSync(path, "utf8"),
  version: string = getAppVersionForClients()
): object {
  try {
    const yamlFile = readSpec(openapiPath);
    const loaded = yaml.load(yamlFile) as {
      info?: { version?: string; [key: string]: unknown };
      [key: string]: unknown;
    };
    return {
      ...loaded,
      info: {
        ...(loaded.info ?? {}),
        version,
      },
    };
  } catch (error) {
    console.error("Failed to load OpenAPI spec:", error);
    return {
      openapi: "3.0.0",
      info: {
        title: "Scroblarr API",
        version,
        description: "API documentation failed to load",
      },
    };
  }
}

const swaggerSpec = buildSwaggerSpec();

export function setupSwagger(app: Express): void {
  app.get(/^\/swagger-ui[^/]*\.(css|js)$/, (req, res) => {
    res.redirect(301, `/api-docs${req.path}`);
  });

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Scroblarr API Documentation",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
      },
    })
  );
}
