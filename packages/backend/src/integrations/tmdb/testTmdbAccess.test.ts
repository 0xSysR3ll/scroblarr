import { afterEach, describe, expect, it, vi } from "vitest";

import { testTmdbAccessToken } from "./testTmdbAccess";

describe("testTmdbAccessToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success when TMDB accepts the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      })
    );

    await expect(testTmdbAccessToken("valid-token")).resolves.toEqual({
      success: true,
    });
  });

  it("returns a clear error for invalid tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      })
    );

    await expect(testTmdbAccessToken("invalid-token")).resolves.toEqual({
      success: false,
      status: 401,
      message: "Invalid TMDB access token",
    });
  });

  it("returns a rate limit message for 429 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      })
    );

    await expect(testTmdbAccessToken("valid-token")).resolves.toEqual({
      success: false,
      status: 429,
      message: "TMDB rate limit exceeded. Try again shortly.",
    });
  });
});
