import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCurrentUser,
  getAuthProviders,
  linkJellyfinAccount,
  loginWithPlex,
  setupJellyfinAdmin,
} from "./auth";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("auth api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("logs in with Plex token and client identifier", async () => {
    const user = { id: "1", username: "plex-user", isAdmin: true };
    fetchMock.mockResolvedValueOnce(jsonResponse(user));

    await expect(loginWithPlex("token", "client-id")).resolves.toEqual(user);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/plex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authToken: "token",
        clientIdentifier: "client-id",
      }),
    });
  });

  it("uses server auth errors for failed Plex login", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Plex rejected the token" }, false)
    );

    await expect(loginWithPlex("bad-token")).rejects.toThrow(
      "Plex rejected the token"
    );
  });

  it("keeps the HTTP status on failed current-user checks", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));

    await expect(getCurrentUser()).rejects.toMatchObject({
      message: "Failed to get current user: 401",
      status: 401,
    });
  });

  it("fetches available auth providers with auth headers", async () => {
    const providers = {
      hasAdmin: true,
      jellyfinConfigured: false,
      plexConfigured: true,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(providers));

    await expect(getAuthProviders()).resolves.toEqual(providers);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/providers", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("links Jellyfin accounts with credentials in the body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "1", isAdmin: false }));

    await linkJellyfinAccount("alice", "secret");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/jellyfin/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "secret" }),
    });
  });

  it("sends server details when setting up a Jellyfin admin", async () => {
    const response = {
      user: { id: "1", username: "admin", isAdmin: true },
      accessToken: "token",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    await expect(
      setupJellyfinAdmin("admin", "secret", "jellyfin.local", 443, true, "/jf")
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/jellyfin/setup-admin",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "admin",
          password: "secret",
          hostname: "jellyfin.local",
          port: 443,
          useSsl: true,
          urlBase: "/jf",
        }),
      }
    );
  });
});
