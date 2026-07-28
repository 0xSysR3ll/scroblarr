import { afterEach, describe, expect, it, vi } from "vitest";

describe("logger LOG_LEVEL", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts case-insensitive LOG_LEVEL values", async () => {
    vi.stubEnv("LOG_LEVEL", " DEBUG ");
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    const consoleStdout = (
      console as Console & { _stdout?: NodeJS.WritableStream }
    )._stdout;
    if (!consoleStdout) {
      throw new Error("console._stdout is unavailable in this environment");
    }

    const writes: string[] = [];
    const originalWrite = consoleStdout.write.bind(consoleStdout);
    vi.spyOn(consoleStdout, "write").mockImplementation(((
      chunk: string | Uint8Array,
      ...args: unknown[]
    ) => {
      writes.push(String(chunk));
      return (
        originalWrite as (
          chunk: string | Uint8Array,
          ...args: unknown[]
        ) => boolean
      )(chunk, ...args);
    }) as typeof consoleStdout.write);

    const { logger } = await import("./logger");
    logger.system.debug("debug-enabled");

    await new Promise((resolve) => setImmediate(resolve));

    expect(writes.join("\n")).toContain("debug-enabled");
  });
});
