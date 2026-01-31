import { Request, Response, NextFunction } from "express";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { logger } from "@utils/logger";

export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string | undefined;

  if (!apiKey) {
    res.status(401).json({ error: "API key required" });
    return;
  }

  try {
    const settingsRepository = new SettingsRepository();
    const storedKey = await settingsRepository.get("apiKey");

    if (!storedKey || storedKey !== apiKey) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    (req as Request & { apiKey: { value: string } }).apiKey = {
      value: storedKey,
    };
    next();
  } catch (error) {
    logger.api.error({ error }, "Error validating API key");
    res.status(500).json({ error: "Internal server error" });
  }
}
