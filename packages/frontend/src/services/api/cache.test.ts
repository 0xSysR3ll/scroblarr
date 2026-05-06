import { describe, expect, it, vi } from "vitest";

import {
  getCached,
  invalidateCached,
  invalidateCachedPrefix,
  setCached,
} from "./cache";

describe("api cache store", () => {
  it("stores and returns cached values before expiry", () => {
    setCached("sync:status", { ok: true });
    expect(getCached<{ ok: boolean }>("sync:status")).toEqual({ ok: true });
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(now);

    setCached("sync:profile", { name: "alice" });

    vi.setSystemTime(new Date(now.getTime() + 5 * 60 * 1000 + 1));
    expect(getCached("sync:profile")).toBeNull();

    vi.useRealTimers();
  });

  it("invalidates entries by prefix", () => {
    setCached("trakt:profile", { id: "1" });
    setCached("trakt:status", { connected: true });
    setCached("tvtime:status", { connected: true });

    invalidateCachedPrefix("trakt:");

    expect(getCached("trakt:profile")).toBeNull();
    expect(getCached("trakt:status")).toBeNull();
    expect(getCached("tvtime:status")).toEqual({ connected: true });
    invalidateCached("tvtime:status");
  });
});
