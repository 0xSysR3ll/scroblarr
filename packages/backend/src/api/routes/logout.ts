import { getEnv } from "@config/env";
import { SessionRepository } from "@repositories/SessionRepository";
import { Router, Request, Response } from "express";

import { auth } from "../middleware/auth";

const router = Router();
const sessionRepository = new SessionRepository();

router.post("/", auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const env = getEnv();
    const bearerToken = req.headers.authorization?.replace("Bearer ", "");
    const cookieToken = (req as Request & { cookies?: { session?: string } })
      .cookies?.session;
    const token = cookieToken || bearerToken;
    if (token) {
      await sessionRepository.deleteByToken(token);
    }

    res
      .cookie("session", "", {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
      })
      .json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to logout" });
  }
});

export { router as logoutRoutes };
