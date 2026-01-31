import { Router, Request, Response } from "express";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import { adminAuth } from "../middleware/adminAuth";
import { logger } from "@utils/logger";
import { createReadStream } from "fs";
import { getDataDir } from "@utils/paths";

const router = Router();
const logDir = join(getDataDir(), "logs");

const getLogsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 100)),
  level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
  label: z
    .enum([
      "webhook",
      "sync",
      "auth",
      "api",
      "database",
      "tvtime",
      "plex",
      "system",
      "migration",
    ])
    .optional(),
  search: z.string().optional(),
});

router.use(adminAuth);

router.get("/", async (req: Request, res: Response) => {
  try {
    const query = getLogsQuerySchema.parse(req.query);

    if (query.page < 1) {
      return res.status(400).json({ error: "Page must be greater than 0" });
    }
    if (query.pageSize < 1 || query.pageSize > 1000) {
      return res
        .status(400)
        .json({ error: "Page size must be between 1 and 1000" });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const logFilePath = join(logDir, `scroblarr-${year}${month}${day}.log`);

    try {
      await stat(logFilePath);
    } catch {
      return res.json({
        logs: [],
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
          totalPages: 0,
        },
      });
    }

    const fileContent = await readFile(logFilePath, "utf-8");
    const allLines = fileContent.split("\n").filter((line) => line.trim());

    let filteredLines = allLines;

    if (query.label) {
      filteredLines = filteredLines.filter((line) => {
        try {
          const logEntry = JSON.parse(line);
          return logEntry.label === query.label;
        } catch {
          return false;
        }
      });
    }

    if (query.level) {
      const targetLevel = getLogLevelNumber(query.level);
      filteredLines = filteredLines.filter((line) => {
        try {
          const logEntry = JSON.parse(line);
          return logEntry.level === targetLevel;
        } catch {
          return false;
        }
      });
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      filteredLines = filteredLines.filter((line) =>
        line.toLowerCase().includes(searchLower)
      );
    }

    const total = filteredLines.length;
    const totalPages = Math.ceil(total / query.pageSize);

    const reversedLines = filteredLines.reverse();
    const startIndex = (query.page - 1) * query.pageSize;
    const endIndex = startIndex + query.pageSize;
    const paginatedLines = reversedLines.slice(startIndex, endIndex);

    const logs = paginatedLines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { msg: line, time: Date.now(), level: 30 };
      }
    });

    return res.json({
      logs,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: error.errors });
    }
    logger.api.error({ error }, "Error fetching logs");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/files", async (_req: Request, res: Response) => {
  try {
    const files = await readdir(logDir);
    const logFiles = files.filter(
      (file) =>
        (file.startsWith("scroblarr") && file.endsWith(".log")) ||
        (file.startsWith("scroblarr") && file.endsWith(".gz"))
    );

    const fileStats = await Promise.all(
      logFiles.map(async (file) => {
        const filePath = join(logDir, file);
        const stats = await stat(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      })
    );

    fileStats.sort((a, b) => b.modified.localeCompare(a.modified));

    return res.json({ files: fileStats });
  } catch (error) {
    logger.api.error({ error }, "Error fetching log files");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/download/:filename", async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    if (!filename || !filename.startsWith("scroblarr")) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const filePath = join(logDir, filename);
    const stats = await stat(filePath);

    if (filename.endsWith(".gz")) {
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Length", stats.size.toString());
    } else {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Length", stats.size.toString());
    }

    const readStream = createReadStream(filePath);
    readStream.pipe(res);
    return;
  } catch (error) {
    logger.api.error({ error }, "Error downloading log file");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function getLogLevelNumber(level: string): number {
  const levels: Record<string, number> = {
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
  };
  return levels[level] || 30;
}

export { router as logsRoutes };
