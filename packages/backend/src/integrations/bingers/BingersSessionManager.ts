import { User } from "@entities/User";
import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";

import {
  BINGERS_REAUTH_MESSAGE,
  BingersApiError,
  isBingersAuthError,
} from "./BingersApiError";
import { BingersAuth, BingersSessionInfo } from "./BingersAuth";
import { CookieJar, parseCookieJar, serializeCookieJar } from "./cookieJar";

export class BingersSessionManager {
  private userRepository: UserRepository;
  private auth: BingersAuth;

  constructor(
    userRepository: UserRepository = new UserRepository(),
    auth: BingersAuth = new BingersAuth()
  ) {
    this.userRepository = userRepository;
    this.auth = auth;
  }

  async getValidCookieJar(userId: string): Promise<CookieJar> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.bingersCookieJar) {
      throw new BingersApiError(BINGERS_REAUTH_MESSAGE, 401, {
        isAuthError: true,
      });
    }

    const jar = parseCookieJar(user.bingersCookieJar);
    try {
      const session = await this.auth.getSession(jar);
      await this.persistSession(user.id, session, user.bingersEmail);
      return session.cookieJar;
    } catch (error) {
      if (isBingersAuthError(error)) {
        await this.clearSessionKeepEmail(user);
      }
      throw error;
    }
  }

  async validateAndRefresh(userId: string): Promise<{
    linked: boolean;
    needsReauthorization: boolean;
    username: string | null;
    image: string | null;
  }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.bingersCookieJar) {
      const hadPriorLink = !!(
        user.bingersEmail ||
        user.bingersUsername ||
        user.bingersUserId ||
        user.bingersThumb
      );
      return {
        linked: false,
        needsReauthorization: hadPriorLink,
        username: user.bingersUsername || user.bingersEmail || null,
        image: user.bingersThumb || null,
      };
    }

    let session: BingersSessionInfo;
    try {
      const jar = parseCookieJar(user.bingersCookieJar);
      session = await this.auth.getSession(jar);
    } catch (error) {
      if (isBingersAuthError(error)) {
        await this.clearSessionKeepEmail(user);
        return {
          linked: false,
          needsReauthorization: true,
          username: user.bingersUsername || user.bingersEmail || null,
          image: user.bingersThumb || null,
        };
      }
      // Transient upstream failures must not look like an unlink. Keep the
      // stored jar and report the last known linked profile.
      logger.bingers.warn(
        { userId, error },
        "Failed to validate Bingers session; returning cached link state"
      );
      return {
        linked: true,
        needsReauthorization: false,
        username: user.bingersUsername || user.bingersEmail || null,
        image: user.bingersThumb || null,
      };
    }

    await this.persistSession(user.id, session, user.bingersEmail);

    return {
      linked: true,
      needsReauthorization: false,
      username:
        session.user?.username ||
        session.user?.name ||
        user.bingersUsername ||
        session.user?.email ||
        user.bingersEmail ||
        null,
      image: session.user?.image || user.bingersThumb || null,
    };
  }

  async storeSessionFromVerify(
    userId: string,
    session: BingersSessionInfo,
    fallbackEmail?: string
  ): Promise<void> {
    await this.persistSession(userId, session, fallbackEmail);
  }

  async clearAll(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      bingersCookieJar: null,
      bingersSessionExpiresAt: null,
      bingersEmail: null,
      bingersUserId: null,
      bingersUsername: null,
      bingersThumb: null,
      bingersMarkMoviesAsRewatched: false,
      bingersMarkEpisodesAsRewatched: false,
    } as unknown as Partial<User>);
  }

  private async persistSession(
    userId: string,
    session: BingersSessionInfo,
    fallbackEmail?: string | null
  ): Promise<void> {
    const update: Partial<User> = {
      bingersCookieJar: serializeCookieJar(session.cookieJar),
      bingersSessionExpiresAt: session.expiresAt,
      bingersEmail: session.user?.email || fallbackEmail || undefined,
      bingersUserId: session.user?.id,
      bingersUsername: session.user?.username || session.user?.name,
      bingersThumb: session.user?.image,
    };
    await this.userRepository.update(userId, update);
  }

  private async clearSessionKeepEmail(user: User): Promise<void> {
    await this.userRepository.update(user.id, {
      bingersCookieJar: null,
      bingersSessionExpiresAt: null,
      bingersEmail: user.bingersEmail ?? null,
      bingersUserId: user.bingersUserId ?? null,
      bingersUsername: user.bingersUsername ?? null,
      bingersThumb: user.bingersThumb ?? null,
    } as unknown as Partial<User>);
  }
}
