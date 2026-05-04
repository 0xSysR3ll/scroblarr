import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";

import { TVTimeAuth, TVTimeTokens } from "./TVTimeAuth";

export class TVTimeTokenManager {
  private userRepository: UserRepository;
  private tvTimeAuth: TVTimeAuth;

  constructor() {
    this.userRepository = new UserRepository();
    this.tvTimeAuth = new TVTimeAuth();
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.tvtimeAccessToken || !user.tvtimeRefreshToken) {
      throw new Error("TVTime not linked for this user");
    }

    if (this.isTokenValid(user.tvtimeAccessToken)) {
      return user.tvtimeAccessToken;
    }

    try {
      const tokens = await this.tvTimeAuth.refreshToken(
        user.tvtimeRefreshToken
      );
      await this.updateUserTokens(user.id, tokens);
      return tokens.accessToken;
    } catch (refreshError) {
      logger.tvtime.warn(
        { userId, error: refreshError },
        "TVTime token refresh failed; user needs to re-link TVTime"
      );
      throw new Error(
        `TVTime token expired and refresh failed. Please re-link your TVTime account. Original error: ${
          refreshError instanceof Error ? refreshError.message : "Unknown error"
        }`
      );
    }
  }

  private isTokenValid(token: string): boolean {
    try {
      const payload = this.decodeJwtPayload(token);
      const expRaw = payload.exp;
      if (expRaw === undefined || expRaw === null) {
        return false;
      }
      const expNumber =
        typeof expRaw === "number" ? expRaw : Number(expRaw as unknown);
      if (!Number.isFinite(expNumber)) {
        return false;
      }
      const expirationTime = expNumber * 1000;
      const bufferTime = 5 * 60 * 1000;
      return Date.now() < expirationTime - bufferTime;
    } catch {
      return false;
    }
  }

  private decodeJwtPayload(token: string): Record<string, unknown> {
    try {
      if (!token || typeof token !== "string") {
        throw new Error("Token is not a valid string");
      }
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error(
          `Invalid JWT token format: expected 3 parts, got ${parts.length}`
        );
      }
      const payload = parts[1];
      if (!payload) {
        throw new Error("JWT payload is empty");
      }
      const paddedPayload =
        payload + "=".repeat((4 - (payload.length % 4)) % 4);
      const decoded = Buffer.from(paddedPayload, "base64").toString("utf-8");
      return JSON.parse(decoded);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to decode JWT token: ${errorMsg}`);
    }
  }

  private async updateUserTokens(
    userId: string,
    tokens: TVTimeTokens
  ): Promise<void> {
    await this.userRepository.update(userId, {
      tvtimeAccessToken: tokens.accessToken,
      tvtimeRefreshToken: tokens.refreshToken,
    });
  }
}
