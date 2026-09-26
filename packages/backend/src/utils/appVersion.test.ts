import { afterEach, describe, expect, it } from "vitest";

import { getAppVersion, getCommitTag, isDevelopVersion } from "./appVersion";

describe("appVersion", () => {
  const originalGitTag = process.env.GIT_TAG;
  const originalCommitTag = process.env.COMMIT_TAG;

  afterEach(() => {
    if (originalGitTag === undefined) {
      delete process.env.GIT_TAG;
    } else {
      process.env.GIT_TAG = originalGitTag;
    }
    if (originalCommitTag === undefined) {
      delete process.env.COMMIT_TAG;
    } else {
      process.env.COMMIT_TAG = originalCommitTag;
    }
  });

  it("defaults to develop-local when no env is set", () => {
    delete process.env.GIT_TAG;
    delete process.env.COMMIT_TAG;

    expect(getCommitTag()).toBe("local");
    expect(getAppVersion()).toBe("develop-local");
    expect(isDevelopVersion()).toBe(true);
  });

  it("uses develop-{commit} when only COMMIT_TAG is set", () => {
    delete process.env.GIT_TAG;
    process.env.COMMIT_TAG = "abc123def";

    expect(getCommitTag()).toBe("abc123def");
    expect(getAppVersion()).toBe("develop-abc123def");
    expect(isDevelopVersion()).toBe(true);
  });

  it("uses GIT_TAG for stable releases and ignores ci placeholder", () => {
    process.env.GIT_TAG = "v0.8.0";
    process.env.COMMIT_TAG = "abc123def";

    expect(getAppVersion()).toBe("v0.8.0");
    expect(isDevelopVersion()).toBe(false);

    process.env.GIT_TAG = "ci";
    expect(getAppVersion()).toBe("develop-abc123def");
  });

  it("normalizes release tags without a v prefix", () => {
    process.env.GIT_TAG = "0.9.0";
    process.env.COMMIT_TAG = "abc";

    expect(getAppVersion()).toBe("v0.9.0");
  });

  it("ignores non-semver GIT_TAG values", () => {
    process.env.GIT_TAG = "latest";
    process.env.COMMIT_TAG = "deadbeef";

    expect(getAppVersion()).toBe("develop-deadbeef");
    expect(isDevelopVersion("v1.0.0")).toBe(false);
  });

  it("treats blank COMMIT_TAG as local", () => {
    delete process.env.GIT_TAG;
    process.env.COMMIT_TAG = "   ";

    expect(getCommitTag()).toBe("local");
    expect(getAppVersion()).toBe("develop-local");
  });
});
