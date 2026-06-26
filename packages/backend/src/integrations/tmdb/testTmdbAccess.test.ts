import { afterEach, describe, expect, it, vi } from "vitest";

import {
  testTmdbAccessToken,
  toTmdbConnectionTestError,
} from "./testTmdbAccess";
import { TmdbRateLimitError } from "./TmdbApiError";

describe("testTmdbAccessToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success when TMDB accepts the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(testTmdbAccessToken("valid-token")).resolves.toEqual({
      success: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/configuration",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
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

  it("returns a generic API error for other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      })
    );

    await expect(testTmdbAccessToken("valid-token")).resolves.toEqual({
      success: false,
      status: 503,
      message: "TMDB API returned 503",
    });
  });

  it("maps unexpected errors to a connection failure", () => {
    expect(toTmdbConnectionTestError(new TmdbRateLimitError())).toEqual({
      success: false,
      status: 429,
      message: "TMDB rate limit exceeded. Try again shortly.",
    });
    expect(toTmdbConnectionTestError(new Error("network"))).toEqual({
      success: false,
      status: 500,
      message: "Failed to reach TMDB API",
    });
    expect(
      toTmdbConnectionTestError(
        Object.assign(new Error("The operation was aborted"), {
          name: "AbortError",
        })
      )
    ).toEqual({
      success: false,
      status: 500,
      message: "Failed to reach TMDB API",
    });
  });
});
