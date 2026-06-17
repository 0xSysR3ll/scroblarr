import { User } from "@entities/User";
import { SimklClient } from "@integrations/simkl/SimklClient";
import { SimklOAuth } from "@integrations/simkl/SimklOAuth";
import { SimklTokenManager } from "@integrations/simkl/SimklTokenManager";
import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";
import { Router, Request, Response } from "express";
import { z } from "zod";

import { auth } from "../middleware/auth";

const router = Router();
const userRepository = new UserRepository();

const authorizeSimklSchema = z.object({
  clientId: z.string().optional(),
});

const linkSimklSchema = z.object({
  userCode: z.string().min(1),
  clientId: z.string().optional(),
});

router.use(auth);

function getSimklCredentials(
  validated: {
    clientId?: string;
  },
  user: User
): {
  clientId?: string;
} {
  return {
    clientId: validated.clientId || user.simklClientId,
  };
}

router.get("/authorize", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const freshUser = await userRepository.findById(user.id);
    if (!freshUser) {
      return res.status(401).json({ error: "User not found" });
    }

    const validated = authorizeSimklSchema.parse({
      clientId: req.query.clientId as string | undefined,
    });
    const { clientId } = getSimklCredentials(validated, freshUser);

    if (!clientId) {
      return res.status(400).json({
        error:
          "Simkl client ID is required. Please provide it in the request or configure it in your profile settings.",
      });
    }

    const simklOAuth = new SimklOAuth(clientId);
    const pin = await simklOAuth.requestPinCode();
    return res.json({
      userCode: pin.user_code,
      verificationUrl: pin.verification_url,
      expiresIn: pin.expires_in,
      interval: pin.interval,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.issues,
      });
    }
    logger.simkl.error({ error }, "Error getting Simkl authorization URL");
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to get Simkl authorization URL";
    return res.status(500).json({ error: errorMessage });
  }
});

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

    const validated = linkSimklSchema.parse(req.body);
    const { clientId } = getSimklCredentials(validated, freshUser);

    if (!clientId) {
      return res.status(400).json({
        error:
          "Simkl client ID is required. Please provide it when linking or configure it in your profile settings first.",
      });
    }

    const simklOAuth = new SimklOAuth(clientId);
    const tokens = await simklOAuth.exchangePinForToken(validated.userCode);

    let username: string | undefined;
    let avatar: string | undefined;
    try {
      const simklClient = new SimklClient(clientId);
      const profile = await simklClient.getUserProfile(tokens.accessToken);
      username = profile.username || undefined;
      avatar = profile.image || undefined;
    } catch (error) {
      logger.simkl.warn({ error }, "Failed to fetch Simkl profile");
    }

    const updateData: Partial<User> = {
      simklAccessToken: tokens.accessToken,
      simklUsername: username,
      simklThumb: avatar,
    };

    if (validated.clientId) {
      updateData.simklClientId = validated.clientId;
    }

    await userRepository.update(user.id, updateData);

    logger.simkl.info(
      {
        userId: user.id,
        username: user.plexUsername || user.jellyfinUsername,
        simklUsername: username,
      },
      "Simkl account linked"
    );

    return res.json({ success: true });
  } catch (error) {
    const user = req.user;
    logger.simkl.error(
      { error, userId: user?.id },
      "Error linking Simkl account"
    );
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.issues,
      });
    }
    const errorMessage =
      error instanceof Error ? error.message : "Failed to link Simkl account";
    if (/authorization pending|slow down/i.test(errorMessage)) {
      return res.status(400).json({ error: errorMessage });
    }
    return res.status(500).json({ error: errorMessage });
  }
});

router.post("/unlink", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await userRepository.update(user.id, {
      simklAccessToken: null,
      simklUsername: null,
      simklThumb: null,
      simklClientId: null,
    } as unknown as Partial<User>);

    logger.simkl.info(
      {
        userId: user.id,
        username: user.plexUsername || user.jellyfinUsername,
      },
      "Simkl account unlinked"
    );

    return res.json({ success: true });
  } catch (error) {
    const user = req.user;
    logger.simkl.error(
      { error, userId: user?.id },
      "Error unlinking Simkl account"
    );
    const errorMessage =
      error instanceof Error ? error.message : "Failed to unlink Simkl account";
    return res.status(500).json({ error: errorMessage });
  }
});

router.get("/status", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const freshUser = await userRepository.findById(user.id);
    if (!freshUser) {
      return res.status(401).json({ error: "User not found" });
    }

    return res.json({
      linked: !!freshUser.simklAccessToken,
      username: freshUser.simklUsername || null,
      image: freshUser.simklThumb || null,
      hasCredentials: !!freshUser.simklClientId,
    });
  } catch (error) {
    const user = req.user;
    logger.simkl.error(
      { error, userId: user?.id },
      "Error getting Simkl status"
    );
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get Simkl status";
    return res.status(500).json({ error: errorMessage });
  }
});

router.get("/profile", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const freshUser = await userRepository.findById(user.id);
    if (!freshUser) {
      return res.status(401).json({ error: "User not found" });
    }

    if (!freshUser.simklAccessToken || !freshUser.simklClientId) {
      return res.status(400).json({ error: "Simkl account not linked" });
    }

    const tokenManager = new SimklTokenManager();
    const accessToken = await tokenManager.getValidAccessToken(user.id);
    const simklClient = new SimklClient(freshUser.simklClientId);
    const profile = await simklClient.getUserProfile(accessToken);

    const updateData: Partial<User> = {};
    if (profile.username && profile.username !== freshUser.simklUsername) {
      updateData.simklUsername = profile.username;
    }
    if (profile.image && profile.image !== freshUser.simklThumb) {
      updateData.simklThumb = profile.image;
    }
    if (Object.keys(updateData).length > 0) {
      await userRepository.update(user.id, updateData);
    }

    return res.json({
      id: profile.id,
      username: profile.username || freshUser.simklUsername || null,
      image: profile.image || freshUser.simklThumb || null,
    });
  } catch (error) {
    const user = req.user;
    logger.simkl.error(
      { error, userId: user?.id },
      "Error getting Simkl profile"
    );
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get Simkl profile";
    return res.status(500).json({ error: errorMessage });
  }
});

export { router as simklRoutes };
