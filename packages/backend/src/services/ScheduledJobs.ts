import cron, { ScheduledTask } from "node-cron";
import { TokenRefreshService } from "@services/TokenRefreshService";
import { logger } from "@utils/logger";

export class ScheduledJobs {
  private tokenRefreshService: TokenRefreshService;
  private jobs: ScheduledTask[] = [];

  constructor() {
    this.tokenRefreshService = new TokenRefreshService();
  }

  start(): void {
    const tokenRefreshJob = cron.schedule("0 2 * * *", async () => {
      logger.system.info("Running scheduled token refresh job");
      await this.tokenRefreshService.refreshAllTokens();
    });

    this.jobs.push(tokenRefreshJob);

    logger.system.info("Scheduled jobs started");
  }

  stop(): void {
    this.jobs.forEach((job) => job.stop());
    this.jobs = [];
    logger.system.info("Scheduled jobs stopped");
  }
}
