import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";

/**
 * Get the data directory path
 * Uses DATA_DIR environment variable if set, otherwise defaults to project root/data
 */
export function getDataDir(): string {
  if (process.env.DATA_DIR) {
    return resolve(process.env.DATA_DIR);
  }

  return join(getProjectRoot(), "data");
}

/**
 * Get the project root directory (where the root package.json is located)
 */
export function getProjectRoot(): string {
  let currentDir = dirname(fileURLToPath(import.meta.url));

  if (currentDir.includes("/dist/")) {
    currentDir = currentDir.replace("/dist/", "/src/");
  }

  while (currentDir !== "/" && currentDir !== dirname(currentDir)) {
    const rootPackageJson = join(currentDir, "package.json");
    if (existsSync(rootPackageJson)) {
      try {
        const packageContent = JSON.parse(
          readFileSync(rootPackageJson, "utf-8")
        );
        if (packageContent.name === "scroblarr") {
          return resolve(currentDir);
        }
        if (existsSync(join(currentDir, "packages"))) {
          return resolve(currentDir);
        }
      } catch {
        // If reading fails, continue searching
      }
    }
    currentDir = dirname(currentDir);
  }

  const fallback = dirname(
    dirname(dirname(dirname(fileURLToPath(import.meta.url))))
  );
  return resolve(fallback);
}
