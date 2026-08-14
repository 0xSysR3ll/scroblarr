import { dataSource } from "@config/database";
import { User } from "@entities/User";
import { SessionRepository } from "@repositories/SessionRepository";
import { Repository } from "typeorm";

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
