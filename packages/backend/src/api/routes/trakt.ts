import { User } from "@entities/User";
import {
  clearTraktPin,
  rememberTraktPin,
  resolveTraktDeviceCode,
  TraktOAuth,
} from "@integrations/trakt/TraktOAuth";
import { TraktTokenManager } from "@integrations/trakt/TraktTokenManager";
import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";
import { Router, Request, Response } from "express";
import { z } from "zod";

import { auth } from "../middleware/auth";

const router = Router();
const userRepository = new UserRepository();
const traktTokenManager = new TraktTokenManager();

const authorizeTraktSchema = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

const linkTraktSchema = z.object({
  userCode: z.string().min(1),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

router.use(auth);

function getTraktCredentials(
  validated: {
    clientId?: string;
    clientSecret?: string;
  },
  user: User
): {
  clientId?: string;
  clientSecret?: string;
} {
  return {
    clientId: validated.clientId || user.traktClientId,
    clientSecret: validated.clientSecret || user.traktClientSecret,
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

    const validated = authorizeTraktSchema.parse({
      clientId: req.query.clientId as string | undefined,
      clientSecret: req.query.clientSecret as string | undefined,
    });
    const { clientId, clientSecret } = getTraktCredentials(
      validated,
      freshUser
    );

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error:
          "Trakt client ID and secret are required. Please provide them in the request or configure them in your profile settings.",
      });
    }

    const traktOAuth = new TraktOAuth(clientId, clientSecret);
    const pin = await traktOAuth.requestPinCode();
    rememberTraktPin(user.id, pin);

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
    logger.trakt.error({ error }, "Error requesting Trakt PIN code");
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to request Trakt PIN code";
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
    const { clientId, clientSecret } = getTraktCredentials(
      validated,
      freshUser
    );

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error:
          "Trakt client ID and secret are required. Please provide them when linking or configure them in your profile settings first.",
      });
    }

    const deviceCode = resolveTraktDeviceCode(user.id, validated.userCode);
    const traktOAuth = new TraktOAuth(clientId, clientSecret);
    const tokens = await traktOAuth.exchangePinForToken(deviceCode);

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
    clearTraktPin(user.id);

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
        details: error.issues,
      });
    }
    const errorMessage =
      error instanceof Error ? error.message : "Failed to link Trakt account";
    if (
      /authorization pending|slow down|device code expired|does not match|device code is invalid|already been used|authorization was denied/i.test(
        errorMessage
      )
    ) {
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

    const linked = !!freshUser.traktAccessToken;
    let needsReauthorization = false;

    if (
      freshUser.traktAccessToken &&
      freshUser.traktClientId &&
      freshUser.traktClientSecret &&
      freshUser.traktRefreshToken
    ) {
      const storedTokenValid = await traktTokenManager.validateAccessToken(
        freshUser.traktAccessToken,
        freshUser.traktClientId
      );

      if (storedTokenValid) {
        needsReauthorization = false;
      } else {
        try {
          const refreshedToken = await traktTokenManager.refreshAccessToken(
            freshUser.id
          );
          needsReauthorization = !(await traktTokenManager.validateAccessToken(
            refreshedToken,
            freshUser.traktClientId
          ));
        } catch {
          needsReauthorization = true;
        }
      }
    }

    return res.json({
      linked,
      needsReauthorization,
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
