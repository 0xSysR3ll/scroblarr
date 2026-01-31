import { Router, Request, Response } from "express";
import { z } from "zod";
import { PlexOAuth } from "@integrations/plex/PlexOAuth";
import { JellyfinClient } from "@integrations/jellyfin/JellyfinClient";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { UserRepository } from "@repositories/UserRepository";
import { User } from "@entities/User";
import { logger } from "@utils/logger";
import { auth } from "../middleware/auth";

const router = Router();
const userRepository = new UserRepository();
const settingsRepository = new SettingsRepository();

function buildJellyfinBaseUrl(
  hostname: string,
  port?: number,
  useSsl?: boolean,
  urlBase?: string
): string {
  const jellyfinPort = port || (useSsl ? 443 : 8096);
  const protocol = useSsl ? "https" : "http";
  const basePath = urlBase ? urlBase.replace(/^\/+|\/+$/g, "") : "";
  return `${protocol}://${hostname}:${jellyfinPort}${basePath ? `/${basePath}` : ""}`;
}

router.get("/check-admin", async (_req: Request, res: Response) => {
  try {
    const admin = await userRepository.findAdmin();
    const settings = await settingsRepository.getAll();
    const configuredService = settings.jellyfinHost
      ? "jellyfin"
      : settings.plexServerUrl
        ? "plex"
        : null;

    const response: {
      hasAdmin: boolean;
      configuredService: "plex" | "jellyfin" | null;
      jellyfinSettings?: {
        hostname: string;
        port: number;
        useSsl: boolean;
        urlBase: string;
      };
    } = {
      hasAdmin: !!admin,
      configuredService,
    };

    if (configuredService === "jellyfin" && settings.jellyfinHost) {
      try {
        const url = new URL(settings.jellyfinHost);
        const hostname = url.hostname;
        const port = url.port
          ? parseInt(url.port, 10)
          : url.protocol === "https:"
            ? 443
            : 8096;
        const useSsl = url.protocol === "https:";
        const pathParts = url.pathname.split("/").filter(Boolean);
        const urlBase = pathParts.length > 0 ? pathParts.join("/") : "";

        response.jellyfinSettings = {
          hostname,
          port,
          useSsl,
          urlBase,
        };
      } catch {
        // Ignore URL parsing errors
      }
    }

    res.json(response);
  } catch (error) {
    logger.auth.error({ error }, "Error checking admin");
    res.status(500).json({ error: "Failed to check admin" });
  }
});

router.get(
  "/providers",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const admin = await userRepository.findAdmin();
      const settings = await settingsRepository.getAll();

      const jellyfinConfigured = !!settings.jellyfinHost;
      const plexConfigured = !!settings.plexServerUrl;

      res.json({
        hasAdmin: !!admin,
        jellyfinConfigured,
        plexConfigured,
      });
    } catch (error) {
      logger.auth.error({ error }, "Error getting auth providers");
      res.status(500).json({ error: "Failed to get auth providers" });
    }
  }
);

router.post(
  "/plex/pin",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const plexOAuth = new PlexOAuth();
      const pin = await plexOAuth.createPin();
      res.json({
        pinId: pin.id,
        code: pin.code,
      });
      return;
    } catch (error) {
      logger.auth.error({ error }, "Error creating Plex OAuth pin");
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create OAuth pin";
      res.status(500).json({ error: errorMessage });
      return;
    }
  }
);

router.post(
  "/plex/token",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { pinId } = req.body;
      if (!pinId) {
        res.status(400).json({ error: "pinId is required" });
        return;
      }

      const plexOAuth = new PlexOAuth();
      const tokenData = await plexOAuth.getTokenFromPin(pinId);
      if (!tokenData) {
        res.status(202).json({ message: "Pin not yet authorized" });
        return;
      }

      const existingAdmin = await userRepository.findAdmin();

      let user: User | null = null;
      if (!existingAdmin) {
        user = await userRepository.findByPlexUsernameOrCreate(
          tokenData.username
        );
      } else {
        user = await userRepository.findByPlexUsername(tokenData.username);
        if (!user) {
          res.status(403).json({
            error:
              "Access denied. Please contact an administrator to import your account.",
          });
          return;
        }
      }

      const updatedUser = await userRepository.update(user.id, {
        plexAccessToken: tokenData.accessToken,
        email: tokenData.email,
        displayName: tokenData.username,
        plexThumb: tokenData.thumb,
      });

      res.json({
        user: {
          id: updatedUser.id,
          username: updatedUser.plexUsername,
          displayName: updatedUser.displayName,
          email: updatedUser.email,
          isAdmin: updatedUser.isAdmin,
        },
        accessToken: tokenData.accessToken,
      });
      return;
    } catch (error) {
      logger.auth.error({ error }, "Error getting Plex OAuth token");
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get OAuth token";
      res.status(500).json({ error: errorMessage });
      return;
    }
  }
);

router.post("/plex", async (req: Request, res: Response): Promise<void> => {
  try {
    const { authToken } = req.body;
    if (!authToken) {
      res.status(400).json({ error: "Authentication token required" });
      return;
    }

    const plexOAuth = new PlexOAuth();
    const account = await plexOAuth.getUserInfo(authToken);

    const existingAdmin = await userRepository.findAdmin();

    let existingUser: User | null = null;
    if (account.email) {
      const allUsers = await userRepository.findAll();
      existingUser = allUsers.find((u) => u.email === account.email) ?? null;
    }

    if (!existingAdmin) {
      const user =
        existingUser ??
        (await userRepository.findByPlexUsernameOrCreate(account.username));

      const updatedUser = await userRepository.update(user.id, {
        plexUsername: account.username,
        plexAccessToken: authToken.trim(),
        email: account.email || user.email,
        displayName: account.username || user.displayName,
        plexThumb: account.thumb,
        isAdmin: true,
      });

      try {
        const servers = await plexOAuth.getServers(authToken.trim());
        if (servers.length > 0 && servers[0].url) {
          await settingsRepository.set("plexServerUrl", servers[0].url);
        }
      } catch {
        // Ignore auto-configuration failures
      }

      logger.auth.info(
        {
          userId: updatedUser.id,
          username: account.username,
          email: account.email || user.email,
          isAdmin: true,
          hadExistingUser: !!existingUser,
        },
        "Plex admin created via direct auth"
      );

      const primaryUsername = userRepository.getPrimaryUsername(updatedUser);

      res.json({
        id: updatedUser.id,
        username: primaryUsername,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        isAdmin: true,
      });
      return;
    } else {
      let user: User | null = null;

      if (existingUser) {
        user = existingUser;
      } else {
        user = await userRepository.findByPlexUsername(account.username);
      }

      if (!user) {
        res.status(403).json({
          error:
            "Access denied. Please contact an administrator to import your account.",
        });
        return;
      }

      const updatedUser = await userRepository.update(user.id, {
        plexUsername: account.username,
        plexAccessToken: authToken.trim(),
        email: account.email || user.email,
        displayName: account.username || user.displayName,
        plexThumb: account.thumb,
      });

      const primaryUsername = userRepository.getPrimaryUsername(updatedUser);

      res.json({
        id: updatedUser.id,
        username: primaryUsername,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
      });
      return;
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unable to authenticate";
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.auth.error(
      {
        error: errorMessage,
        errorStack,
        hasAuthToken: !!req.body.authToken,
      },
      "Plex login error"
    );
    res.status(500).json({ error: errorMessage });
  }
});

router.post(
  "/plex/link",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: "No token provided" });
        return;
      }

      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) {
        res.status(401).json({ error: "No token provided" });
        return;
      }

      const currentUser = await userRepository.findByAccessToken(token);
      if (!currentUser) {
        res.status(401).json({ error: "Invalid token" });
        return;
      }

      const settings = await settingsRepository.getAll();

      if (!settings.plexServerUrl && !settings.jellyfinHost) {
        res.status(400).json({
          error:
            "No media server configured. Please configure a Plex or Jellyfin server first.",
        });
        return;
      }

      const { authToken } = req.body as { authToken?: string };

      if (!authToken) {
        res.status(400).json({ error: "Authentication token required" });
        return;
      }

      const plexOAuth = new PlexOAuth();
      const account = await plexOAuth.getUserInfo(authToken);

      const existingPlexUser = await userRepository.findByPlexUsername(
        account.username
      );

      if (existingPlexUser && existingPlexUser.id !== currentUser.id) {
        res.status(400).json({
          error: "This Plex account is already linked to another user",
        });
        return;
      }

      const updatedUser = await userRepository.update(currentUser.id, {
        plexUsername: account.username,
        plexAccessToken: authToken.trim(),
        plexThumb: account.thumb || currentUser.plexThumb,
        email: currentUser.email || account.email || currentUser.email,
        displayName: currentUser.displayName || account.username,
      });

      logger.auth.info(
        {
          userId: updatedUser.id,
          username: account.username,
          wasAlreadyLinked: !!currentUser.plexUsername,
        },
        "Plex account linked"
      );

      const primaryUsername = userRepository.getPrimaryUsername(updatedUser);

      res.json({
        id: updatedUser.id,
        username: primaryUsername,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
        plexUsername: updatedUser.plexUsername || undefined,
        jellyfinUsername: updatedUser.jellyfinUsername || undefined,
      });
    } catch (error) {
      logger.auth.error({ error }, "Error linking Plex account");
      const errorMessage =
        error instanceof Error ? error.message : "Unable to link Plex account";
      if (errorMessage.includes("401")) {
        res.status(401).json({ error: "Invalid Plex credentials" });
        return;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  "/plex/setup-admin",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { pinId } = req.body;
      if (!pinId) {
        res.status(400).json({ error: "pinId is required" });
        return;
      }

      const existingAdmin = await userRepository.findAdmin();
      if (existingAdmin) {
        res.status(400).json({ error: "Admin already configured" });
        return;
      }

      const plexOAuth = new PlexOAuth();
      const tokenData = await plexOAuth.getTokenFromPin(pinId);
      if (!tokenData) {
        res.status(202).json({ message: "Pin not yet authorized" });
        return;
      }

      const user = await userRepository.findByPlexUsernameOrCreate(
        tokenData.username
      );
      const updatedUser = await userRepository.update(user.id, {
        plexAccessToken: tokenData.accessToken,
        email: tokenData.email,
        displayName: tokenData.username,
        plexThumb: tokenData.thumb,
        isAdmin: true,
      });

      try {
        const servers = await plexOAuth.getServers(tokenData.accessToken);
        if (servers.length > 0 && servers[0].url) {
          await settingsRepository.set("plexServerUrl", servers[0].url);
        }
      } catch {
        // Ignore auto-configuration failures
      }

      logger.auth.info(
        {
          userId: updatedUser.id,
          username: tokenData.username,
          email: tokenData.email,
          isAdmin: true,
          hadExistingToken: !!user.plexAccessToken,
        },
        "Plex admin setup successful"
      );

      res.json({
        user: {
          id: updatedUser.id,
          username: updatedUser.plexUsername,
          displayName: updatedUser.displayName,
          email: updatedUser.email,
          isAdmin: true,
        },
        accessToken: tokenData.accessToken,
      });
      return;
    } catch (error) {
      logger.auth.error({ error }, "Error setting up admin");
      const errorMessage =
        error instanceof Error ? error.message : "Failed to setup admin";
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.patch(
  "/me",
  auth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const updateSchema = z.object({
        displayName: z.string().optional(),
        email: z.string().email().optional(),
        tvtimeMarkMoviesAsRewatched: z.boolean().optional(),
        tvtimeMarkEpisodesAsRewatched: z.boolean().optional(),
      });

      const validated = updateSchema.parse(req.body);
      const updatedUser = await userRepository.update(user.id, validated);

      logger.auth.info(
        {
          userId: updatedUser.id,
          changes: Object.keys(validated),
        },
        "User profile updated"
      );

      const primaryUsername = userRepository.getPrimaryUsername(updatedUser);

      res.json({
        id: updatedUser.id,
        username: primaryUsername,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
        tvtimeMarkMoviesAsRewatched: updatedUser.tvtimeMarkMoviesAsRewatched,
        tvtimeMarkEpisodesAsRewatched:
          updatedUser.tvtimeMarkEpisodesAsRewatched,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation error", details: error.errors });
        return;
      }
      logger.auth.error({ error }, "Error updating user profile");
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const userWithToken = await userRepository.findByAccessToken(token);

    if (!userWithToken) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    let thumb =
      userWithToken.plexThumb ||
      userWithToken.jellyfinThumb ||
      userWithToken.traktThumb ||
      userWithToken.tvtimeThumb;

    if (!thumb && userWithToken.plexAccessToken) {
      try {
        const plexOAuth = new PlexOAuth();
        const userInfo = await plexOAuth.getUserInfo(
          userWithToken.plexAccessToken
        );
        if (userInfo.thumb) {
          await userRepository.update(userWithToken.id, {
            plexThumb: userInfo.thumb,
          });
          thumb = userInfo.thumb;
        }
      } catch {
        // Ignore avatar fetch failures
      }
    }

    if (
      !thumb &&
      userWithToken.jellyfinAccessToken &&
      userWithToken.jellyfinUserId
    ) {
      try {
        const allSettings = await settingsRepository.getAll();
        const jellyfinHost = allSettings.jellyfinHost;
        if (jellyfinHost) {
          const jellyfinClient = new JellyfinClient(jellyfinHost);
          const userInfo = await jellyfinClient.getUserInfo(
            userWithToken.jellyfinAccessToken,
            userWithToken.jellyfinUserId
          );
          if (userInfo.thumb) {
            await userRepository.update(userWithToken.id, {
              jellyfinThumb: userInfo.thumb,
            });
            thumb = userInfo.thumb;
          }
        }
      } catch {
        // Ignore avatar fetch failures
      }
    }

    if (!thumb && userWithToken.tvtimeAccessToken) {
      try {
        const { TVTimeClient } =
          await import("@integrations/tvtime/TVTimeClient");
        const { TVTimeTokenManager } =
          await import("@integrations/tvtime/TVTimeTokenManager");
        const tokenManager = new TVTimeTokenManager();
        const tvTimeClient = new TVTimeClient();
        const accessToken = await tokenManager.getValidAccessToken(
          userWithToken.id
        );
        const profile = await tvTimeClient.getUserProfile(accessToken);
        if (profile.image) {
          await userRepository.update(userWithToken.id, {
            tvtimeThumb: profile.image,
          });
          thumb = profile.image;
        }
      } catch {
        // Ignore avatar fetch failures
      }
    }

    const primaryUsername = userRepository.getPrimaryUsername(userWithToken);
    const { getProxiedThumbUrl } = await import("@utils/userSanitizer");

    res.json({
      id: userWithToken.id,
      username: primaryUsername,
      displayName: userWithToken.displayName,
      email: userWithToken.email,
      isAdmin: userWithToken.isAdmin,
      thumb: getProxiedThumbUrl(userWithToken),
      plexUsername: userWithToken.plexUsername || undefined,
      jellyfinUsername: userWithToken.jellyfinUsername || undefined,
      tvtimeMarkMoviesAsRewatched: userWithToken.tvtimeMarkMoviesAsRewatched,
      tvtimeMarkEpisodesAsRewatched:
        userWithToken.tvtimeMarkEpisodesAsRewatched,
      hasPlex: !!userWithToken.plexUsername,
      hasJellyfin: !!userWithToken.jellyfinUsername,
      hasTrakt: !!userWithToken.traktAccessToken,
      hasTVTime: !!userWithToken.tvtimeAccessToken,
    });
  } catch (error) {
    logger.auth.error({ error }, "Error getting current user:");
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.post("/jellyfin", async (req: Request, res: Response) => {
  try {
    const { username, password, hostname, port, useSsl, urlBase } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const existingAdmin = await userRepository.findAdmin();

    if (existingAdmin) {
      const user = await userRepository.findByJellyfinUsername(username);
      if (!user) {
        logger.auth.warn(
          {
            username,
          },
          "Jellyfin login attempted for non-imported user"
        );
        return res.status(403).json({
          error:
            "Access denied. Please contact an administrator to import your account.",
        });
      }
    }

    let baseUrl: string;
    const settings = await settingsRepository.getAll();

    if (hostname) {
      baseUrl = buildJellyfinBaseUrl(hostname, port, useSsl, urlBase);
    } else if (settings.jellyfinHost) {
      baseUrl = settings.jellyfinHost;
    } else {
      return res.status(400).json({
        error: "Jellyfin server not configured. Please provide server details.",
      });
    }

    const jellyfinClient = new JellyfinClient(baseUrl);
    const loginResponse = await jellyfinClient.login(username, password);
    const userInfo = await jellyfinClient.getUserInfo(
      loginResponse.AccessToken,
      loginResponse.User.Id
    );

    if (!existingAdmin) {
      let apiKey: string;
      try {
        apiKey = await jellyfinClient.createApiKey(
          loginResponse.AccessToken,
          "Scroblarr"
        );
        await settingsRepository.set("jellyfinApiKey", apiKey);
      } catch (error) {
        logger.auth.warn(
          { error },
          "Failed to create API key, server-side operations may fail after password changes"
        );
      }

      const user = await userRepository.findByJellyfinUsernameOrCreate(
        loginResponse.User.Name
      );

      const updatedUser = await userRepository.update(user.id, {
        jellyfinUsername: loginResponse.User.Name,
        jellyfinAccessToken: loginResponse.AccessToken,
        jellyfinUserId: userInfo.id,
        jellyfinThumb: userInfo.thumb,
        displayName: userInfo.displayName || loginResponse.User.Name,
        isAdmin: true,
      });

      await settingsRepository.set("jellyfinHost", baseUrl);
      if (port) {
        await settingsRepository.set("jellyfinPort", port.toString());
      }
      if (useSsl !== undefined) {
        await settingsRepository.set("jellyfinUseSsl", useSsl.toString());
      }
      if (urlBase) {
        await settingsRepository.set("jellyfinUrlBase", urlBase);
      }

      const primaryUsername = userRepository.getPrimaryUsername(updatedUser);

      return res.json({
        id: updatedUser.id,
        username: primaryUsername,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        isAdmin: true,
        accessToken: loginResponse.AccessToken,
      });
    } else {
      const user = await userRepository.findByJellyfinUsername(
        loginResponse.User.Name
      );

      if (!user) {
        logger.auth.warn(
          {
            username: loginResponse.User.Name,
          },
          "Jellyfin login attempted for non-imported user"
        );
        return res.status(403).json({
          error:
            "Access denied. Please contact an administrator to import your account.",
        });
      }

      const updatedUser = await userRepository.update(user.id, {
        jellyfinUsername: loginResponse.User.Name,
        jellyfinAccessToken: loginResponse.AccessToken,
        jellyfinUserId: userInfo.id,
        jellyfinThumb: userInfo.thumb,
        displayName: userInfo.displayName || loginResponse.User.Name,
      });

      logger.auth.info(
        {
          userId: updatedUser.id,
          username: loginResponse.User.Name,
        },
        "Jellyfin user logged in"
      );

      const primaryUsername = userRepository.getPrimaryUsername(updatedUser);

      return res.json({
        id: updatedUser.id,
        username: primaryUsername,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
        accessToken: loginResponse.AccessToken,
      });
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unable to authenticate";
    const errorStack = error instanceof Error ? error.stack : undefined;

    if (errorMessage.includes("Invalid credentials")) {
      logger.auth.warn(
        {
          username: req.body.username,
          error: errorMessage,
        },
        "Jellyfin login failed: invalid credentials"
      );
      return res.status(401).json({ error: "Invalid credentials" });
    }

    logger.auth.error(
      {
        username: req.body.username,
        error: errorMessage,
        errorStack,
        hostname: req.body.hostname,
      },
      "Jellyfin login error"
    );
    return res.status(500).json({ error: errorMessage });
  }
});

router.post(
  "/jellyfin/setup-admin",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const existingAdmin = await userRepository.findAdmin();
      if (existingAdmin) {
        res.status(400).json({ error: "Admin already configured" });
        return;
      }

      const { username, password, hostname, port, useSsl, urlBase } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required" });
        return;
      }

      if (!hostname) {
        res.status(400).json({ error: "Jellyfin hostname is required" });
        return;
      }

      const baseUrl = buildJellyfinBaseUrl(hostname, port, useSsl, urlBase);
      const jellyfinClient = new JellyfinClient(baseUrl);
      const loginResponse = await jellyfinClient.login(username, password);
      const userInfo = await jellyfinClient.getUserInfo(
        loginResponse.AccessToken,
        loginResponse.User.Id
      );

      try {
        const apiKey = await jellyfinClient.createApiKey(
          loginResponse.AccessToken,
          "Scroblarr"
        );
        await settingsRepository.set("jellyfinApiKey", apiKey);
      } catch (error) {
        logger.auth.warn(
          { error },
          "Failed to create API key, server-side operations may fail after password changes"
        );
      }

      const user = await userRepository.findByJellyfinUsernameOrCreate(
        loginResponse.User.Name
      );

      logger.auth.info(
        {
          userId: user.id,
          username: loginResponse.User.Name,
          jellyfinUserId: userInfo.id,
          isAdmin: true,
          hadExistingToken: !!user.jellyfinAccessToken,
        },
        "Jellyfin admin setup successful"
      );

      const updatedUser = await userRepository.update(user.id, {
        jellyfinUsername: loginResponse.User.Name,
        jellyfinAccessToken: loginResponse.AccessToken,
        jellyfinUserId: userInfo.id,
        jellyfinThumb: userInfo.thumb,
        displayName: userInfo.displayName || loginResponse.User.Name,
        isAdmin: true,
      });

      await settingsRepository.set("jellyfinHost", baseUrl);
      if (port) {
        await settingsRepository.set("jellyfinPort", port.toString());
      }
      if (useSsl !== undefined) {
        await settingsRepository.set("jellyfinUseSsl", useSsl.toString());
      }
      if (urlBase) {
        await settingsRepository.set("jellyfinUrlBase", urlBase);
      }

      const primaryUsername = userRepository.getPrimaryUsername(updatedUser);

      res.json({
        user: {
          id: updatedUser.id,
          username: primaryUsername,
          displayName: updatedUser.displayName,
          email: updatedUser.email,
          isAdmin: true,
        },
        accessToken: loginResponse.AccessToken,
      });
    } catch (error) {
      logger.auth.error({ error }, "Error setting up Jellyfin admin");
      const errorMessage =
        error instanceof Error ? error.message : "Failed to setup admin";
      if (errorMessage.includes("Invalid credentials")) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  "/jellyfin/link",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        res.status(401).json({ error: "No token provided" });
        return;
      }

      const currentUser = await userRepository.findByAccessToken(token);

      if (!currentUser) {
        res.status(401).json({ error: "Invalid token" });
        return;
      }

      const { username, password, hostname, port, useSsl, urlBase } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required" });
        return;
      }

      const existingJellyfinUser =
        await userRepository.findByJellyfinUsername(username);
      if (existingJellyfinUser && existingJellyfinUser.id !== currentUser.id) {
        res.status(400).json({
          error: "This Jellyfin account is already linked to another user",
        });
        return;
      }

      const settings = await settingsRepository.getAll();

      let baseUrl: string;

      if (hostname) {
        baseUrl = buildJellyfinBaseUrl(hostname, port, useSsl, urlBase);
      } else if (settings.jellyfinHost) {
        baseUrl = settings.jellyfinHost;
      } else {
        res.status(400).json({
          error:
            "Jellyfin server not configured. Please provide server details.",
        });
        return;
      }

      const jellyfinClient = new JellyfinClient(baseUrl);
      const loginResponse = await jellyfinClient.login(username, password);
      const userInfo = await jellyfinClient.getUserInfo(
        loginResponse.AccessToken,
        loginResponse.User.Id
      );

      if (currentUser.isAdmin) {
        try {
          const apiKey = await jellyfinClient.createApiKey(
            loginResponse.AccessToken,
            "Scroblarr"
          );
          await settingsRepository.set("jellyfinApiKey", apiKey);
        } catch (error) {
          logger.auth.warn(
            { error },
            "Failed to create API key, server-side operations may fail after password changes"
          );
        }
      }

      const updatedUser = await userRepository.update(currentUser.id, {
        jellyfinUsername: loginResponse.User.Name,
        jellyfinAccessToken: loginResponse.AccessToken,
        jellyfinUserId: userInfo.id,
        jellyfinThumb: userInfo.thumb,
        email: userInfo.email || currentUser.email,
        displayName: currentUser.displayName || userInfo.displayName,
      });

      if (currentUser.isAdmin && hostname) {
        await settingsRepository.set("jellyfinHost", baseUrl);
        if (port) {
          await settingsRepository.set("jellyfinPort", port.toString());
        }
        if (useSsl !== undefined) {
          await settingsRepository.set("jellyfinUseSsl", useSsl.toString());
        }
        if (urlBase) {
          await settingsRepository.set("jellyfinUrlBase", urlBase);
        }

        logger.auth.info(
          {
            userId: updatedUser.id,
            username: loginResponse.User.Name,
            hostname,
            port,
            useSsl,
            wasAlreadyLinked: !!currentUser.jellyfinUsername,
          },
          "Jellyfin account linked and server configured by admin"
        );
      } else {
        logger.auth.info(
          {
            userId: updatedUser.id,
            username: loginResponse.User.Name,
            wasAlreadyLinked: !!currentUser.jellyfinUsername,
          },
          "Jellyfin account linked"
        );
      }

      const primaryUsername = userRepository.getPrimaryUsername(updatedUser);

      res.json({
        id: updatedUser.id,
        username: primaryUsername,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
      });
    } catch (error) {
      logger.auth.error({ error }, "Error linking Jellyfin account");
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to link Jellyfin account";
      if (errorMessage.includes("Invalid credentials")) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  "/plex/unlink",
  auth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (user.isAdmin) {
        const hasJellyfin = !!user.jellyfinUsername;
        const hasPlex = !!user.plexUsername;

        if (hasPlex && !hasJellyfin) {
          res.status(400).json({
            error:
              "Cannot unlink Plex account. As an admin, you must have at least one linked account. Please link a Jellyfin account first before unlinking Plex.",
          });
          return;
        }
      }

      await userRepository.update(user.id, {
        plexUsername: null,
        plexAccessToken: null,
        plexThumb: null,
      } as unknown as Partial<User>);

      logger.auth.info(
        {
          userId: user.id,
          username: user.plexUsername || user.jellyfinUsername,
          isAdmin: user.isAdmin,
        },
        "Plex account unlinked"
      );

      res.json({ success: true });
    } catch (error) {
      logger.auth.error({ error }, "Error unlinking Plex account");
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to unlink Plex account";
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  "/jellyfin/unlink",
  auth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (user.isAdmin) {
        const hasJellyfin = !!user.jellyfinUsername;
        const hasPlex = !!user.plexUsername;

        if (hasJellyfin && !hasPlex) {
          res.status(400).json({
            error:
              "Cannot unlink Jellyfin account. As an admin, you must have at least one linked account. Please link a Plex account first before unlinking Jellyfin.",
          });
          return;
        }
      }

      await userRepository.update(user.id, {
        jellyfinUsername: null,
        jellyfinAccessToken: null,
        jellyfinUserId: null,
        jellyfinThumb: null,
      } as unknown as Partial<User>);

      logger.auth.info(
        {
          userId: user.id,
          username: user.plexUsername || user.jellyfinUsername,
          isAdmin: user.isAdmin,
        },
        "Jellyfin account unlinked"
      );

      res.json({ success: true });
    } catch (error) {
      logger.auth.error({ error }, "Error unlinking Jellyfin account");
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to unlink Jellyfin account";
      res.status(500).json({ error: errorMessage });
    }
  }
);

export { router as authRoutes };
