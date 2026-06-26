import { afterEach, describe, expect, it } from "vitest";

import { buildTmdbImageUrl, getTmdbAccessToken } from "./tmdbConfig";

describe("tmdbConfig", () => {
  const originalEnvToken = process.env.TMDB_ACCESS_TOKEN;

  afterEach(() => {
    if (originalEnvToken === undefined) {
      delete process.env.TMDB_ACCESS_TOKEN;
    } else {
      process.env.TMDB_ACCESS_TOKEN = originalEnvToken;
    }
  });

  it("prefers the settings token over the environment variable", () => {
    process.env.TMDB_ACCESS_TOKEN = "env-token";

    expect(getTmdbAccessToken({ tmdbAccessToken: " settings-token " })).toBe(
      "settings-token"
    );
  });

  it("falls back to the environment variable when settings are empty", () => {
    process.env.TMDB_ACCESS_TOKEN = " env-token ";

    expect(getTmdbAccessToken({})).toBe("env-token");
  });

  it("builds TMDB image URLs with and without a leading slash", () => {
    expect(buildTmdbImageUrl("/poster.jpg")).toBe(
      "https://image.tmdb.org/t/p/w500/poster.jpg"
    );
    expect(buildTmdbImageUrl("poster.jpg")).toBe(
      "https://image.tmdb.org/t/p/w500/poster.jpg"
    );
  });
});
