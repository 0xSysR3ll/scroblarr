import { describe, expect, it } from "vitest";

import { resolveJellyfinAccessToken } from "./jellyfinAccess";

describe("resolveJellyfinAccessToken", () => {
  it("prefers the user token over the server API key", () => {
    expect(
      resolveJellyfinAccessToken("user-token", {
        jellyfinApiKey: "server-api-key",
      })
    ).toBe("user-token");
  });

  it("falls back to the server API key when no user token is set", () => {
    expect(
      resolveJellyfinAccessToken(undefined, {
        jellyfinApiKey: "server-api-key",
      })
    ).toBe("server-api-key");
  });

  it("returns undefined when neither token is available", () => {
    expect(resolveJellyfinAccessToken(undefined, {})).toBeUndefined();
  });
});
