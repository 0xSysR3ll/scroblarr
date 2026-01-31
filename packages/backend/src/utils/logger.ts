import pino, { LevelWithSilent } from "pino";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { hostname } from "os";
import { createStream } from "rotating-file-stream";
import { getDataDir } from "./paths";

const isDevelopment = process.env.NODE_ENV !== "production";

type LogLevel = LevelWithSilent;

const isValidLogLevel = (value: string): value is LogLevel => {
  return (
    value === "fatal" ||
    value === "error" ||
    value === "warn" ||
    value === "info" ||
    value === "debug" ||
    value === "trace" ||
    value === "silent"
  );
};

const resolvedLogLevel = (() => {
  const envLevel = process.env.LOG_LEVEL;
  if (envLevel && isValidLogLevel(envLevel)) {
    return envLevel;
  }
  return (isDevelopment ? "debug" : "info") as LogLevel;
})();

const logDir = join(getDataDir(), "logs");

try {
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
} catch (error) {
  console.error("Failed to create log directory:", error);
}

const streams: Array<{ level: LogLevel; stream: any }> = [
  {
    level: resolvedLogLevel,
    stream: pino.destination({
      sync: false,
      dest: 1, // stdout
    }),
  },
];

let fileStreamCreated = false;

type LogSize = `${number}B` | `${number}K` | `${number}M` | `${number}G`;

const parseLogSize = (value: string | undefined): LogSize => {
  const defaultSize: LogSize = "10M";
  if (!value) {
    return defaultSize;
  }
  const normalized = value.toUpperCase();
  const match = normalized.match(/^(\d+)([BKMG])$/);
  if (!match) {
    return defaultSize;
  }
  const [, amount, unit] = match;
  return `${amount}${unit}` as LogSize;
};

if (process.env.LOG_TO_FILE !== "false") {
  try {
    const maxSize = parseLogSize(process.env.LOG_MAX_SIZE);
    const maxFiles = parseInt(process.env.LOG_MAX_FILES || "5", 10);

    const filenameGenerator = (time: number | Date | null, _index?: number) => {
      // Format: scroblarr-YYYYMMDD.log
      const date = time
        ? time instanceof Date
          ? time
          : new Date(time)
        : new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `scroblarr-${year}${month}${day}.log`;
    };

    const rotatingStream = createStream(filenameGenerator, {
      path: logDir,
      size: maxSize,
      interval: "1d",
      maxFiles,
      compress: "gzip",
    });

    rotatingStream.on("error", (error: unknown) => {
      console.error("Log file stream error:", error);
    });

    streams.push({
      level: resolvedLogLevel,
      stream: rotatingStream,
    });

    fileStreamCreated = true;
  } catch (error) {
    console.error("Failed to create rotating file stream:", error);
  }
}

const pinoConfig: pino.LoggerOptions = {
  level: resolvedLogLevel,
  base: {
    name: "scroblarr",
    hostname: hostname(),
    pid: process.pid,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label, number) => {
      return { level: number, severity: label.toUpperCase() };
    },
  },
  serializers: {
    error: (err: unknown) => {
      if (err instanceof Error) {
        return pino.stdSerializers.err(err);
      }
      if (err && typeof err === "object") {
        const objectError = err as Record<string, unknown> & {
          message?: unknown;
          stack?: unknown;
          name?: unknown;
        };
        return {
          ...objectError,
          message:
            typeof objectError.message === "string"
              ? objectError.message
              : String(err),
          stack:
            typeof objectError.stack === "string"
              ? objectError.stack
              : undefined,
          name:
            typeof objectError.name === "string" ? objectError.name : "Error",
        };
      }
      return {
        message: String(err),
        type: typeof err,
      };
    },
  },
};

let baseLogger: pino.Logger;

if (streams.length > 1) {
  baseLogger = pino(pinoConfig, pino.multistream(streams as any));
} else if (isDevelopment) {
  baseLogger = pino({
    ...pinoConfig,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
        singleLine: false,
        hideObject: false,
      },
    },
  });
} else {
  baseLogger = pino(pinoConfig);
}

export type LogLabel =
  | "webhook"
  | "sync"
  | "auth"
  | "api"
  | "database"
  | "tvtime"
  | "trakt"
  | "plex"
  | "jellyfin"
  | "system"
  | "migration";

const createLabeledLogger = (label: LogLabel) => {
  return baseLogger.child({ label });
};

const logger = {
  webhook: createLabeledLogger("webhook"),
  sync: createLabeledLogger("sync"),
  auth: createLabeledLogger("auth"),
  api: createLabeledLogger("api"),
  database: createLabeledLogger("database"),
  tvtime: createLabeledLogger("tvtime"),
  trakt: createLabeledLogger("trakt"),
  plex: createLabeledLogger("plex"),
  jellyfin: createLabeledLogger("jellyfin"),
  system: createLabeledLogger("system"),
  migration: createLabeledLogger("migration"),
  flush: () => baseLogger.flush(),
} as const;

if (fileStreamCreated) {
  process.on("SIGINT", () => {
    logger.system.debug("Received SIGINT, flushing logs...");
    logger.flush();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.system.debug("Received SIGTERM, flushing logs...");
    logger.flush();
    process.exit(0);
  });
}

export { logger };
