import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";

import { isSimklV2AccessToken } from "./SimklApi";
import { SimklOAuth, SimklTokens } from "./SimklOAuth";

const inFlightRefreshes = new Map<string, Promise<string>>();

export function clearInFlightSimklRefreshesForTests(): void {
  inFlightRefreshes.clear();
}

export class SimklTokenManager {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  private async getSimklOAuth(userId: string): Promise<SimklOAuth> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.simklClientId) {
      throw new Error(
        "Simkl client ID not configured. Please configure it in your profile settings."
      );
    }

    return new SimklOAuth(user.simklClientId);
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.simklAccessToken) {
      throw new Error("Simkl not linked for this user");
    }

    if (
      !user.simklRefreshToken ||
      !isSimklV2AccessToken(user.simklAccessToken)
    ) {
      return user.simklAccessToken;
    }

    const bufferTime = 24 * 60 * 60 * 1000;
    if (
      user.simklTokenExpiresAt &&
      Date.now() < user.simklTokenExpiresAt - bufferTime
    ) {
      return user.simklAccessToken;
    }

    return this.refreshAccessToken(userId);
  }

  async refreshAccessToken(userId: string): Promise<string> {
    const pending = inFlightRefreshes.get(userId);
    if (pending) {
      return pending;
    }

    const refreshPromise = this.performRefreshAccessToken(userId);
    inFlightRefreshes.set(userId, refreshPromise);
    const clearPending = () => {
      if (inFlightRefreshes.get(userId) === refreshPromise) {
        inFlightRefreshes.delete(userId);
      }
    };
    void refreshPromise.then(clearPending, clearPending);
    return refreshPromise;
  }

  private async performRefreshAccessToken(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.simklAccessToken || !user.simklRefreshToken) {
      throw new Error("Simkl not linked for this user");
    }

    try {
      const simklOAuth = await this.getSimklOAuth(user.id);
      const tokens = await simklOAuth.refreshToken(user.simklRefreshToken);
      await this.updateUserTokens(user.id, tokens);
      return tokens.accessToken;
    } catch (refreshError) {
      logger.simkl.error(
        { userId, error: refreshError },
        "Failed to refresh Simkl token"
      );
      throw new Error(
        `Failed to refresh Simkl token: ${
          refreshError instanceof Error ? refreshError.message : "Unknown error"
        }`
      );
    }
  }

  private async updateUserTokens(
    userId: string,
    tokens: SimklTokens
  ): Promise<void> {
    await this.userRepository.update(userId, {
      simklAccessToken: tokens.accessToken,
      ...(tokens.refreshToken
        ? { simklRefreshToken: tokens.refreshToken }
        : {}),
      simklTokenExpiresAt: tokens.expiresAt,
    });
  }
}
