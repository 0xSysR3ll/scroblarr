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
    vi.stubEnv("LOG_TO_FILE", "false");
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

describe("resolveLogToFile", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function loadResolver() {
    vi.stubEnv("LOG_TO_FILE", "false");
    vi.resetModules();
    return import("./logger");
  }

  it("enables file logging when LOG_TO_FILE is unset or truthy", async () => {
    const { resolveLogToFile } = await loadResolver();
    expect(resolveLogToFile(undefined)).toBe(true);
    expect(resolveLogToFile("")).toBe(true);
    expect(resolveLogToFile("true")).toBe(true);
    expect(resolveLogToFile("1")).toBe(true);
  });

  it("disables file logging for false, 0, and no", async () => {
    const { resolveLogToFile } = await loadResolver();
    expect(resolveLogToFile("false")).toBe(false);
    expect(resolveLogToFile("FALSE")).toBe(false);
    expect(resolveLogToFile(" 0 ")).toBe(false);
    expect(resolveLogToFile("no")).toBe(false);
  });
});
