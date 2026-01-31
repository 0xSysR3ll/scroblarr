import { UserRepository } from "@repositories/UserRepository";
import { TraktTokenManager } from "@integrations/trakt/TraktTokenManager";
import { TVTimeTokenManager } from "@integrations/tvtime/TVTimeTokenManager";
import { logger } from "@utils/logger";

export class TokenRefreshService {
  private userRepository: UserRepository;
  private traktTokenManager: TraktTokenManager;
  private tvtimeTokenManager: TVTimeTokenManager;

  constructor() {
    this.userRepository = new UserRepository();
    this.traktTokenManager = new TraktTokenManager();
    this.tvtimeTokenManager = new TVTimeTokenManager();
  }

  async refreshAllTokens(): Promise<void> {
    logger.system.info("Starting scheduled token refresh for all users");

    try {
      const users = await this.userRepository.findAll();

      let traktSuccess = 0;
      let traktFailed = 0;
      let tvtimeSuccess = 0;
      let tvtimeFailed = 0;

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

        if (user.tvtimeAccessToken && user.tvtimeRefreshToken) {
          try {
            await this.tvtimeTokenManager.getValidAccessToken(user.id);
            tvtimeSuccess++;
            logger.tvtime.debug(
              { userId: user.id },
              "Successfully refreshed TVTime token"
            );
          } catch (error) {
            tvtimeFailed++;
            logger.tvtime.warn(
              { userId: user.id, error },
              "Failed to refresh TVTime token during scheduled refresh"
            );
          }
        }
      }

      logger.system.info(
        {
          totalUsers: users.length,
          traktSuccess,
          traktFailed,
          tvtimeSuccess,
          tvtimeFailed,
        },
        "Completed scheduled token refresh"
      );
    } catch (error) {
      logger.system.error({ error }, "Error during scheduled token refresh");
    }
  }
}
