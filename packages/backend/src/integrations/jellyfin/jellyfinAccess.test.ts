import { describe, expect, it } from "vitest";

import {
  isHttpsMediaServerHost,
  resolveJellyfinAccessToken,
} from "./jellyfinAccess";

describe("jellyfinAccess", () => {
  it("treats only https hosts as safe for server API keys", () => {
    expect(isHttpsMediaServerHost("https://emby.local")).toBe(true);
    expect(isHttpsMediaServerHost("http://emby.local")).toBe(false);
    expect(isHttpsMediaServerHost("not a url")).toBe(false);
    expect(isHttpsMediaServerHost(undefined)).toBe(false);
  });

  it("prefers the user token and gates API keys behind HTTPS hosts", () => {
    expect(
      resolveJellyfinAccessToken("user-token", {
        jellyfinHost: "http://emby.local",
        jellyfinApiKey: "server-api-key",
      })
    ).toBe("user-token");

    expect(
      resolveJellyfinAccessToken(undefined, {
        jellyfinHost: "https://emby.local",
        jellyfinApiKey: "server-api-key",
      })
    ).toBe("server-api-key");

    expect(
      resolveJellyfinAccessToken(undefined, {
        jellyfinHost: "http://emby.local",
        jellyfinApiKey: "server-api-key",
      })
    ).toBeUndefined();
  });
});
