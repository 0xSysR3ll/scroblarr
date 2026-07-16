import { TraktTokenManager } from "@integrations/trakt/TraktTokenManager";
import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";

export class TokenRefreshService {
  private userRepository: UserRepository;
  private traktTokenManager: TraktTokenManager;

  constructor() {
    this.userRepository = new UserRepository();
    this.traktTokenManager = new TraktTokenManager();
  }

  async refreshAllTokens(): Promise<void> {
    logger.system.info("Starting scheduled token refresh for all users");

    try {
      const users = await this.userRepository.findAll();

      let traktSuccess = 0;
      let traktFailed = 0;
      let simklLinked = 0;

      for (const user of users) {
        if (user.traktAccessToken && user.traktRefreshToken) {
          try {
            await this.traktTokenManager.getValidAccessToken(user.id);
            traktSuccess++;
            logger.trakt.debug(
              { userId: user.id },
              "Successfully refreshed Trakt token"
            );
          } catch (error) {
            traktFailed++;
            logger.trakt.warn(
              { userId: user.id, error },
              "Failed to refresh Trakt token during scheduled refresh"
            );
          }
        }

        if (user.simklAccessToken) {
          simklLinked++;
          logger.simkl.debug(
            { userId: user.id },
            "Simkl token does not expire; skipping refresh"
          );
        }
      }

      logger.system.info(
        {
          totalUsers: users.length,
          traktSuccess,
          traktFailed,
          simklLinked,
        },
        "Completed scheduled token refresh"
      );
    } catch (error) {
      logger.system.error({ error }, "Error during scheduled token refresh");
    }
  }
}
