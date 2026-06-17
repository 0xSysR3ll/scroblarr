import { describe, expect, it } from "vitest";

import { timingSafeStringEqual } from "./timingSafeEqual";
import { getProxiedThumbUrl, sanitizeUser } from "./userSanitizer";

describe("timingSafeStringEqual", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeStringEqual("super-secret", "super-secret")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(timingSafeStringEqual("super-secret", "super-secret-2")).toBe(false);
  });
});

describe("sanitizeUser", () => {
  it("prefers Jellyfin proxied avatar when jellyfin user data exists", () => {
    const user = {
      id: "u1",
      plexUsername: "plex-user",
      jellyfinUsername: "jf-user",
      jellyfinThumb: "/Items/123/Images/Primary",
      jellyfinUserId: "jf-id",
      traktThumb: "https://trakt/avatar.png",
      tvtimeThumb: "https://tvtime/avatar.png",
      isAdmin: true,
      enabled: true,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    };

    const sanitized = sanitizeUser(user as never);

    expect(sanitized.username).toBe("plex-user");
    expect(sanitized.thumb).toBe("/api/v1/avatars/jellyfin/u1");
  });

  it("falls back to undefined avatar when no thumbs exist", () => {
    const user = {
      id: "u2",
      isAdmin: false,
      enabled: true,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    };

    expect(getProxiedThumbUrl(user as never)).toBeUndefined();
  });

  it("prefers Simkl proxied avatar when Simkl thumb exists", () => {
    const user = {
      id: "u3",
      simklThumb: "https://simkl.in/avatars/1/1.jpg",
      isAdmin: false,
      enabled: true,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    };

    expect(getProxiedThumbUrl(user as never)).toBe("/api/v1/avatars/simkl/u3");
  });
});
