import { Request, Response, NextFunction } from "express";
import { UserRepository } from "@repositories/UserRepository";
import { SettingsRepository } from "@repositories/SettingsRepository";

export async function auth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const bearerToken = req.headers.authorization?.replace("Bearer ", "");
  const apiKey = req.headers["x-api-key"] as string | undefined;

  if (!bearerToken && !apiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (apiKey) {
    const settingsRepository = new SettingsRepository();
    const storedApiKey = await settingsRepository.get("apiKey");

    if (storedApiKey && apiKey === storedApiKey) {
      (req as Request & { apiKeyAuth: boolean }).apiKeyAuth = true;
      next();
      return;
    } else {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }
  }

  if (bearerToken) {
    const userRepository = new UserRepository();
    const user = await userRepository.findByAccessToken(bearerToken);

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    (req as Request & { user: typeof user }).user = user;
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
