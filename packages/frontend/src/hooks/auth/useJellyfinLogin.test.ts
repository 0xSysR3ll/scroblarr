import { loginWithJellyfin } from "@services/api";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useJellyfinLogin } from "./useJellyfinLogin";

vi.mock("@services/api", () => ({
  loginWithJellyfin: vi.fn(),
}));

type JellyfinLoginResponse = Awaited<ReturnType<typeof loginWithJellyfin>>;

const user: JellyfinLoginResponse = {
  id: "1",
  username: "alice",
  displayName: "Alice",
  isAdmin: true,
};

describe("useJellyfinLogin", () => {
  beforeEach(() => {
    vi.mocked(loginWithJellyfin).mockReset();
  });

  it("logs in with Jellyfin details and calls the success callback", async () => {
    const onSuccess = vi.fn();
    let resolveLogin: (value: JellyfinLoginResponse) => void = () => {};
    vi.mocked(loginWithJellyfin).mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      })
    );
    const { result } = renderHook(() => useJellyfinLogin({ onSuccess }));

    let loginPromise: Promise<JellyfinLoginResponse> | undefined;
    act(() => {
      loginPromise = result.current.login(
        "alice",
        "secret",
        "jellyfin.local",
        8096,
        false,
        "/jf"
      );
    });

    expect(result.current.loading).toBe(true);
    expect(loginWithJellyfin).toHaveBeenCalledWith(
      "alice",
      "secret",
      "jellyfin.local",
      8096,
      false,
      "/jf"
    );

    await act(async () => {
      resolveLogin(user);
      await loginPromise;
    });

    await expect(loginPromise).resolves.toEqual(user);
    expect(onSuccess).toHaveBeenCalledWith(user);
    expect(result.current.loading).toBe(false);
  });

  it("reports login errors and resets loading", async () => {
    const onError = vi.fn();
    vi.mocked(loginWithJellyfin).mockRejectedValue(
      new Error("Invalid Jellyfin credentials")
    );
    const { result } = renderHook(() => useJellyfinLogin({ onError }));

    await act(async () => {
      await expect(result.current.login("alice", "bad-secret")).rejects.toThrow(
        "Invalid Jellyfin credentials"
      );
    });

    expect(onError).toHaveBeenCalledWith("Invalid Jellyfin credentials");
    expect(result.current.loading).toBe(false);
  });
});
