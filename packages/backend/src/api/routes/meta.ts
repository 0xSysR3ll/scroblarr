import { getAppVersion, getCommitTag } from "@utils/appVersion";
import { GITHUB_REPOSITORY, getVersionCheck } from "@utils/versionCheck";
import { Router, Request, Response } from "express";

const router = Router();

router.get("/version", async (_req: Request, res: Response): Promise<void> => {
  const version = getAppVersion();
  const commitTag = getCommitTag();
  const check = await getVersionCheck(version, commitTag);

  res.json({
    version,
    commitTag,
    updateAvailable: check.updateAvailable,
    commitsBehind: check.commitsBehind,
    latestTag: check.latestTag,
    latestUrl: check.latestUrl,
    releasesError: check.error,
    githubRepository: GITHUB_REPOSITORY,
  });
});

export { router as metaRoutes };
