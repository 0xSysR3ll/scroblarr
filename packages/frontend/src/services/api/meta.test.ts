import { jsonResponse } from "@test/jsonResponse";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAppVersion } from "./meta";

describe("meta api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fetches app version metadata", async () => {
    const version = {
      version: "1.2.3",
      tag: "v1.2.3",
      isLatest: false,
      latestTag: "v1.2.4",
      latestUrl: "https://github.com/sysr3ll/scroblarr/releases/tag/v1.2.4",
      releasesError: null,
      githubRepository: "sysr3ll/scroblarr",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(version));

    await expect(getAppVersion()).resolves.toEqual(version);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/meta/version");
  });

  it("throws when version metadata cannot be fetched", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(getAppVersion()).rejects.toThrow(
      "Failed to fetch app version"
    );
  });
});
