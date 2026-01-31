import { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let swaggerSpec: object;

try {
  const yamlFile = readFileSync(join(__dirname, "openapi.yaml"), "utf8");
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
