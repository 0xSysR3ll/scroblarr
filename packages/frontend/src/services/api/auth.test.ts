import { jsonResponse } from "@test/jsonResponse";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCurrentUser,
  getAuthProviders,
  linkEmbyAccount,
  linkJellyfinAccount,
  linkPlexAccount,
  loginWithEmby,
  loginWithJellyfin,
  loginWithPlex,
  setupAdmin,
  setupEmbyAdmin,
  setupJellyfinAdmin,
  unlinkEmbyAccount,
  unlinkJellyfinAccount,
  unlinkPlexAccount,
  updateProfile,
} from "./auth";

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
      body: JSON.stringify({
        username: "alice",
        password: "secret",
        mediaBrowserType: "jellyfin",
      }),
    });
  });

  it("logs in with Jellyfin credentials against the Jellyfin endpoint", async () => {
    const user = { id: "1", username: "jf-user", isAdmin: false };
    fetchMock.mockResolvedValueOnce(jsonResponse(user));

    await expect(
      loginWithJellyfin("alice", "secret", "jellyfin.local", 8096, false, "/jf")
    ).resolves.toEqual(user);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/jellyfin",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      username: "alice",
      password: "secret",
      hostname: "jellyfin.local",
      port: 8096,
      useSsl: false,
      urlBase: "/jf",
      mediaBrowserType: "jellyfin",
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
          mediaBrowserType: "jellyfin",
        }),
      }
    );
  });

  it("logs in with Emby credentials against the Emby endpoint", async () => {
    const user = { id: "1", username: "emby-user", isAdmin: false };
    fetchMock.mockResolvedValueOnce(jsonResponse(user));

    await expect(
      loginWithEmby("alice", "secret", "emby.local", 8920, true, "/emby")
    ).resolves.toEqual(user);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/emby",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      username: "alice",
      password: "secret",
      hostname: "emby.local",
      port: 8920,
      useSsl: true,
      urlBase: "/emby",
      mediaBrowserType: "emby",
    });
  });

  it("links Emby accounts with auth headers and server details", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "1", isAdmin: false }));

    await linkEmbyAccount("alice", "secret", "emby.local", 8920, true, "/emby");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/emby/link",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      username: "alice",
      password: "secret",
      hostname: "emby.local",
      port: 8920,
      useSsl: true,
      urlBase: "/emby",
      mediaBrowserType: "emby",
    });
  });

  it("uses the Emby setup-admin endpoint for Emby admin setup", async () => {
    const response = {
      user: { id: "1", username: "admin", isAdmin: true },
      accessToken: "token",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    await expect(
      setupEmbyAdmin("admin", "secret", "emby.local", 8920, true, "/emby")
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/emby/setup-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "secret",
        hostname: "emby.local",
        port: 8920,
        useSsl: true,
        urlBase: "/emby",
        mediaBrowserType: "emby",
      }),
    });
  });

  it("falls back to the default Emby unlink error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });

    await expect(unlinkEmbyAccount()).rejects.toThrow(
      "Failed to unlink Emby account"
    );
  });

  it("surfaces server Emby unlink errors", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Emby account is still linked elsewhere" }, false)
    );

    await expect(unlinkEmbyAccount()).rejects.toThrow(
      "Emby account is still linked elsewhere"
    );
  });

  it("falls back when Emby unlink error payload omits a message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(unlinkEmbyAccount()).rejects.toThrow(
      "Failed to unlink Emby account"
    );
  });

  it("unlinks Emby accounts successfully", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await expect(unlinkEmbyAccount()).resolves.toEqual({ success: true });
  });

  it("falls back when Plex login error payload omits a message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(loginWithPlex("bad-token")).rejects.toThrow(
      "Failed to login with Plex"
    );
  });

  it("links Plex accounts and surfaces server errors", async () => {
    const user = { id: "1", username: "plex-user", isAdmin: false };
    fetchMock.mockResolvedValueOnce(jsonResponse(user));

    await expect(linkPlexAccount("token", "client-id")).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/plex/link",
      expect.objectContaining({ method: "POST" })
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Already linked" }, false)
    );
    await expect(linkPlexAccount("token")).rejects.toThrow("Already linked");

    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(linkPlexAccount("token")).rejects.toThrow(
      "Failed to link Plex account"
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });
    await expect(linkPlexAccount("token")).rejects.toThrow(
      "Failed to link Plex account"
    );
  });

  it("covers Jellyfin login and link error fallbacks", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Bad credentials" }, false)
    );
    await expect(loginWithJellyfin("alice", "secret")).rejects.toThrow(
      "Bad credentials"
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(loginWithJellyfin("alice", "secret")).rejects.toThrow(
      "Failed to login with Jellyfin"
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });
    await expect(loginWithJellyfin("alice", "secret")).rejects.toThrow(
      "Failed to login with Jellyfin"
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Link failed" }, false)
    );
    await expect(linkJellyfinAccount("alice", "secret")).rejects.toThrow(
      "Link failed"
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(linkJellyfinAccount("alice", "secret")).rejects.toThrow(
      "Failed to link Jellyfin account"
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });
    await expect(linkJellyfinAccount("alice", "secret")).rejects.toThrow(
      "Failed to link Jellyfin account"
    );
  });

  it("builds media-browser bodies with hostname only", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "1", isAdmin: false }));

    await loginWithJellyfin("alice", "secret", "jellyfin.local");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      username: "alice",
      password: "secret",
      hostname: "jellyfin.local",
      mediaBrowserType: "jellyfin",
    });
  });

  it("unlinks Plex and Jellyfin accounts with error fallbacks", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    await expect(unlinkPlexAccount()).resolves.toEqual({ success: true });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Plex unlink denied" }, false)
    );
    await expect(unlinkPlexAccount()).rejects.toThrow("Plex unlink denied");

    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(unlinkPlexAccount()).rejects.toThrow(
      "Failed to unlink Plex account"
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });
    await expect(unlinkPlexAccount()).rejects.toThrow(
      "Failed to unlink Plex account"
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    await expect(unlinkJellyfinAccount()).resolves.toEqual({ success: true });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Jellyfin unlink denied" }, false)
    );
    await expect(unlinkJellyfinAccount()).rejects.toThrow(
      "Jellyfin unlink denied"
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(unlinkJellyfinAccount()).rejects.toThrow(
      "Failed to unlink Jellyfin account"
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });
    await expect(unlinkJellyfinAccount()).rejects.toThrow(
      "Failed to unlink Jellyfin account"
    );
  });

  it("fails loudly when auth providers cannot be loaded", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(getAuthProviders()).rejects.toThrow(
      "Failed to get auth providers"
    );
  });

  it("sets up a Plex admin and surfaces setup failures", async () => {
    const user = { id: "1", username: "admin", isAdmin: true };
    fetchMock.mockResolvedValueOnce(jsonResponse(user));

    await expect(setupAdmin("token", "client-id")).resolves.toEqual(user);

    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(setupAdmin("token")).rejects.toThrow("Failed to setup admin");
  });

  it("covers Jellyfin admin setup error fallbacks", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Setup denied" }, false)
    );
    await expect(
      setupJellyfinAdmin("admin", "secret", "jellyfin.local")
    ).rejects.toThrow("Setup denied");

    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(
      setupJellyfinAdmin("admin", "secret", "jellyfin.local")
    ).rejects.toThrow("Failed to setup Jellyfin admin");

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });
    await expect(
      setupJellyfinAdmin("admin", "secret", "jellyfin.local")
    ).rejects.toThrow("Failed to setup Jellyfin admin");
  });

  it("loads the current user and updates the profile", async () => {
    const user = { id: "1", username: "alice", isAdmin: false };
    fetchMock.mockResolvedValueOnce(jsonResponse(user));
    await expect(getCurrentUser()).resolves.toEqual(user);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...user, displayName: "Alice" })
    );
    await expect(updateProfile({ displayName: "Alice" })).resolves.toEqual({
      ...user,
      displayName: "Alice",
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Profile update denied" }, false)
    );
    await expect(updateProfile({ email: "a@b.c" })).rejects.toThrow(
      "Profile update denied"
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(updateProfile({ email: "a@b.c" })).rejects.toThrow(
      "Failed to update profile"
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });
    await expect(updateProfile({ email: "a@b.c" })).rejects.toThrow(
      "Failed to update profile"
    );
  });
});
