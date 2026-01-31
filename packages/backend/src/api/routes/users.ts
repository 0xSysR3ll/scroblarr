import { Router, Request, Response } from "express";
import { z } from "zod";
import { UserRepository } from "@repositories/UserRepository";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { adminAuth } from "../middleware/adminAuth";
import { PlexOAuth } from "@integrations/plex/PlexOAuth";
import {
  JellyfinClient,
  JellyfinUser,
} from "@integrations/jellyfin/JellyfinClient";
import { sanitizeUser, sanitizeUsers } from "@utils/userSanitizer";
import { logger } from "@utils/logger";

const router = Router();
const userRepository = new UserRepository();
const settingsRepository = new SettingsRepository();

const createUserSchema = z.object({
  plexUsername: z.string().min(1),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  tvtimeUsername: z.string().optional(),
  enabled: z.boolean().default(true),
});

const updateUserSchema = z.object({
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  tvtimeUsername: z.string().optional(),
  enabled: z.boolean().optional(),
  tvtimeMarkMoviesAsRewatched: z.boolean().optional(),
  tvtimeMarkEpisodesAsRewatched: z.boolean().optional(),
});

router.use(adminAuth);

router.get("/", async (_req: Request, res: Response) => {
  try {
    const users = await userRepository.findAll();
    return res.json(sanitizeUsers(users));
  } catch (error) {
    logger.api.error({ error }, "Error fetching users");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// These routes must come before /:id to avoid route conflicts
router.get("/servers", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user || !user.plexAccessToken) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const plexOAuth = new PlexOAuth();
    const servers = await plexOAuth.getServers(user.plexAccessToken);
    return res.json(servers);
  } catch (error) {
    logger.api.error({ error }, "Error fetching servers");
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch servers";
    return res.status(500).json({ error: errorMessage });
  }
});

router.get("/plex-users", async (req: Request, res: Response) => {
  try {
    const { serverUrl } = req.query;
    if (!serverUrl || typeof serverUrl !== "string") {
      return res
        .status(400)
        .json({ error: "serverUrl query parameter is required" });
    }

    const user = req.user;
    if (!user || !user.plexAccessToken) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const plexOAuth = new PlexOAuth();
    const serverUsers = await plexOAuth.getServerUsers(
      user.plexAccessToken,
      serverUrl
    );
    return res.json(serverUsers);
  } catch (error) {
    logger.api.error({ error }, "Error fetching server users");
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch server users";
    return res.status(500).json({ error: errorMessage });
  }
});

router.get("/jellyfin-users", async (req: Request, res: Response) => {
  try {
    const allSettings = await settingsRepository.getAll();
    const jellyfinHost = allSettings.jellyfinHost;

    if (!jellyfinHost) {
      return res.status(400).json({
        error: "Jellyfin server not configured. Please login first.",
      });
    }

    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const userWithToken = await userRepository.findByAccessToken(token);
    if (!userWithToken || !userWithToken.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const jellyfinApiKey = allSettings.jellyfinApiKey?.trim();
    if (!jellyfinApiKey) {
      return res.status(400).json({
        error:
          "Jellyfin API key not configured. Please setup Jellyfin admin first.",
      });
    }

    const jellyfinClient = new JellyfinClient(jellyfinHost);

    let jellyfinUsers: JellyfinUser[];
    try {
      jellyfinUsers = await jellyfinClient.getUsers(jellyfinApiKey);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to fetch Jellyfin users";

      if (
        errorMessage.includes("401") ||
        errorMessage.includes("Unauthorized")
      ) {
        logger.api.error({ error }, "Jellyfin API key invalid or expired");
        return res.status(401).json({
          error:
            "Jellyfin API key is invalid or expired. Please re-authenticate with Jellyfin in Settings.",
        });
      }

      throw error;
    }

    const existingUsers = await userRepository.findAll();
    const existingJellyfinUsernames = new Set(
      existingUsers
        .filter((u) => u.jellyfinUsername)
        .map((u) => u.jellyfinUsername!)
    );

    const usersList = await Promise.all(
      jellyfinUsers.map(async (jfUser) => {
        const isImported = existingJellyfinUsernames.has(jfUser.Name);

        try {
          const userInfo = await jellyfinClient.getUserInfo(
            jellyfinApiKey,
            jfUser.Id
          );
          return {
            id: jfUser.Id,
            username: jfUser.Name,
            displayName: userInfo.displayName,
            email: userInfo.email,
            thumb: userInfo.thumb,
            isImported,
          };
        } catch {
          return {
            id: jfUser.Id,
            username: jfUser.Name,
            displayName: jfUser.Name,
            email: undefined,
            thumb: jfUser.PrimaryImageTag
              ? `/api/v1/avatars/jellyfin/${jfUser.Id}`
              : undefined,
            isImported,
          };
        }
      })
    );

    return res.json(usersList);
  } catch (error) {
    logger.api.error({ error }, "Error fetching Jellyfin users");
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch Jellyfin users";
    return res.status(500).json({ error: errorMessage });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const user = await userRepository.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json(sanitizeUser(user));
  } catch (error) {
    logger.api.error({ error }, "Error fetching user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const validated = createUserSchema.parse(req.body);
    const user = await userRepository.create(validated);
    logger.api.info(
      {
        userId: user.id,
        username: user.plexUsername || user.jellyfinUsername,
        displayName: user.displayName,
        createdBy: req.user?.id,
      },
      "User created"
    );
    return res.status(201).json(sanitizeUser(user));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: error.errors });
    }
    logger.api.error({ error }, "Error creating user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/import-jellyfin", async (req: Request, res: Response) => {
  try {
    const { usernames } = req.body;
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res
        .status(400)
        .json({ error: "usernames array is required and must not be empty" });
    }

    const allSettings = await settingsRepository.getAll();
    const jellyfinHost = allSettings.jellyfinHost;

    if (!jellyfinHost) {
      return res.status(400).json({
        error: "Jellyfin server not configured. Please login first.",
      });
    }

    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const userWithToken = await userRepository.findByAccessToken(token);
    if (!userWithToken || !userWithToken.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const jellyfinApiKey = allSettings.jellyfinApiKey;
    if (!jellyfinApiKey) {
      return res.status(400).json({
        error:
          "Jellyfin API key not configured. Please setup Jellyfin admin first.",
      });
    }

    const jellyfinClient = new JellyfinClient(jellyfinHost);
    const jellyfinUsers = await jellyfinClient.getUsers(jellyfinApiKey);

    const importedUsers = [];

    for (const username of usernames) {
      const jellyfinUser = jellyfinUsers.find((u) => u.Name === username);
      if (!jellyfinUser) {
        continue;
      }

      const existingUser =
        await userRepository.findByJellyfinUsername(username);
      if (!existingUser) {
        const userInfo = await jellyfinClient.getUserInfo(
          jellyfinApiKey,
          jellyfinUser.Id
        );

        const newUser = await userRepository.create({
          jellyfinUsername: username,
          displayName: userInfo.displayName || username,
          email: userInfo.email,
          enabled: true,
        });
        importedUsers.push(newUser);
      }
    }

    logger.api.info(
      {
        importedCount: importedUsers.length,
        requestedCount: usernames.length,
        importedUsernames: importedUsers.map(
          (u) => u.jellyfinUsername || u.plexUsername
        ),
        importedBy: userWithToken.id,
      },
      "Jellyfin users imported"
    );
    return res.json({
      imported: importedUsers.length,
      users: sanitizeUsers(importedUsers),
    });
  } catch (error) {
    logger.api.error({ error }, "Error importing Jellyfin users");
    return res.status(500).json({ error: "Failed to import Jellyfin users" });
  }
});

router.post("/import", async (req: Request, res: Response) => {
  try {
    const { serverUrl, usernames } = req.body;
    if (!serverUrl) {
      return res.status(400).json({ error: "serverUrl is required" });
    }
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res
        .status(400)
        .json({ error: "usernames array is required and must not be empty" });
    }

    const user = req.user;
    if (!user || !user.plexAccessToken) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const plexOAuth = new PlexOAuth();
    const serverUsers = await plexOAuth.getServerUsers(
      user.plexAccessToken,
      serverUrl
    );
    const importedUsers = [];

    for (const username of usernames) {
      const serverUser = serverUsers.find((su) => su.username === username);
      if (!serverUser) {
        continue;
      }

      const existingUser = await userRepository.findByPlexUsername(
        serverUser.username
      );
      if (!existingUser) {
        const newUser = await userRepository.create({
          plexUsername: serverUser.username,
          displayName: serverUser.displayName || serverUser.username,
          email: serverUser.email,
          plexThumb: serverUser.thumb,
          enabled: true,
        });
        importedUsers.push(newUser);
      }
    }

    logger.api.info(
      {
        importedCount: importedUsers.length,
        requestedCount: usernames.length,
        serverUrl,
        importedUsernames: importedUsers.map(
          (u) => u.plexUsername || u.jellyfinUsername
        ),
        importedBy: user.id,
      },
      "Plex users imported"
    );
    return res.json({
      imported: importedUsers.length,
      users: sanitizeUsers(importedUsers),
    });
  } catch (error) {
    logger.api.error({ error }, "Error importing users");
    return res.status(500).json({ error: "Failed to import users" });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const validated = updateUserSchema.parse(req.body);
    const beforeUser = await userRepository.findById(req.params.id);
    const user = await userRepository.update(req.params.id, validated);
    logger.api.info(
      {
        userId: user.id,
        username: user.plexUsername || user.jellyfinUsername,
        changes: Object.keys(validated),
        updatedBy: req.user?.id,
        enabledChanged:
          validated.enabled !== undefined &&
          validated.enabled !== beforeUser?.enabled,
      },
      "User updated"
    );
    return res.json(sanitizeUser(user));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: error.errors });
    }
    logger.api.error({ error }, "Error updating user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: "ids array is required and must not be empty" });
    }

    if (ids.includes(user.id)) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const allUsers = await userRepository.findAll();
    const usersToDelete = allUsers.filter((u) => ids.includes(u.id));

    const adminsToDelete = usersToDelete.filter((u) => u.isAdmin);
    if (adminsToDelete.length > 0) {
      return res.status(400).json({
        error: "Cannot delete admin users",
        adminIds: adminsToDelete.map((u) => u.id),
      });
    }

    const remainingAdmins = allUsers.filter(
      (u) => u.isAdmin && !ids.includes(u.id)
    );
    if (remainingAdmins.length === 0) {
      return res.status(400).json({ error: "Cannot delete all admin users" });
    }

    let deletedCount = 0;
    for (const id of ids) {
      try {
        await userRepository.delete(id);
        deletedCount++;
      } catch (error) {
        logger.api.warn({ error, userId: id }, "Failed to delete user");
      }
    }

    logger.api.info(
      {
        deletedCount,
        requestedCount: ids.length,
        deletedBy: user.id,
      },
      "Users bulk deleted"
    );
    return res.json({ success: true, deleted: deletedCount });
  } catch (error) {
    logger.api.error({ error }, "Error bulk deleting users");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const userIdToDelete = req.params.id;

    if (userIdToDelete === user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const userToDelete = await userRepository.findById(userIdToDelete);
    if (!userToDelete) {
      return res.status(404).json({ error: "User not found" });
    }

    if (userToDelete.isAdmin) {
      return res.status(400).json({ error: "Cannot delete admin users" });
    }

    const allUsers = await userRepository.findAll();
    const remainingAdmins = allUsers.filter(
      (u) => u.isAdmin && u.id !== userIdToDelete
    );
    if (remainingAdmins.length === 0) {
      return res.status(400).json({ error: "Cannot delete all admin users" });
    }

    await userRepository.delete(userIdToDelete);
    logger.api.info(
      {
        deletedUserId: userIdToDelete,
        deletedUsername:
          userToDelete.plexUsername || userToDelete.jellyfinUsername,
        deletedBy: user.id,
      },
      "User deleted"
    );
    return res.status(204).send();
  } catch (error) {
    logger.api.error({ error }, "Error deleting user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as userRoutes };
