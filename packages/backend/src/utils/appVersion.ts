const RELEASE_TAG_RE = /^v?\d+\.\d+\.\d+/;

function readCommitTag(): string {
  const fromEnv = process.env.COMMIT_TAG?.trim();
  return fromEnv || "local";
}

function readReleaseTag(): string | null {
  const fromEnv = process.env.GIT_TAG?.trim();
  if (!fromEnv || fromEnv === "ci") {
    return null;
  }
  if (!RELEASE_TAG_RE.test(fromEnv)) {
    return null;
  }
  return fromEnv.startsWith("v") ? fromEnv : `v${fromEnv}`;
}

export function getCommitTag(): string {
  return readCommitTag();
}

export function getAppVersion(): string {
  const releaseTag = readReleaseTag();
  if (releaseTag) {
    return releaseTag;
  }
  return `develop-${getCommitTag()}`;
}

export function isDevelopVersion(version: string = getAppVersion()): boolean {
  return version.startsWith("develop-");
}
