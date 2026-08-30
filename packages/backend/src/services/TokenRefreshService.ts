import { isBingersAuthError } from "@integrations/bingers/BingersApiError";
import { BingersSessionManager } from "@integrations/bingers/BingersSessionManager";
import { TraktTokenManager } from "@integrations/trakt/TraktTokenManager";
import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";

export class TokenRefreshService {
  private userRepository: UserRepository;
  private traktTokenManager: TraktTokenManager;
  private bingersSessionManager: BingersSessionManager;

  constructor() {
    this.userRepository = new UserRepository();
    this.traktTokenManager = new TraktTokenManager();
    this.bingersSessionManager = new BingersSessionManager(this.userRepository);
  }

  async refreshAllTokens(): Promise<void> {
    logger.system.info("Starting scheduled token refresh for all users");

    try {
      const users = await this.userRepository.findAll();

      let traktSuccess = 0;
      let traktFailed = 0;
      let simklLinked = 0;
      let bingersSuccess = 0;
      let bingersFailed = 0;
      let bingersExpired = 0;

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

        if (user.bingersCookieJar) {
          try {
            await this.bingersSessionManager.getValidCookieJar(user.id);
            bingersSuccess++;
            logger.bingers.debug(
              { userId: user.id },
              "Successfully refreshed Bingers session"
            );
          } catch (error) {
            if (isBingersAuthError(error)) {
              bingersExpired++;
              logger.bingers.warn(
                { userId: user.id },
                "Bingers session expired during scheduled refresh"
              );
            } else {
              bingersFailed++;
              logger.bingers.warn(
                { userId: user.id, error },
                "Failed to refresh Bingers session during scheduled refresh"
              );
            }
          }
        }
      }

      logger.system.info(
        {
          totalUsers: users.length,
          traktSuccess,
          traktFailed,
          simklLinked,
          bingersSuccess,
          bingersFailed,
          bingersExpired,
        },
        "Completed scheduled token refresh"
      );
    } catch (error) {
      logger.system.error({ error }, "Error during scheduled token refresh");
    }
  }
}
