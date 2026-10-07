import { afterEach, describe, expect, it, vi } from "vitest";

const loggerMocks = vi.hoisted(() => ({
  jellyfin: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  emby: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@utils/logger", () => ({
  logger: loggerMocks,
}));

import { describeNetworkError, JellyfinClient } from "./JellyfinClient";

describe("describeNetworkError", () => {
  it("surfaces nested undici cause codes", () => {
    const root = new Error("connect ECONNREFUSED 127.0.0.1:8096") as Error & {
      code?: string;
    };
    root.code = "ECONNREFUSED";
    const fetchError = new TypeError("fetch failed", { cause: root });

    expect(describeNetworkError(fetchError)).toBe(
      "connect ECONNREFUSED 127.0.0.1:8096"
    );
  });

  it("prefixes a code when it is missing from the deepest message", () => {
    const root = new Error("certificate has expired") as Error & {
      code?: string;
    };
    root.code = "CERT_HAS_EXPIRED";
    const fetchError = new TypeError("fetch failed", { cause: root });

    expect(describeNetworkError(fetchError)).toBe(
      "CERT_HAS_EXPIRED: certificate has expired"
    );
  });

  it("returns the message when no errno code is present", () => {
    expect(describeNetworkError(new Error("something went wrong"))).toBe(
      "something went wrong"
    );
  });
});

describe("JellyfinClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("fetches images with the provided abort signal", async () => {
    const imageBytes = new Uint8Array([1, 2, 3]).buffer;
    const signal = AbortSignal.timeout(10_000);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "image/jpeg" : null,
      },
      arrayBuffer: async () => imageBytes,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local");
    const result = await client.fetchImage(
      "access-token",
      "https://jellyfin.local/Items/1/Images/Primary",
      signal
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://jellyfin.local/Items/1/Images/Primary",
      expect.objectContaining({ signal })
    );
    expect(result.contentType).toBe("image/jpeg");
    expect(result.buffer).toBe(imageBytes);
  });

  it("throws when Jellyfin image fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.fetchImage(
        "access-token",
        "https://jellyfin.local/Items/1/Images/Primary"
      )
    ).rejects.toThrow("Failed to fetch image: 404 Not Found");
  });

  it("rejects image URLs outside the configured Jellyfin host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.fetchImage(
        "access-token",
        "http://169.254.169.254/latest/meta-data/"
      )
    ).rejects.toThrow("Jellyfin image URL must match configured server");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid image URLs before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.fetchImage("access-token", "not-a-url")
    ).rejects.toThrow("Jellyfin image URL must match configured server");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows image URLs when only the default HTTPS port differs", async () => {
    const imageBytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      arrayBuffer: async () => imageBytes,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local:443");
    const result = await client.fetchImage(
      "access-token",
      "https://jellyfin.local/Items/1/Images/Primary"
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.contentType).toBe("image/jpeg");
  });

  it("builds season poster URLs under the configured Jellyfin base path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ Type: "Series", Id: "series-1" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Items: [{ Id: "season-9", IndexNumber: 2 }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local/jf");
    const signal = AbortSignal.timeout(5_000);
    await expect(
      client.getSeasonPosterUrl("access-token", "episode-1", 2, signal)
    ).resolves.toBe("https://jellyfin.local/jf/Items/season-9/Images/Primary");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://jellyfin.local/jf/Items/episode-1/Ancestors",
      expect.objectContaining({ signal })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://jellyfin.local/jf/Shows/series-1/Seasons",
      expect.objectContaining({ signal })
    );
  });

  it("returns null when season poster lookup throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.getSeasonPosterUrl("access-token", "episode-1", 1)
    ).resolves.toBeNull();
  });

  it("returns null when season poster ancestors request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.getSeasonPosterUrl("access-token", "episode-1", 1)
    ).resolves.toBeNull();
  });

  it("returns null when season poster ancestors lack a series", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ Type: "Folder", Id: "folder-1" }],
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.getSeasonPosterUrl("access-token", "episode-1", 1)
    ).resolves.toBeNull();
  });

  it("returns null when season poster seasons request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ Type: "Series", Id: "series-1" }],
      })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.getSeasonPosterUrl("access-token", "episode-1", 1)
    ).resolves.toBeNull();
  });

  it("returns null when season poster season index is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ Type: "Series", Id: "series-1" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Items: [{ Id: "season-1", IndexNumber: 1 }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(
      client.getSeasonPosterUrl("access-token", "episode-1", 9)
    ).resolves.toBeNull();
  });

  it("uses official Emby Authorization and X-Emby-Token headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        User: { Id: "u1", Name: "admin" },
        AccessToken: "tok",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new JellyfinClient("https://emby.local", undefined, "emby");
    await client.login("admin", "secret");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://emby.local/Users/AuthenticateByName",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Emby Client="/),
          "X-Emby-Authorization": expect.stringMatching(/^Emby Client="/),
        }),
      })
    );

    const headers = client.getAuthHeaders("tok", "u1");
    expect(headers.Authorization).toContain('UserId="u1"');
    expect(headers["X-Emby-Token"]).toBe("tok");
  });

  it("maps 401 login failures to invalid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "bad password",
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.login("admin", "bad-secret")).rejects.toThrow(
      "Invalid credentials"
    );
    expect(loggerMocks.jellyfin.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "admin",
        errorText: "bad password",
        serverKind: "jellyfin",
      }),
      "Jellyfin login failed: invalid credentials (401)"
    );
  });

  it("logs non-401 login failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: async () => "upstream down",
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.login("admin", "secret")).rejects.toThrow(
      "Jellyfin authentication failed: 503 Service Unavailable"
    );
    expect(loggerMocks.jellyfin.error).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 503,
        statusText: "Service Unavailable",
        errorText: "upstream down",
        username: "admin",
        baseUrl: "https://jellyfin.local",
        serverKind: "jellyfin",
      }),
      "Jellyfin login failed"
    );
  });

  it("wraps non-Error login failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("network down"));

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.login("admin", "secret")).rejects.toThrow(
      "Failed to authenticate with Jellyfin"
    );
  });

  it("enriches fetch failures with target URL and cause", async () => {
    const root = new Error("connect ECONNREFUSED 10.0.0.5:8096") as Error & {
      code?: string;
    };
    root.code = "ECONNREFUSED";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: root }))
    );

    const client = new JellyfinClient(
      "http://emby.local:8096",
      undefined,
      "emby"
    );
    await expect(client.login("admin", "secret")).rejects.toThrow(
      "Unable to reach Emby at http://emby.local:8096: connect ECONNREFUSED 10.0.0.5:8096"
    );
    expect(loggerMocks.emby.error).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "admin",
        baseUrl: "http://emby.local:8096",
        serverKind: "emby",
        error: "fetch failed",
        cause: "connect ECONNREFUSED 10.0.0.5:8096",
      }),
      "Emby login network error"
    );
  });

  it("enriches Jellyfin fetch failures with the Jellyfin label", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.login("admin", "secret")).rejects.toThrow(
      "Unable to reach Jellyfin at https://jellyfin.local: fetch failed"
    );
    expect(loggerMocks.jellyfin.error).toHaveBeenCalledWith(
      expect.objectContaining({
        serverKind: "jellyfin",
        error: "fetch failed",
      }),
      "Jellyfin login network error"
    );
  });

  it("treats errno-style causes as network failures even without fetch failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND emby.invalid"))
    );

    const client = new JellyfinClient(
      "http://emby.invalid:8096",
      undefined,
      "emby"
    );
    await expect(client.login("admin", "secret")).rejects.toThrow(
      "Unable to reach Emby at http://emby.invalid:8096: getaddrinfo ENOTFOUND emby.invalid"
    );
  });

  it("rethrows unexpected Errors that are not network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new SyntaxError("Unexpected token < in JSON"))
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.login("admin", "secret")).rejects.toThrow(
      "Unexpected token < in JSON"
    );
    expect(loggerMocks.jellyfin.error).not.toHaveBeenCalledWith(
      expect.anything(),
      "Jellyfin login network error"
    );
  });

  it("labels Emby HTTP auth failures with Emby", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: async () => "upstream down",
      })
    );

    const client = new JellyfinClient("https://emby.local", undefined, "emby");
    await expect(client.login("admin", "secret")).rejects.toThrow(
      "Emby authentication failed: 503 Service Unavailable"
    );
  });

  it("wraps non-Error Emby login failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("network down"));

    const client = new JellyfinClient("https://emby.local", undefined, "emby");
    await expect(client.login("admin", "secret")).rejects.toThrow(
      "Failed to authenticate with Emby"
    );
  });

  it("returns users and logs debug details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ Id: "u1", Name: "Alice" }],
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.getUsers("api-key")).resolves.toEqual([
      { Id: "u1", Name: "Alice" },
    ]);
    expect(loggerMocks.jellyfin.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        userCount: 1,
        baseUrl: "https://jellyfin.local",
      }),
      "Fetched Jellyfin users"
    );
  });

  it("logs getUsers failures before throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
        text: async () => "boom",
      })
    );

    const client = new JellyfinClient("https://user:pass@jellyfin.local");
    await expect(client.getUsers("api-key")).rejects.toThrow(
      "Failed to get Jellyfin users: 500 Server Error"
    );
    expect(loggerMocks.jellyfin.error).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        statusText: "Server Error",
        errorText: "boom",
        baseUrl: "https://***@jellyfin.local",
      }),
      "Failed to get Jellyfin users"
    );
    expect(loggerMocks.jellyfin.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Error fetching Jellyfin users"
    );
  });

  it("returns Jellyfin user info and derived thumb urls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Id: "u1",
          Name: "Alice",
          PrimaryImageTag: "tag-1",
          Policy: { IsAdministrator: true },
        }),
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.getUserInfo("api-key", "u1")).resolves.toEqual({
      id: "u1",
      username: "Alice",
      displayName: "Alice",
      email: undefined,
      thumb: "/api/v1/avatars/jellyfin/u1",
      isAdmin: true,
    });
    expect(loggerMocks.jellyfin.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        username: "Alice",
        isAdmin: true,
      }),
      "Fetched Jellyfin user info"
    );
  });

  it("omits thumb when Jellyfin user has no primary image tag", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Id: "u2",
          Name: "Bob",
        }),
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.getUserInfo("api-key", "u2")).resolves.toEqual({
      id: "u2",
      username: "Bob",
      displayName: "Bob",
      email: undefined,
      thumb: undefined,
      isAdmin: false,
    });
  });

  it("logs getUserInfo failures before throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "missing",
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.getUserInfo("api-key", "u404")).rejects.toThrow(
      "Failed to get Jellyfin user info: 404 Not Found"
    );
    expect(loggerMocks.jellyfin.error).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        statusText: "Not Found",
        errorText: "missing",
        userId: "u404",
      }),
      "Failed to get Jellyfin user info"
    );
    expect(loggerMocks.jellyfin.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
        userId: "u404",
      }),
      "Error fetching Jellyfin user info"
    );
  });

  it("returns Jellyfin system info and logs debug details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ServerName: "Media Server",
          Version: "10.8.13",
        }),
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.getSystemInfo("api-key")).resolves.toEqual({
      ServerName: "Media Server",
      Version: "10.8.13",
    });
    expect(loggerMocks.jellyfin.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: "Media Server",
        version: "10.8.13",
      }),
      "Fetched Jellyfin system info"
    );
  });

  it("logs Jellyfin system info failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () => "bad gateway",
      })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.getSystemInfo("api-key")).rejects.toThrow(
      "Failed to get Jellyfin system info: 502 Bad Gateway"
    );
    expect(loggerMocks.jellyfin.error).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 502,
        errorText: "bad gateway",
      }),
      "Failed to get Jellyfin system info"
    );
    expect(loggerMocks.jellyfin.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Error fetching Jellyfin system info"
    );
  });

  it("creates Jellyfin API keys from the newest matching app entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            Items: [
              { AppName: "Other", AccessToken: "other-token" },
              { AppName: "Scroblarr", AccessToken: "old-token" },
              { AppName: "Scroblarr", AccessToken: "new-token" },
            ],
          }),
        })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.createApiKey("api-key", "Scroblarr")).resolves.toBe(
      "new-token"
    );
  });

  it("logs API key creation failures from the create step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "denied",
      })
    );

    const client = new JellyfinClient("https://emby.local", undefined, "emby");
    await expect(client.createApiKey("api-key", "Scroblarr")).rejects.toThrow(
      "Failed to create API key: 403 Forbidden"
    );
    expect(loggerMocks.emby.error).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 403,
        errorText: "denied",
        serverKind: "emby",
      }),
      "Failed to create Jellyfin API key"
    );
    expect(loggerMocks.emby.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Error creating Jellyfin API key"
    );
  });

  it("throws when created API keys cannot be listed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
        })
        .mockResolvedValueOnce({
          ok: false,
        })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.createApiKey("api-key", "Scroblarr")).rejects.toThrow(
      "Failed to fetch API keys"
    );
  });

  it("throws when the created API key cannot be found", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            Items: [{ AppName: "Other", AccessToken: "other-token" }],
          }),
        })
    );

    const client = new JellyfinClient("https://jellyfin.local");
    await expect(client.createApiKey("api-key", "Scroblarr")).rejects.toThrow(
      "API key not found after creation"
    );
  });

  it("logs Emby image fetch failures under the emby label", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      })
    );

    const client = new JellyfinClient("https://emby.local", undefined, "emby");
    await expect(
      client.fetchImage("tok", "https://emby.local/Items/1/Images/Primary")
    ).rejects.toThrow(/Failed to fetch image/);
    expect(loggerMocks.emby.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 401,
        imageUrl: "https://emby.local/Items/1/Images/Primary",
      }),
      "Failed to fetch Jellyfin image"
    );
    expect(loggerMocks.jellyfin.warn).not.toHaveBeenCalled();
  });
});
