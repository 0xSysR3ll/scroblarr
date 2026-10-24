import { User } from "@entities/User";
import { isSimklV2AccessToken } from "@integrations/simkl/SimklApi";
import { SimklClient } from "@integrations/simkl/SimklClient";
import {
  getSimklClientId,
  isOfficialSimklClientId,
} from "@integrations/simkl/simklConfig";
import {
  clearSimklDevice,
  rememberSimklDevice,
  resolveSimklDeviceCode,
  SimklOAuth,
} from "@integrations/simkl/SimklOAuth";
import { SimklTokenManager } from "@integrations/simkl/SimklTokenManager";
import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";
import { requireFreshUser, requireRequestUser } from "@utils/requireFreshUser";
import { Router, Request, Response } from "express";
import { z } from "zod";

import { auth } from "../middleware/auth";

const router = Router();
const userRepository = new UserRepository();

const linkSimklSchema = z.object({
  userCode: z.string().min(1),
});

router.use(auth);

function userNeedsSimklReconnect(user: User): boolean {
  if (!user.simklAccessToken) {
    return false;
  }
  if (!isSimklV2AccessToken(user.simklAccessToken)) {
    return true;
  }
  return !isOfficialSimklClientId(user.simklClientId);
}

router.get("/authorize", async (req: Request, res: Response) => {
  try {
    const freshUser = await requireFreshUser(req, res, userRepository);
    if (!freshUser) {
      return;
    }

    const clientId = getSimklClientId();
    const simklOAuth = new SimklOAuth(clientId);
    const pin = await simklOAuth.requestPinCode();
    rememberSimklDevice(freshUser.id, pin);

    return res.json({
      userCode: pin.user_code,
      verificationUrl: pin.verification_uri_complete || pin.verification_uri,
      expiresIn: pin.expires_in,
      interval: pin.interval,
    });
  } catch (error) {
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
    const freshUser = await requireFreshUser(req, res, userRepository);
    if (!freshUser) {
      return;
    }
    const user = freshUser;

    const validated = linkSimklSchema.parse(req.body);
    const clientId = getSimklClientId();
    const previousClientId = user.simklClientId;
    const previousRefreshToken = user.simklRefreshToken;

    const deviceCode = resolveSimklDeviceCode(user.id, validated.userCode);
    const simklOAuth = new SimklOAuth(clientId);
    const tokens = await simklOAuth.exchangePinForToken(deviceCode);
    clearSimklDevice(user.id);

    if (
      previousRefreshToken &&
      previousClientId &&
      previousClientId !== clientId
    ) {
      try {
        const previousOAuth = new SimklOAuth(previousClientId);
        await previousOAuth.revokeToken(previousRefreshToken);
      } catch (error) {
        logger.simkl.warn(
          { error, userId: user.id },
          "Failed to revoke previous Simkl token during reconnect"
        );
      }
    }

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

    await userRepository.update(user.id, {
      simklAccessToken: tokens.accessToken,
      simklRefreshToken: tokens.refreshToken ?? null,
      simklTokenExpiresAt: tokens.expiresAt ?? null,
      simklUsername: username,
      simklThumb: avatar,
      simklClientId: clientId,
    } as unknown as Partial<User>);

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
    logger.simkl.error(
      { error, userId: user?.id },
      "Error linking Simkl account"
    );
    if (/device code expired|PIN code does not match/i.test(errorMessage)) {
      return res.status(400).json({ error: errorMessage });
    }
    return res.status(500).json({ error: errorMessage });
  }
});

router.post("/unlink", async (req: Request, res: Response) => {
  try {
    const user = requireRequestUser(req, res);
    if (!user) {
      return;
    }

    const freshUser = await userRepository.findById(user.id);
    if (freshUser?.simklClientId && freshUser.simklRefreshToken) {
      try {
        const simklOAuth = new SimklOAuth(freshUser.simklClientId);
        await simklOAuth.revokeToken(freshUser.simklRefreshToken);
      } catch (error) {
        logger.simkl.warn(
          { error, userId: user.id },
          "Failed to revoke Simkl token during unlink"
        );
      }
    }

    await userRepository.update(user.id, {
      simklAccessToken: null,
      simklRefreshToken: null,
      simklTokenExpiresAt: null,
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
    const freshUser = await requireFreshUser(req, res, userRepository);
    if (!freshUser) {
      return;
    }

    return res.json({
      linked: !!freshUser.simklAccessToken,
      username: freshUser.simklUsername || null,
      image: freshUser.simklThumb || null,
      hasCredentials: true,
      needsReconnect: userNeedsSimklReconnect(freshUser),
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
    const freshUser = await requireFreshUser(req, res, userRepository);
    if (!freshUser) {
      return;
    }
    const user = freshUser;

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
