import { Repository } from "typeorm";
import { dataSource } from "@config/database";
import { User } from "@entities/User";
import { PlexOAuth } from "@integrations/plex/PlexOAuth";
import { JellyfinClient } from "@integrations/jellyfin/JellyfinClient";
import { SettingsRepository } from "@repositories/SettingsRepository";

export class UserRepository {
  private repository: Repository<User>;

  constructor() {
    this.repository = dataSource.getRepository(User);
  }

  async findByPlexUsername(plexUsername: string): Promise<User | null> {
    return this.repository.findOne({
      where: {
        plexUsername,
        enabled: true,
      },
    });
  }

  async findBySourceUsername(
    source: "plex" | "jellyfin",
    username: string
  ): Promise<User | null> {
    if (source === "plex") {
      return this.findByPlexUsername(username);
    }
    if (source === "jellyfin") {
      return this.repository.findOne({
        where: {
          jellyfinUsername: username,
          enabled: true,
        },
      });
    }
    return null;
  }

  async findByJellyfinUserId(jellyfinUserId: string): Promise<User | null> {
    const normalizedId = jellyfinUserId.replace(/-/g, "");

    return this.repository.findOne({
      where: {
        jellyfinUserId: normalizedId,
        enabled: true,
      },
    });
  }

  async findAdmin(): Promise<User | null> {
    return this.repository.findOne({
      where: {
        isAdmin: true,
      },
    });
  }

  async findByPlexUsernameOrCreate(plexUsername: string): Promise<User> {
    let user = await this.repository.findOne({
      where: { plexUsername },
    });

    if (!user) {
      user = this.repository.create({
        plexUsername,
        enabled: true,
      });
      user = await this.repository.save(user);
    }

    return user;
  }

  async findByJellyfinUsername(jellyfinUsername: string): Promise<User | null> {
    return this.repository.findOne({
      where: {
        jellyfinUsername,
        enabled: true,
      },
    });
  }

  async findByJellyfinUsernameOrCreate(
    jellyfinUsername: string
  ): Promise<User> {
    let user = await this.repository.findOne({
      where: { jellyfinUsername },
    });

    if (!user) {
      user = this.repository.create({
        jellyfinUsername,
        enabled: true,
      });
      user = await this.repository.save(user);
    }

    return user;
  }

  async create(user: Partial<User>): Promise<User> {
    const newUser = this.repository.create(user);
    return this.repository.save(newUser);
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    await this.repository.update(id, updates);
    const updated = await this.repository.findOne({ where: { id } });
    if (!updated) {
      throw new Error(`User ${id} not found`);
    }
    return updated;
  }

  async save(user: User): Promise<User> {
    return this.repository.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.repository.find();
  }

  async findById(id: string): Promise<User | null> {
    return this.repository.findOne({ where: { id } });
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async findByAccessToken(token: string): Promise<User | null> {
    const users = await this.findAll();
    const exactMatch = users.find(
      (u) =>
        (u.plexAccessToken && u.plexAccessToken.trim() === token) ||
        (u.jellyfinAccessToken && u.jellyfinAccessToken.trim() === token)
    );

    if (exactMatch) {
      return exactMatch;
    }

    try {
      const plexOAuth = new PlexOAuth();
      const userInfo = await plexOAuth.getUserInfo(token);

      if (userInfo.username) {
        const userByUsername = await this.findByPlexUsername(userInfo.username);
        if (userByUsername) {
          return userByUsername;
        }
      }

      if (userInfo.email) {
        const userByEmail = users.find((u) => u.email === userInfo.email);
        if (userByEmail) {
          return userByEmail;
        }
      }
    } catch {
      // Token is not a valid Plex token, try Jellyfin
    }

    try {
      const settingsRepository = new SettingsRepository();
      const settings = await settingsRepository.getAll();
      const jellyfinHost = settings.jellyfinHost;

      if (!jellyfinHost) {
        return null;
      }

      const jellyfinClient = new JellyfinClient(jellyfinHost);
      const jellyfinUsers = users.filter((u) => u.jellyfinUsername);

      for (const user of jellyfinUsers) {
        if (user.jellyfinUserId && user.jellyfinUsername) {
          try {
            const userInfo = await jellyfinClient.getUserInfo(
              token,
              user.jellyfinUserId
            );

            if (userInfo.username === user.jellyfinUsername) {
              return user;
            }
          } catch {
            // Token can't access this user's info, try next user
            continue;
          }
        } else if (user.jellyfinUsername) {
          try {
            const jellyfinUsersList = await jellyfinClient.getUsers(token);
            const matchingJellyfinUser = jellyfinUsersList.find(
              (ju) => ju.Name === user.jellyfinUsername
            );
            if (matchingJellyfinUser) {
              if (matchingJellyfinUser.Id) {
                const normalizedId = matchingJellyfinUser.Id.replace(/-/g, "");
                await this.update(user.id, {
                  jellyfinUserId: normalizedId,
                });
              }
              return user;
            }
          } catch {
            // Can't get users or match failed, try next user
            continue;
          }
        }
      }
    } catch {
      // Token is not a valid Jellyfin token, continue to return null
    }

    return null;
  }

  getPrimaryUsername(user: User): string {
    return user.plexUsername || user.jellyfinUsername || "unknown";
  }
}
