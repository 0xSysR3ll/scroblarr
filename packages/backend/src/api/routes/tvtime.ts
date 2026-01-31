import { Router, Request, Response } from "express";
import { z } from "zod";
import { auth } from "../middleware/auth";
import { UserRepository } from "@repositories/UserRepository";
import { User } from "@entities/User";
import { TVTimeAuth } from "@integrations/tvtime/TVTimeAuth";
import { TVTimeClient } from "@integrations/tvtime/TVTimeClient";
import { TVTimeTokenManager } from "@integrations/tvtime/TVTimeTokenManager";
import { logger } from "@utils/logger";

const router = Router();
const userRepository = new UserRepository();

interface TVTimeProfileResponse {
  id: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
}

// Profile cache - keyed by user ID
const profileCache = new Map<
  string,
  { data: TVTimeProfileResponse; expiry: number }
>();
const PROFILE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const linkTVTimeSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.use(auth);

router.post("/link", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validated = linkTVTimeSchema.parse(req.body);
    const tvTimeAuth = new TVTimeAuth();

    const tokens = await tvTimeAuth.login(validated.email, validated.password);

    let tvtimeThumb: string | undefined;
    try {
      const tvTimeClient = new TVTimeClient();
      const profile = await tvTimeClient.getUserProfile(tokens.accessToken);
      tvtimeThumb = profile.image;
    } catch {
      // Ignore profile fetch failures
    }

    await userRepository.update(user.id, {
      tvtimeEmail: validated.email,
      tvtimePassword: validated.password,
      tvtimeAccessToken: tokens.accessToken,
      tvtimeRefreshToken: tokens.refreshToken,
      tvtimeThumb: tvtimeThumb || undefined,
    });

    profileCache.delete(user.id);

    logger.tvtime.info(
      {
        userId: user.id,
        username: user.plexUsername || user.jellyfinUsername,
        tvtimeEmail: validated.email,
      },
      "TVTime account linked"
    );

    return res.json({
      success: true,
    });
  } catch (error) {
    const user = req.user;
    logger.tvtime.error(
      { error, userId: user?.id },
      "Error linking TVTime account"
    );
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }
    const errorMessage =
      error instanceof Error ? error.message : "Failed to link TVTime account";
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
      tvtimeEmail: null,
      tvtimePassword: null,
      tvtimeAccessToken: null,
      tvtimeRefreshToken: null,
      tvtimeUsername: null,
      tvtimeThumb: null,
    } as unknown as Partial<User>);

    // Clear profile cache
    profileCache.delete(user.id);

    logger.tvtime.info(
      {
        userId: user.id,
        username: user.plexUsername || user.jellyfinUsername,
      },
      "TVTime account unlinked"
    );

    return res.json({
      success: true,
    });
  } catch (error) {
    const user = req.user;
    logger.tvtime.error(
      { error, userId: user?.id },
      "Error unlinking TVTime account"
    );
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to unlink TVTime account";
    return res.status(500).json({ error: errorMessage });
  }
});

router.get("/status", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Fetch fresh user data from database to avoid stale cache
    const freshUser = await userRepository.findById(user.id);
    if (!freshUser) {
      return res.status(401).json({ error: "User not found" });
    }

    return res.json({
      linked: !!freshUser.tvtimeAccessToken,
      email: freshUser.tvtimeEmail || null,
      username: freshUser.tvtimeUsername || null,
    });
  } catch (error) {
    const user = req.user;
    logger.tvtime.error(
      { error, userId: user?.id },
      "Error getting TVTime status"
    );
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get TVTime status";
    return res.status(500).json({ error: errorMessage });
  }
});

router.get("/profile", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!user.tvtimeAccessToken) {
      return res.status(400).json({ error: "TVTime account not linked" });
    }

    // Check cache first
    const cached = profileCache.get(user.id);
    if (cached && Date.now() < cached.expiry) {
      return res.json(cached.data);
    }

    const tokenManager = new TVTimeTokenManager();
    const tvTimeClient = new TVTimeClient();

    const accessToken = await tokenManager.getValidAccessToken(user.id);
    const profile = await tvTimeClient.getUserProfile(accessToken);

    if (profile.username && profile.username !== user.tvtimeUsername) {
      const updateData: Partial<User> = {
        tvtimeUsername: profile.username,
      };
      if (profile.image) {
        updateData.tvtimeThumb = profile.image;
      }
      await userRepository.update(user.id, updateData);
    } else if (profile.image && profile.image !== user.tvtimeThumb) {
      await userRepository.update(user.id, {
        tvtimeThumb: profile.image,
      });
    }

    const responseData = {
      id: profile.id || null,
      username: profile.username || user.tvtimeUsername || null,
      email: profile.email || user.tvtimeEmail || null,
      image: profile.image || null,
    };

    // Cache the response
    profileCache.set(user.id, {
      data: responseData,
      expiry: Date.now() + PROFILE_CACHE_TTL,
    });

    return res.json(responseData);
  } catch (error) {
    const user = req.user;
    logger.tvtime.error(
      { error, userId: user?.id },
      "Error getting TVTime profile"
    );
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get TVTime profile";
    return res.status(500).json({ error: errorMessage });
  }
});

export { router as tvtimeRoutes };
