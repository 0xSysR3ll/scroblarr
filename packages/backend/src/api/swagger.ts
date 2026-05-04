import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { Express } from "express";
import * as yaml from "js-yaml";
import swaggerUi from "swagger-ui-express";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openapiPath = join(__dirname, "..", "..", "openapi.yaml");

let swaggerSpec: object;

try {
  const yamlFile = readFileSync(openapiPath, "utf8");
  swaggerSpec = yaml.load(yamlFile) as object;
} catch (error) {
  console.error("Failed to load OpenAPI spec:", error);
  swaggerSpec = {
    openapi: "3.0.0",
    info: {
      title: "Scroblarr API",
      version: "1.0.0",
      description: "API documentation failed to load",
    },
  };
}

export function setupSwagger(app: Express): void {
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
