import https from "https";

import {
  getAppVersion,
  getCommitTag,
  isDevelopVersion,
} from "@utils/appVersion";
import { logger } from "@utils/logger";
import { Router, Request, Response } from "express";

const router = Router();

const GITHUB_REPOSITORY = "0xsysr3ll/scroblarr";
const DEVELOP_BRANCH = "develop";
const CACHE_TTL_MS = 10 * 60 * 1000;

type GitHubRelease = {
  tag_name?: string;
  name?: string;
  html_url?: string;
};

type GitHubCommit = {
  sha: string;
  commit?: {
    message?: string;
  };
};

type VersionCheckResult = {
  updateAvailable: boolean;
  commitsBehind: number;
  latestTag: string | null;
  latestUrl: string | null;
  error: string | null;
};

let cachedCheck: VersionCheckResult | null = null;
let lastCheckAt = 0;

function fetchJson<T>(
  url: string,
  headers: Record<string, string>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers,
      },
      (res) => {
        const { statusCode } = res;
        if (!statusCode || statusCode < 200 || statusCode >= 300) {
          res.resume();
          reject(new Error(`Request failed with status code ${statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(chunk as Buffer);
        });
        res.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf8");
            const json = JSON.parse(body) as T;
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    request.on("error", (err) => {
      reject(err);
    });
  });
}

function githubHeaders(): Record<string, string> {
  return {
    "User-Agent": "scroblarr-backend",
    Accept: "application/vnd.github+json",
  };
}

async function checkDevelopUpdates(
  commitTag: string
): Promise<VersionCheckResult> {
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/commits?sha=${DEVELOP_BRANCH}&per_page=20`;
  const commits = await fetchJson<GitHubCommit[]>(url, githubHeaders());

  if (!commits.length) {
    return {
      updateAvailable: false,
      commitsBehind: 0,
      latestTag: null,
      latestUrl: null,
      error: null,
    };
  }

  const filtered = commits.filter(
    (commit) => !commit.commit?.message?.includes("[skip ci]")
  );
  const head = filtered[0];
  const updateAvailable = Boolean(head && head.sha !== commitTag);
  const commitIndex = filtered.findIndex((commit) => commit.sha === commitTag);

  return {
    updateAvailable,
    commitsBehind: updateAvailable ? commitIndex : 0,
    latestTag: head?.sha.slice(0, 7) ?? null,
    latestUrl: `https://github.com/${GITHUB_REPOSITORY}/commits/${DEVELOP_BRANCH}`,
    error: null,
  };
}

async function checkStableUpdates(
  currentVersion: string
): Promise<VersionCheckResult> {
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases?per_page=20`;
  const releases = await fetchJson<GitHubRelease[]>(url, githubHeaders());

  if (!releases.length) {
    return {
      updateAvailable: false,
      commitsBehind: 0,
      latestTag: null,
      latestUrl: null,
      error: null,
    };
  }

  const latest = releases[0];
  const latestTag = latest.tag_name?.trim() || null;
  const latestUrl = latest.html_url?.trim() || null;
  const releaseName = latest.name ?? "";

  const updateAvailable = Boolean(
    latestTag &&
    latestTag !== currentVersion &&
    !releaseName.includes(currentVersion)
  );

  return {
    updateAvailable,
    commitsBehind: updateAvailable ? -1 : 0,
    latestTag,
    latestUrl,
    error: null,
  };
}

async function getVersionCheck(
  version: string,
  commitTag: string
): Promise<VersionCheckResult> {
  if (commitTag === "local") {
    return {
      updateAvailable: false,
      commitsBehind: 0,
      latestTag: null,
      latestUrl: null,
      error: null,
    };
  }

  const now = Date.now();
  if (cachedCheck && now - lastCheckAt < CACHE_TTL_MS) {
    return cachedCheck;
  }

  try {
    const result = isDevelopVersion(version)
      ? await checkDevelopUpdates(commitTag)
      : await checkStableUpdates(version);

    cachedCheck = result;
    lastCheckAt = Date.now();
    return result;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "Unknown error";
    const error = `Could not check for updates from GitHub (${detail}).`;
    logger.api.warn({ error }, "GitHub version check failed");

    const failed: VersionCheckResult = {
      updateAvailable: false,
      commitsBehind: 0,
      latestTag: null,
      latestUrl: null,
      error,
    };
    cachedCheck = failed;
    lastCheckAt = Date.now();
    return failed;
  }
}

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
