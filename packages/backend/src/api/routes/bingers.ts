import { BingersApiError } from "@integrations/bingers/BingersApiError";
import {
  BingersAuth,
  extractMagicLinkToken,
} from "@integrations/bingers/BingersAuth";
import { BingersSessionManager } from "@integrations/bingers/BingersSessionManager";
import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";
import { Router, Request, Response } from "express";
import { z } from "zod";

import { auth } from "../middleware/auth";

const router = Router();
const userRepository = new UserRepository();
const bingersAuth = new BingersAuth();
const sessionManager = new BingersSessionManager(userRepository, bingersAuth);

const linkSchema = z.object({
  token: z.string().min(1),
});

router.use(auth);

router.post("/link", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const freshUser = await userRepository.findById(user.id);
    if (!freshUser) {
      return res.status(401).json({ error: "User not found" });
    }

    const validated = linkSchema.parse(req.body);
    const token = extractMagicLinkToken(validated.token);
    const session = await bingersAuth.verifyMagicLink(token);
    // Prefer session email from Bingers; only fall back to a previously stored
    // server-side value — never trust a client-supplied email.
    await sessionManager.storeSessionFromVerify(
      user.id,
      session,
      freshUser.bingersEmail
    );

    logger.bingers.info(
      {
        userId: user.id,
        bingersUserId: session.user?.id,
        hasEmail: !!(session.user?.email || freshUser.bingersEmail),
      },
      "Bingers account linked"
    );

    return res.json({ success: true });
  } catch (error) {
    const user = req.user;
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.issues,
      });
    }
    if (error instanceof BingersApiError) {
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 400;
      return res.status(status).json({
        error: error.message,
        code: error.code,
      });
    }
    logger.bingers.error(
      { error, userId: user?.id },
      "Error linking Bingers account"
    );
    return res.status(500).json({ error: "Failed to link Bingers account" });
  }
});

router.post("/unlink", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await sessionManager.clearAll(user.id);

    logger.bingers.info(
      {
        userId: user.id,
        username: user.plexUsername || user.jellyfinUsername,
      },
      "Bingers account unlinked"
    );

    return res.json({ success: true });
  } catch (error) {
    const user = req.user;
    logger.bingers.error(
      { error, userId: user?.id },
      "Error unlinking Bingers account"
    );
    return res.status(500).json({ error: "Failed to unlink Bingers account" });
  }
});

router.get("/status", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const status = await sessionManager.validateAndRefresh(user.id);

    return res.json({
      linked: status.linked,
      needsReauthorization: status.needsReauthorization,
      username: status.username,
      image: status.image,
    });
  } catch (error) {
    const user = req.user;
    logger.bingers.error(
      { error, userId: user?.id },
      "Error getting Bingers status"
    );
    return res.status(500).json({ error: "Failed to get Bingers status" });
  }
});

export { router as bingersRoutes };
