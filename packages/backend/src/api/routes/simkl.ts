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
import {
  clearSimklRewatchSessionCacheForUser,
  isSimklRewatchPlan,
  type SimklAccountType,
} from "@integrations/simkl/simklRewatch";
import { SimklTokenManager } from "@integrations/simkl/SimklTokenManager";
import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";
import { requireFreshUser, requireRequestUser } from "@utils/requireFreshUser";
import { Router, Request, Response } from "express";
import { z } from "zod";

import { auth } from "../middleware/auth";

const router = Router();
const userRepository = new UserRepository();
const SIMKL_VIP_URL = "https://simkl.com/vip/";

const linkSimklSchema = z.object({
  userCode: z.string().min(1),
});

const settingsSchema = z.object({
  markMoviesAsRewatched: z.boolean(),
  markEpisodesAsRewatched: z.boolean(),
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

function buildSimklStatusPayload(user: User) {
  const accountType =
    (user.simklAccountType as SimklAccountType | null) || null;
  const canTrackRewatches = isSimklRewatchPlan(accountType);
  return {
    linked: !!user.simklAccessToken,
    username: user.simklUsername || null,
    image: user.simklThumb || null,
    hasCredentials: true,
    needsReconnect: userNeedsSimklReconnect(user),
    accountType,
    canTrackRewatches,
    markMoviesAsRewatched: !!user.simklMarkMoviesAsRewatched,
    markEpisodesAsRewatched: !!user.simklMarkEpisodesAsRewatched,
  };
}

export async function refreshAndStoreSimklAccountType(
  user: User,
  accessToken: string
): Promise<SimklAccountType | null> {
  if (!user.simklClientId) {
    return null;
  }
  const simklClient = new SimklClient(user.simklClientId);
  const profile = await simklClient.getUserProfile(accessToken);
  const accountType = profile.accountType;

  const updateData: Partial<User> = {};
  if (accountType !== user.simklAccountType) {
    updateData.simklAccountType = accountType;
  }
  if (profile.username && profile.username !== user.simklUsername) {
    updateData.simklUsername = profile.username;
  }
  if (profile.image && profile.image !== user.simklThumb) {
    updateData.simklThumb = profile.image;
  }

  // Downgrade: stop sending allow_rewatch by clearing the opt-in toggles.
  if (accountType && !isSimklRewatchPlan(accountType)) {
    if (user.simklMarkMoviesAsRewatched) {
      updateData.simklMarkMoviesAsRewatched = false;
    }
    if (user.simklMarkEpisodesAsRewatched) {
      updateData.simklMarkEpisodesAsRewatched = false;
    }
  }

  if (Object.keys(updateData).length > 0) {
    await userRepository.update(user.id, updateData);
  }

  return accountType;
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

    let username: string | undefined;
    let avatar: string | undefined;
    let accountType: SimklAccountType | null = null;
    try {
      const simklClient = new SimklClient(clientId);
      const profile = await simklClient.getUserProfile(tokens.accessToken);
      username = profile.username || undefined;
      avatar = profile.image || undefined;
      accountType = profile.accountType;
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
      simklAccountType: accountType,
      ...(accountType && !isSimklRewatchPlan(accountType)
        ? {
            simklMarkMoviesAsRewatched: false,
            simklMarkEpisodesAsRewatched: false,
          }
        : {}),
    } as unknown as Partial<User>);

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
      simklAccountType: null,
      simklMarkMoviesAsRewatched: false,
      simklMarkEpisodesAsRewatched: false,
    } as unknown as Partial<User>);
    clearSimklRewatchSessionCacheForUser(user.id);

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
    let freshUser = await requireFreshUser(req, res, userRepository);
    if (!freshUser) {
      return;
    }

    // Refresh plan when unknown or free so upgrades become eligible without a settings save.
    if (
      freshUser.simklAccessToken &&
      freshUser.simklClientId &&
      !isSimklRewatchPlan(freshUser.simklAccountType)
    ) {
      try {
        const tokenManager = new SimklTokenManager();
        const accessToken = await tokenManager.getValidAccessToken(
          freshUser.id
        );
        await refreshAndStoreSimklAccountType(freshUser, accessToken);
        const reloaded = await userRepository.findById(freshUser.id);
        if (reloaded) {
          freshUser = reloaded;
        }
      } catch (error) {
        logger.simkl.warn(
          { error, userId: freshUser.id },
          "Failed to refresh Simkl account type"
        );
      }
    }

    return res.json(buildSimklStatusPayload(freshUser));
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

router.patch("/settings", async (req: Request, res: Response) => {
  try {
    const user = requireRequestUser(req, res);
    if (!user) {
      return;
    }

    let freshUser = await userRepository.findById(user.id);
    if (!freshUser?.simklAccessToken || !freshUser.simklClientId) {
      return res.status(400).json({
        error: "Link your Simkl account before changing sync settings",
      });
    }

    const validated = settingsSchema.parse(req.body);
    const enablingRewatch =
      validated.markMoviesAsRewatched || validated.markEpisodesAsRewatched;

    if (enablingRewatch) {
      const tokenManager = new SimklTokenManager();
      const accessToken = await tokenManager.getValidAccessToken(freshUser.id);
      try {
        await refreshAndStoreSimklAccountType(freshUser, accessToken);
      } catch (error) {
        if (
          error instanceof Error &&
          /^User .+ not found$/.test(error.message)
        ) {
          return res.status(404).json({ error: "User not found" });
        }
        throw error;
      }
      const reloaded = await userRepository.findById(freshUser.id);
      if (!reloaded) {
        return res.status(404).json({ error: "User not found" });
      }
      freshUser = reloaded;

      if (!isSimklRewatchPlan(freshUser.simklAccountType)) {
        return res.status(403).json({
          error: "Rewatch tracking requires Simkl PRO or VIP",
          code: "simkl_pro_required",
          upgradeUrl: SIMKL_VIP_URL,
        });
      }
    }

    const updated = await userRepository.update(user.id, {
      simklMarkMoviesAsRewatched: validated.markMoviesAsRewatched,
      simklMarkEpisodesAsRewatched: validated.markEpisodesAsRewatched,
    });

    return res.json({
      success: true,
      markMoviesAsRewatched: !!updated.simklMarkMoviesAsRewatched,
      markEpisodesAsRewatched: !!updated.simklMarkEpisodesAsRewatched,
      accountType: updated.simklAccountType || null,
      canTrackRewatches: isSimklRewatchPlan(updated.simklAccountType),
    });
  } catch (error) {
    const user = req.user;
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.issues,
      });
    }
    logger.simkl.error(
      { error, userId: user?.id },
      "Error updating Simkl settings"
    );
    return res.status(500).json({ error: "Failed to update Simkl settings" });
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
    if (profile.accountType !== freshUser.simklAccountType) {
      updateData.simklAccountType = profile.accountType;
    }
    if (profile.accountType && !isSimklRewatchPlan(profile.accountType)) {
      if (freshUser.simklMarkMoviesAsRewatched) {
        updateData.simklMarkMoviesAsRewatched = false;
      }
      if (freshUser.simklMarkEpisodesAsRewatched) {
        updateData.simklMarkEpisodesAsRewatched = false;
      }
    }
    if (Object.keys(updateData).length > 0) {
      await userRepository.update(user.id, updateData);
    }

    return res.json({
      id: profile.id,
      username: profile.username || freshUser.simklUsername || null,
      image: profile.image || freshUser.simklThumb || null,
      accountType: profile.accountType,
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
