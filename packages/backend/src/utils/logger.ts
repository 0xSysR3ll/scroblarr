import { mkdirSync, existsSync } from "fs";
import { hostname } from "os";
import { join } from "path";

import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

import { getDataDir } from "./paths";

export const formatDateUTC = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const isDevelopment = process.env.NODE_ENV !== "production";

const winstonLevels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
} as const;

type WinstonLevel = keyof typeof winstonLevels;

const levelToPinoNumber: Record<string, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

type LogLevel = WinstonLevel | "silent";

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

const resolvedLogLevel = ((): LogLevel => {
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

const parseMaxSize = (): string => {
  const raw = (process.env.LOG_MAX_SIZE || "10M").trim().toUpperCase();
  const match = raw.match(/^(\d+)([BKMG])$/);
  if (!match) {
    return "10m";
  }
  const [, amount, unit] = match;
  return `${amount}${unit.toLowerCase()}`;
};

const maxFiles = parseInt(process.env.LOG_MAX_FILES || "5", 10);

function normalizeErrorMeta(
  meta: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...meta };
  const err = out.error;
  if (err instanceof Error) {
    out.error = {
      type: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return out;
}

const pinoCompatFormat = winston.format((info) => {
  const out = info as unknown as Record<string, unknown>;
  const levelStr = String(info.level);
  const pinoLevel = levelToPinoNumber[levelStr];
  if (pinoLevel !== undefined) {
    out.level = pinoLevel;
    out.severity = levelStr.toUpperCase();
  }
  if (info.message != null && out.msg == null) {
    out.msg = info.message;
  }
  delete out.message;
  if (info.timestamp != null) {
    const parsed = Date.parse(String(info.timestamp));
    out.time = Number.isNaN(parsed) ? Date.now() : parsed;
    delete out.timestamp;
  }
  return info;
});

const jsonLogFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  pinoCompatFormat(),
  winston.format.json()
);

const prettyConsoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
  winston.format.printf((raw) => {
    const info = raw as Record<string, unknown>;
    const ts = String(info.timestamp ?? "");
    const lvl = String(info.level ?? "");
    const lbl =
      info.label != null && String(info.label) !== ""
        ? `[${String(info.label)}]`
        : "";
    const msg = info.message != null ? String(info.message) : "";
    const copy = { ...info };
    for (const k of [
      "timestamp",
      "level",
      "message",
      "label",
      "name",
      "hostname",
      "pid",
    ]) {
      delete copy[k];
    }
    const tail = Object.keys(copy).length > 0 ? ` ${JSON.stringify(copy)}` : "";
    return `${ts} ${lvl} ${lbl} ${msg}${tail}`.trim();
  })
);

let fileStreamCreated = false;
const transports: winston.transport[] = [];

if (process.env.LOG_TO_FILE !== "false") {
  try {
    transports.push(
      new DailyRotateFile({
        dirname: logDir,
        filename: "scroblarr-%DATE%.log",
        datePattern: "YYYYMMDD",
        utc: true,
        zippedArchive: true,
        maxSize: parseMaxSize(),
        maxFiles,
        format: jsonLogFormat,
      })
    );
    fileStreamCreated = true;
  } catch (error) {
    console.error("Failed to create rotating log transport:", error);
  }
}

transports.unshift(
  new winston.transports.Console({
    format:
      isDevelopment && !fileStreamCreated ? prettyConsoleFormat : jsonLogFormat,
  })
);

const rootLogger = winston.createLogger({
  level: resolvedLogLevel === "silent" ? "trace" : resolvedLogLevel,
  levels: winstonLevels,
  silent: resolvedLogLevel === "silent",
  defaultMeta: {
    name: "scroblarr",
    hostname: hostname(),
    pid: process.pid,
  },
  transports,
});

function dispatch(
  w: winston.Logger,
  level: WinstonLevel,
  first: string | Record<string, unknown>,
  second?: string
): void {
  if (typeof first === "string") {
    w.log(level, first);
    return;
  }
  const message = second ?? "";
  w.log({ level, message, ...normalizeErrorMeta(first) });
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

function wrapLabeled(w: winston.Logger) {
  return {
    fatal: (a: string | Record<string, unknown>, b?: string) =>
      dispatch(w, "fatal", a, b),
    error: (a: string | Record<string, unknown>, b?: string) =>
      dispatch(w, "error", a, b),
    warn: (a: string | Record<string, unknown>, b?: string) =>
      dispatch(w, "warn", a, b),
    info: (a: string | Record<string, unknown>, b?: string) =>
      dispatch(w, "info", a, b),
    debug: (a: string | Record<string, unknown>, b?: string) =>
      dispatch(w, "debug", a, b),
    trace: (a: string | Record<string, unknown>, b?: string) =>
      dispatch(w, "trace", a, b),
  };
}

const labeled = (label: LogLabel) => wrapLabeled(rootLogger.child({ label }));

const logger = {
  webhook: labeled("webhook"),
  sync: labeled("sync"),
  auth: labeled("auth"),
  api: labeled("api"),
  database: labeled("database"),
  tvtime: labeled("tvtime"),
  trakt: labeled("trakt"),
  plex: labeled("plex"),
  jellyfin: labeled("jellyfin"),
  system: labeled("system"),
  migration: labeled("migration"),
  flush: () => Promise.resolve(),
} as const;

export { logger };
