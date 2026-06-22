import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";

import { TraktApiError } from "./TraktApiError";
import { TraktOAuth, TraktTokens } from "./TraktOAuth";

export class TraktTokenManager {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  private async getTraktOAuth(userId: string): Promise<TraktOAuth> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const clientId = user.traktClientId;
    const clientSecret = user.traktClientSecret;

    if (!clientId || !clientSecret) {
      throw new Error(
        "Trakt client ID and secret not configured. Please configure them in your profile settings."
      );
    }

    return new TraktOAuth(clientId, clientSecret);
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.traktAccessToken || !user.traktRefreshToken) {
      throw new Error("Trakt not linked for this user");
    }

    const bufferTime = 5 * 60 * 1000;
    if (
      user.traktTokenExpiresAt &&
      Date.now() < user.traktTokenExpiresAt - bufferTime
    ) {
      return user.traktAccessToken;
    }

    return this.refreshAccessToken(userId);
  }

  async refreshAccessToken(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.traktAccessToken || !user.traktRefreshToken) {
      throw new Error("Trakt not linked for this user");
    }

    try {
      const traktOAuth = await this.getTraktOAuth(user.id);
      const tokens = await traktOAuth.refreshToken(user.traktRefreshToken);
      await this.updateUserTokens(user.id, tokens);
      return tokens.accessToken;
    } catch (refreshError) {
      logger.trakt.error(
        { userId, error: refreshError },
        "Failed to refresh Trakt token"
      );
      if (refreshError instanceof TraktApiError) {
        throw refreshError;
      }
      throw new Error(
        `Failed to refresh Trakt token: ${
          refreshError instanceof Error ? refreshError.message : "Unknown error"
        }`
      );
    }
  }

  async validateAccessToken(
    accessToken: string,
    clientId: string
  ): Promise<boolean> {
    const response = await fetch("https://api.trakt.tv/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "trakt-api-version": "2",
        "trakt-api-key": clientId,
        "User-Agent": "Scroblarr/1.0.0",
      },
    });

    return response.ok;
  }

  private async updateUserTokens(
    userId: string,
    tokens: TraktTokens
  ): Promise<void> {
    await this.userRepository.update(userId, {
      traktAccessToken: tokens.accessToken,
      traktRefreshToken: tokens.refreshToken,
      traktTokenExpiresAt: tokens.expiresAt,
    });
  }
}
