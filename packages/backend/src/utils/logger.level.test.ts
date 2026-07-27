import { afterEach, describe, expect, it, vi } from "vitest";

describe("logger LOG_LEVEL", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("accepts case-insensitive LOG_LEVEL values", async () => {
    vi.stubEnv("LOG_LEVEL", "DEBUG");
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    const { logger } = await import("./logger");
    expect(logger.system.debug).toEqual(expect.any(Function));
    logger.system.debug("debug-enabled");
  });
});
