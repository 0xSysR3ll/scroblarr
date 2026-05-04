import { execSync } from "child_process";
import https from "https";

import { logger } from "@utils/logger";
import { Router, Request, Response } from "express";

const router = Router();

const GITHUB_REPOSITORY = "0xsysr3ll/scroblarr";

let cachedTag: string | null = null;
let cachedLatestTag: string | null = null;
let cachedLatestUrl: string | null = null;
/** Cached failure message from the last failed GitHub releases fetch (same TTL as success). */
let cachedReleasesError: string | null = null;
let lastLatestCheck = 0;

function resolveGitTag(): string | null {
  if (cachedTag) {
    return cachedTag;
  }

  const fromEnv = process.env.GIT_TAG?.trim();
  if (fromEnv) {
    cachedTag = fromEnv;
    return cachedTag;
  }

  try {
    const output = execSync("git describe --tags --always", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (output) {
      cachedTag = output;
      return cachedTag;
    }
  } catch {
    // ignore, fall back to unknown
  }

  return null;
}

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

async function getLatestGitHubRelease(): Promise<{
  latestTag: string | null;
  latestUrl: string | null;
  error: string | null;
}> {
  const now = Date.now();
  const CACHE_TTL_MS = 10 * 60 * 1000;

  if (now - lastLatestCheck < CACHE_TTL_MS) {
    if (cachedReleasesError) {
      return {
        latestTag: null,
        latestUrl: null,
        error: cachedReleasesError,
      };
    }
    if (cachedLatestTag) {
      return {
        latestTag: cachedLatestTag,
        latestUrl: cachedLatestUrl,
        error: null,
      };
    }
  }

  try {
    const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`;
    const headers: Record<string, string> = {
      "User-Agent": "scroblarr-backend",
      Accept: "application/vnd.github+json",
    };

    const data = await fetchJson<{
      tag_name?: string;
      html_url?: string;
    }>(url, headers);

    const tagName = data.tag_name?.trim() || null;
    const htmlUrl = data.html_url?.trim() || null;

    if (!tagName) {
      const errMsg = "GitHub latest release response had no tag name.";
      logger.api.warn(
        { error: errMsg },
        "GitHub releases/latest: missing tag_name"
      );
      cachedLatestTag = null;
      cachedLatestUrl = null;
      cachedReleasesError = errMsg;
      lastLatestCheck = Date.now();
      return {
        latestTag: null,
        latestUrl: null,
        error: errMsg,
      };
    }

    cachedLatestTag = tagName;
    cachedLatestUrl = htmlUrl;
    cachedReleasesError = null;
    lastLatestCheck = Date.now();

    return {
      latestTag: cachedLatestTag,
      latestUrl: cachedLatestUrl,
      error: null,
    };
  } catch (cause) {
    cachedLatestTag = null;
    cachedLatestUrl = null;
    const detail = cause instanceof Error ? cause.message : "Unknown error";
    cachedReleasesError = `Could not load latest release from GitHub (${detail}).`;
    logger.api.warn(
      { error: cachedReleasesError },
      "GitHub releases/latest fetch failed"
    );
    lastLatestCheck = Date.now();
    return {
      latestTag: null,
      latestUrl: null,
      error: cachedReleasesError,
    };
  }
}

router.get("/version", async (_req: Request, res: Response): Promise<void> => {
  const tag = resolveGitTag();
  const version = tag ?? "unknown";

  const {
    latestTag,
    latestUrl,
    error: releasesError,
  } = await getLatestGitHubRelease();

  let isLatest: boolean | null = null;
  if (releasesError) {
    isLatest = null;
  } else if (tag && latestTag) {
    isLatest = tag === latestTag;
  } else {
    isLatest = null;
  }

  res.json({
    tag,
    version,
    isLatest,
    latestTag,
    latestUrl,
    releasesError,
    githubRepository: GITHUB_REPOSITORY,
  });
});

export { router as metaRoutes };
