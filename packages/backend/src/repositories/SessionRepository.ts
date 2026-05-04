import crypto from "crypto";

import { dataSource } from "@config/database";
import { Session } from "@entities/Session";
import { User } from "@entities/User";
import { Repository } from "typeorm";

export class SessionRepository {
  private repository: Repository<Session>;

  constructor() {
    this.repository = dataSource.getRepository(Session);
  }

  async createSession(userId: string, ttlMs: number): Promise<string> {
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + ttlMs;
    const session = this.repository.create({
      id,
      userId,
      token,
      expiresAt,
    });
    await this.repository.save(session);
    return token;
  }

  async findUserByToken(token: string): Promise<User | null> {
    const session = await this.repository.findOne({
      where: { token },
      relations: ["user"],
    });
    if (!session || !session.user || Date.now() > session.expiresAt) {
      return null;
    }
    if (!session.user.enabled) {
      return null;
    }
    return session.user;
  }

  async deleteByToken(token: string): Promise<void> {
    await this.repository.delete({ token });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.repository.delete({ userId });
  }
}
