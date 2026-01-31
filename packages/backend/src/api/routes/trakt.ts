import { Router, Request, Response } from "express";
import { z } from "zod";
import { auth } from "../middleware/auth";
import { UserRepository } from "@repositories/UserRepository";
import { User } from "@entities/User";
import { TraktOAuth } from "@integrations/trakt/TraktOAuth";
import { logger } from "@utils/logger";

const router = Router();
const userRepository = new UserRepository();

const linkTraktSchema = z.object({
  code: z.string().min(1),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

router.use(auth);

const authorizeTraktSchema = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

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

    const validated = authorizeTraktSchema.parse({
      clientId: req.query.clientId as string | undefined,
      clientSecret: req.query.clientSecret as string | undefined,
    });

    const clientId = validated.clientId || freshUser.traktClientId;
    const clientSecret = validated.clientSecret || freshUser.traktClientSecret;

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error:
          "Trakt client ID and secret are required. Please provide them in the request or configure them in your profile settings.",
      });
    }

    const redirectUri = "urn:ietf:wg:oauth:2.0:oob";
    const traktOAuth = new TraktOAuth(clientId, clientSecret);
    const authUrl = traktOAuth.getAuthUrl(redirectUri);

    return res.json({
      authUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }
    logger.trakt.error({ error }, "Error getting Trakt authorization URL");
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to get authorization URL";
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

    const validated = linkTraktSchema.parse(req.body);

    const clientId = validated.clientId || freshUser.traktClientId;
    const clientSecret = validated.clientSecret || freshUser.traktClientSecret;

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error:
          "Trakt client ID and secret are required. Please provide them when linking or configure them in your profile settings first.",
      });
    }

    const redirectUri = "urn:ietf:wg:oauth:2.0:oob";
    const traktOAuth = new TraktOAuth(clientId, clientSecret);
    const tokens = await traktOAuth.exchangeCodeForToken(
      validated.code,
      redirectUri
    );

    let username: string | undefined;
    let avatar: string | undefined;
    try {
      const response = await fetch(
        "https://api.trakt.tv/users/me?extended=full",
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            "trakt-api-version": "2",
            "trakt-api-key": clientId,
            "User-Agent": "Scroblarr/1.0.0",
          },
        }
      );

      if (response.ok) {
        const profile = (await response.json()) as {
          username?: string;
          images?: {
            avatar?: {
              full?: string;
            };
          };
        };
        username = profile.username;
        avatar = profile.images?.avatar?.full;
      }
    } catch (error) {
      logger.trakt.warn({ error }, "Failed to fetch Trakt profile");
    }

    const updateData: Partial<User> = {
      traktAccessToken: tokens.accessToken,
      traktRefreshToken: tokens.refreshToken,
      traktTokenExpiresAt: tokens.expiresAt,
      traktUsername: username || undefined,
      traktThumb: avatar || undefined,
    };

    if (validated.clientId) {
      updateData.traktClientId = validated.clientId;
    }
    if (validated.clientSecret) {
      updateData.traktClientSecret = validated.clientSecret;
    }

    await userRepository.update(user.id, updateData);

    logger.trakt.info(
      {
        userId: user.id,
        username: user.plexUsername || user.jellyfinUsername,
        traktUsername: username,
      },
      "Trakt account linked"
    );

    return res.json({
      success: true,
    });
  } catch (error) {
    const user = req.user;
    logger.trakt.error(
      { error, userId: user?.id },
      "Error linking Trakt account"
    );
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }
    const errorMessage =
      error instanceof Error ? error.message : "Failed to link Trakt account";
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
      traktAccessToken: null,
      traktRefreshToken: null,
      traktTokenExpiresAt: null,
      traktUsername: null,
      traktThumb: null,
      traktClientId: null,
      traktClientSecret: null,
    } as unknown as Partial<User>);

    logger.trakt.info(
      {
        userId: user.id,
        username: user.plexUsername || user.jellyfinUsername,
      },
      "Trakt account unlinked"
    );

    return res.json({
      success: true,
    });
  } catch (error) {
    const user = req.user;
    logger.trakt.error(
      { error, userId: user?.id },
      "Error unlinking Trakt account"
    );
    const errorMessage =
      error instanceof Error ? error.message : "Failed to unlink Trakt account";
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
      linked: !!freshUser.traktAccessToken,
      username: freshUser.traktUsername || null,
      image: freshUser.traktThumb || null,
      hasCredentials: !!(
        freshUser.traktClientId && freshUser.traktClientSecret
      ),
    });
  } catch (error) {
    const user = req.user;
    logger.trakt.error(
      { error, userId: user?.id },
      "Error getting Trakt status"
    );
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get Trakt status";
    return res.status(500).json({ error: errorMessage });
  }
});

export { router as traktRoutes };
