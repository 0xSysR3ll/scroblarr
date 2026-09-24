import { EventEmitter } from "events";
import https from "https";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("https", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    api: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  },
}));

import { logger } from "@utils/logger";

import {
  checkDevelopUpdates,
  checkStableUpdates,
  clearVersionCheckCache,
  fetchJson,
  getVersionCheck,
} from "./versionCheck";

type MockRequest = EventEmitter;

type MockResponse = EventEmitter & {
  statusCode?: number;
  resume: ReturnType<typeof vi.fn>;
};

type HttpsGetMock = (...args: unknown[]) => MockRequest;

function mockHttpsGet(impl: HttpsGetMock) {
  vi.mocked(https.get).mockImplementation(impl as unknown as typeof https.get);
}

function getCallback(
  args: unknown[]
): ((res: MockResponse) => void) | undefined {
  const maybeCb = args.find((arg) => typeof arg === "function");
  return maybeCb as ((res: MockResponse) => void) | undefined;
}

function mockHttpsSuccess(payload: unknown) {
  mockHttpsGet((...args) => {
    const cb = getCallback(args);
    const req = new EventEmitter() as MockRequest;
    const res = new EventEmitter() as MockResponse;
    res.statusCode = 200;
    res.resume = vi.fn();

    queueMicrotask(() => {
      cb?.(res);
      res.emit("data", Buffer.from(JSON.stringify(payload)));
      res.emit("end");
    });

    return req;
  });
}

function mockHttpsStatus(statusCode: number | undefined) {
  mockHttpsGet((...args) => {
    const cb = getCallback(args);
    const req = new EventEmitter() as MockRequest;
    const res = new EventEmitter() as MockResponse;
    res.statusCode = statusCode;
    res.resume = vi.fn();

    queueMicrotask(() => {
      cb?.(res);
    });

    return req;
  });
}

function mockHttpsRequestError(error: Error) {
  mockHttpsGet(() => {
    const req = new EventEmitter() as MockRequest;

    queueMicrotask(() => {
      req.emit("error", error);
    });

    return req;
  });
}

function mockHttpsInvalidJson() {
  mockHttpsGet((...args) => {
    const cb = getCallback(args);
    const req = new EventEmitter() as MockRequest;
    const res = new EventEmitter() as MockResponse;
    res.statusCode = 200;
    res.resume = vi.fn();

    queueMicrotask(() => {
      cb?.(res);
      res.emit("data", Buffer.from("not-json"));
      res.emit("end");
    });

    return req;
  });
}

describe("versionCheck", () => {
  beforeEach(() => {
    clearVersionCheckCache();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    clearVersionCheckCache();
    vi.useRealTimers();
  });

  describe("fetchJson", () => {
    it("parses a successful JSON response", async () => {
      mockHttpsSuccess({ ok: true });
      await expect(
        fetchJson<{ ok: boolean }>("https://example.test", { Accept: "json" })
      ).resolves.toEqual({ ok: true });
    });

    it("rejects on non-2xx status codes", async () => {
      mockHttpsStatus(403);
      await expect(fetchJson("https://example.test", {})).rejects.toThrow(
        "Request failed with status code 403"
      );
    });

    it("rejects when status code is missing", async () => {
      mockHttpsStatus(undefined);
      await expect(fetchJson("https://example.test", {})).rejects.toThrow(
        "Request failed with status code undefined"
      );
    });

    it("rejects on invalid JSON", async () => {
      mockHttpsInvalidJson();
      await expect(fetchJson("https://example.test", {})).rejects.toThrow();
    });

    it("rejects on request errors", async () => {
      mockHttpsRequestError(new Error("network down"));
      await expect(fetchJson("https://example.test", {})).rejects.toThrow(
        "network down"
      );
    });
  });

  describe("checkDevelopUpdates", () => {
    it("returns no update when commit list is empty", async () => {
      mockHttpsSuccess([]);
      await expect(checkDevelopUpdates("abc")).resolves.toEqual({
        updateAvailable: false,
        commitsBehind: 0,
        latestTag: null,
        latestUrl: null,
        error: null,
      });
    });

    it("filters skip-ci commits and reports commits behind", async () => {
      mockHttpsSuccess([
        {
          sha: "skipsha0000000000000000000000000000001",
          commit: { message: "chore: noop [skip ci]" },
        },
        {
          sha: "headsha0000000000000000000000000000001",
          commit: { message: "feat: something" },
        },
        {
          sha: "oldsha00000000000000000000000000000001",
          commit: { message: "fix: prior" },
        },
      ]);

      await expect(
        checkDevelopUpdates("oldsha00000000000000000000000000000001")
      ).resolves.toEqual({
        updateAvailable: true,
        commitsBehind: 1,
        latestTag: "headsha",
        latestUrl: "https://github.com/0xsysr3ll/scroblarr/commits/develop",
        error: null,
      });
    });

    it("reports up to date when HEAD matches commitTag", async () => {
      mockHttpsSuccess([
        {
          sha: "headsha0000000000000000000000000000001",
          commit: { message: "feat: latest" },
        },
      ]);

      await expect(
        checkDevelopUpdates("headsha0000000000000000000000000000001")
      ).resolves.toMatchObject({
        updateAvailable: false,
        commitsBehind: 0,
        latestTag: "headsha",
      });
    });

    it("uses -1 commitsBehind when the current commit is outside the recent window", async () => {
      mockHttpsSuccess([
        {
          sha: "headsha0000000000000000000000000000001",
          commit: { message: "feat: tip" },
        },
        {
          sha: "midsha00000000000000000000000000000001",
          commit: { message: "chore: mid" },
        },
      ]);

      await expect(
        checkDevelopUpdates("ancient000000000000000000000000000001")
      ).resolves.toEqual({
        updateAvailable: true,
        commitsBehind: -1,
        latestTag: "headsha",
        latestUrl: "https://github.com/0xsysr3ll/scroblarr/commits/develop",
        error: null,
      });
    });

    it("treats an all-skip-ci window as having no usable HEAD", async () => {
      mockHttpsSuccess([
        {
          sha: "skipsha0000000000000000000000000000001",
          commit: { message: "chore: a [skip ci]" },
        },
        {
          sha: "skipsha0000000000000000000000000000002",
          commit: { message: "chore: b [skip ci]" },
        },
      ]);

      await expect(checkDevelopUpdates("abc")).resolves.toEqual({
        updateAvailable: false,
        commitsBehind: 0,
        latestTag: null,
        latestUrl: "https://github.com/0xsysr3ll/scroblarr/commits/develop",
        error: null,
      });
    });
  });

  describe("checkStableUpdates", () => {
    it("returns no update when release list is empty", async () => {
      mockHttpsSuccess([]);
      await expect(checkStableUpdates("v1.0.0")).resolves.toEqual({
        updateAvailable: false,
        commitsBehind: 0,
        latestTag: null,
        latestUrl: null,
        error: null,
      });
    });

    it("marks update available when latest tag differs", async () => {
      mockHttpsSuccess([
        {
          tag_name: "v2.0.0",
          name: "v2.0.0",
          html_url:
            "https://github.com/0xsysr3ll/scroblarr/releases/tag/v2.0.0",
        },
      ]);

      await expect(checkStableUpdates("v1.0.0")).resolves.toEqual({
        updateAvailable: true,
        commitsBehind: -1,
        latestTag: "v2.0.0",
        latestUrl: "https://github.com/0xsysr3ll/scroblarr/releases/tag/v2.0.0",
        error: null,
      });
    });

    it("treats matching tag or name as up to date", async () => {
      mockHttpsSuccess([
        {
          tag_name: "release-build",
          name: "Scroblarr v1.0.0",
          html_url: "https://example.test/release",
        },
      ]);

      await expect(checkStableUpdates("v1.0.0")).resolves.toMatchObject({
        updateAvailable: false,
        commitsBehind: 0,
        latestTag: "release-build",
      });
    });

    it("handles missing tag_name on the latest release", async () => {
      mockHttpsSuccess([{ name: "untitled", html_url: "  " }]);

      await expect(checkStableUpdates("v1.0.0")).resolves.toEqual({
        updateAvailable: false,
        commitsBehind: 0,
        latestTag: null,
        latestUrl: null,
        error: null,
      });
    });

    it("compares tags when the release name is missing", async () => {
      mockHttpsSuccess([
        {
          tag_name: "v2.0.0",
          html_url: "https://example.test/v2.0.0",
        },
      ]);

      await expect(checkStableUpdates("v1.0.0")).resolves.toEqual({
        updateAvailable: true,
        commitsBehind: -1,
        latestTag: "v2.0.0",
        latestUrl: "https://example.test/v2.0.0",
        error: null,
      });
    });
  });

  describe("getVersionCheck", () => {
    it("skips remote checks for local builds", async () => {
      await expect(getVersionCheck("develop-local", "local")).resolves.toEqual({
        updateAvailable: false,
        commitsBehind: 0,
        latestTag: null,
        latestUrl: null,
        error: null,
      });
      expect(https.get).not.toHaveBeenCalled();
    });

    it("checks develop commits for develop versions", async () => {
      mockHttpsSuccess([
        {
          sha: "abcdef0123456789abcdef0123456789abcdef01",
          commit: { message: "feat: tip" },
        },
      ]);

      await expect(
        getVersionCheck(
          "develop-oldsha",
          "oldsha00000000000000000000000000000001"
        )
      ).resolves.toMatchObject({
        updateAvailable: true,
        latestTag: "abcdef0",
      });
    });

    it("checks releases for stable versions", async () => {
      mockHttpsSuccess([
        {
          tag_name: "v1.0.0",
          name: "v1.0.0",
          html_url: "https://example.test/v1.0.0",
        },
      ]);

      await expect(getVersionCheck("v1.0.0", "abc123")).resolves.toMatchObject({
        updateAvailable: false,
        latestTag: "v1.0.0",
      });
    });

    it("caches successful results within the TTL", async () => {
      mockHttpsSuccess([
        {
          tag_name: "v1.0.0",
          name: "v1.0.0",
          html_url: "https://example.test/v1.0.0",
        },
      ]);

      await getVersionCheck("v1.0.0", "abc123");
      await getVersionCheck("v1.0.0", "abc123");

      expect(https.get).toHaveBeenCalledTimes(1);
    });

    it("returns a cached failure and logs the error", async () => {
      mockHttpsRequestError(new Error("boom"));

      const first = await getVersionCheck("v1.0.0", "abc123");
      expect(first.error).toContain("boom");
      expect(logger.api.warn).toHaveBeenCalled();

      const second = await getVersionCheck("v1.0.0", "abc123");
      expect(second).toEqual(first);
      expect(https.get).toHaveBeenCalledTimes(1);
    });

    it("surfaces HTTP failures from GitHub", async () => {
      mockHttpsStatus(500);

      const result = await getVersionCheck("v1.0.0", "abc123");
      expect(result.error).toContain("status code 500");
      expect(result.updateAvailable).toBe(false);
    });

    it("maps non-Error failures to a generic message", async () => {
      mockHttpsGet(() => {
        const req = new EventEmitter() as MockRequest;
        queueMicrotask(() => {
          req.emit("error", "string-failure");
        });
        return req;
      });

      const result = await getVersionCheck("v1.0.0", "abc123");
      expect(result.error).toContain("Unknown error");
    });
  });
});
