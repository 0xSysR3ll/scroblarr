import type { User } from "@entities/User";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { UserRepository } from "@repositories/UserRepository";
import { timingSafeStringEqual } from "@utils/timingSafeEqual";
import type { NextFunction, Request, Response } from "express";

export type ResolveRequestAuthResult =
  | { kind: "missing" }
  | { kind: "apiKey"; valid: boolean }
  | { kind: "session"; user: User | null };

/**
 * Resolve API-key or session credentials from the request.
 */
export async function resolveRequestAuth(
  req: Request
): Promise<ResolveRequestAuthResult> {
  const bearerToken = req.headers.authorization?.replace("Bearer ", "");
  const cookieToken = (req as Request & { cookies?: { session?: string } })
    .cookies?.session;
  const apiKey = req.headers["x-api-key"] as string | undefined;

  if (!bearerToken && !cookieToken && !apiKey) {
    return { kind: "missing" };
  }

  if (apiKey) {
    const settingsRepository = new SettingsRepository();
    const storedApiKey = await settingsRepository.get("apiKey");
    const valid = !!(
      storedApiKey && timingSafeStringEqual(apiKey, storedApiKey)
    );
    return { kind: "apiKey", valid };
  }

  const userRepository = new UserRepository();
  const tokenToUse = cookieToken || bearerToken!;
  const user = await userRepository.findBySessionToken(tokenToUse);
  return { kind: "session", user };
}

export function createSessionAuth(options: { requireAdmin: boolean }) {
  return async function sessionAuth(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const resolved = await resolveRequestAuth(req);

    if (resolved.kind === "missing") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (resolved.kind === "apiKey") {
      if (resolved.valid) {
        req.apiKeyAuth = true;
        next();
        return;
      }
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    if (options.requireAdmin) {
      if (!resolved.user || !resolved.user.isAdmin) {
        res.status(403).json({ error: "Forbidden: Admin access required" });
        return;
      }
    } else if (!resolved.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    (req as Request & { user: NonNullable<typeof resolved.user> }).user =
      resolved.user!;
    next();
  };
}
