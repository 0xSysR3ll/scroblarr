import { dataSource } from "@config/database";
import { User } from "@entities/User";
import { SessionRepository } from "@repositories/SessionRepository";
import { Repository } from "typeorm";

export class UserRepository {
  private repository: Repository<User>;

  constructor() {
    this.repository = dataSource.getRepository(User);
  }

  static normalizeMediaBrowserUserId(userId: string): string {
    return userId.replace(/-/g, "").toLowerCase();
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
    source: "plex" | "jellyfin" | "emby",
    username: string
  ): Promise<User | null> {
    if (source === "plex") {
      return this.findByPlexUsername(username);
    }
    if (source === "jellyfin" || source === "emby") {
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
    const normalizedId =
      UserRepository.normalizeMediaBrowserUserId(jellyfinUserId);

    return this.repository
      .createQueryBuilder("user")
      .where("user.enabled = :enabled", { enabled: true })
      .andWhere(
        "LOWER(REPLACE(user.jellyfinUserId, '-', '')) = :normalizedId",
        { normalizedId }
      )
      .getOne();
  }

  async findByBingersUserId(bingersUserId: string): Promise<User | null> {
    return this.repository.findOne({
      where: {
        bingersUserId,
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

  async findOrphanedMediaBrowserUser(username: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder("user")
      .where("user.enabled = :enabled", { enabled: true })
      .andWhere("user.jellyfinUsername IS NULL")
      .andWhere("user.plexUsername IS NULL")
      .andWhere("LOWER(user.displayName) = LOWER(:username)", { username })
      .getOne();
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
    const payload = { ...user };
    if (payload.jellyfinUserId) {
      payload.jellyfinUserId = UserRepository.normalizeMediaBrowserUserId(
        payload.jellyfinUserId
      );
    }
    const newUser = this.repository.create(payload);
    return this.repository.save(newUser);
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    const payload = { ...updates };
    if (payload.jellyfinUserId) {
      payload.jellyfinUserId = UserRepository.normalizeMediaBrowserUserId(
        payload.jellyfinUserId
      );
    }
    await this.repository.update(id, payload);
    const updated = await this.repository.findOne({ where: { id } });
    if (!updated) {
      throw new Error(`User ${id} not found`);
    }
    return updated;
  }

  async save(user: User): Promise<User> {
    if (user.jellyfinUserId) {
      user.jellyfinUserId = UserRepository.normalizeMediaBrowserUserId(
        user.jellyfinUserId
      );
    }
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

  async findBySessionToken(token: string): Promise<User | null> {
    const sessionRepository = new SessionRepository();
    return sessionRepository.findUserByToken(token);
  }

  async createSession(user: User, ttlMs: number): Promise<string> {
    const sessionRepository = new SessionRepository();
    return sessionRepository.createSession(user.id, ttlMs);
  }

  getPrimaryUsername(user: User): string {
    return user.plexUsername || user.jellyfinUsername || "unknown";
  }
}
