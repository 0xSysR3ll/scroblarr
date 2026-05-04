import { SettingsRepository } from "@repositories/SettingsRepository";
import { UserRepository } from "@repositories/UserRepository";
import { timingSafeStringEqual } from "@utils/timingSafeEqual";
import { Request, Response, NextFunction } from "express";

export async function auth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const bearerToken = req.headers.authorization?.replace("Bearer ", "");
  const cookieToken = (req as Request & { cookies?: { session?: string } })
    .cookies?.session;
  const apiKey = req.headers["x-api-key"] as string | undefined;

  if (!bearerToken && !cookieToken && !apiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (apiKey) {
    const settingsRepository = new SettingsRepository();
    const storedApiKey = await settingsRepository.get("apiKey");

    if (storedApiKey && timingSafeStringEqual(apiKey, storedApiKey)) {
      req.apiKeyAuth = true;
      next();
      return;
    } else {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }
  }

  if (bearerToken || cookieToken) {
    const userRepository = new UserRepository();
    const tokenToUse = cookieToken || bearerToken!;

    const userFromSession = await userRepository.findBySessionToken(tokenToUse);
    const user =
      userFromSession || (await userRepository.findByAccessToken(tokenToUse));

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
