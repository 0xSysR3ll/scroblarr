import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlexLogin } from "./usePlexLogin";

const plexMocks = vi.hoisted(() => ({
  closePopup: vi.fn(),
  login: vi.fn(),
  PlexOAuth: vi.fn(),
  preparePopup: vi.fn(),
}));

vi.mock("@utils/PlexOAuth", () => ({
  PlexOAuth: plexMocks.PlexOAuth,
}));

describe("usePlexLogin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    plexMocks.closePopup.mockReset();
    plexMocks.login.mockReset();
    plexMocks.PlexOAuth.mockReset();
    plexMocks.preparePopup.mockReset();
    plexMocks.PlexOAuth.mockReturnValue({
      closePopup: plexMocks.closePopup,
      login: plexMocks.login,
      preparePopup: plexMocks.preparePopup,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prepares the popup, completes Plex login, and closes the popup", async () => {
    const result = {
      authToken: "plex-token",
      clientIdentifier: "client-id",
    };
    const onAuthToken = vi.fn();
    plexMocks.login.mockResolvedValue(result);
    const { result: hook } = renderHook(() => usePlexLogin({ onAuthToken }));

    act(() => {
      hook.current.login();
    });

    expect(hook.current.loading).toBe(true);
    expect(plexMocks.preparePopup).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(plexMocks.login).toHaveBeenCalledTimes(1);
    expect(onAuthToken).toHaveBeenCalledWith(result);
    expect(plexMocks.closePopup).toHaveBeenCalledTimes(1);
    expect(hook.current.loading).toBe(false);
  });

  it("reuses the same PlexOAuth instance across logins", async () => {
    plexMocks.login.mockResolvedValue({
      authToken: "plex-token",
      clientIdentifier: "client-id",
    });
    const { result } = renderHook(() => usePlexLogin({ onAuthToken: vi.fn() }));

    act(() => {
      result.current.login();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    act(() => {
      result.current.login();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(plexMocks.PlexOAuth).toHaveBeenCalledTimes(1);
    expect(plexMocks.login).toHaveBeenCalledTimes(2);
  });

  it("ignores overlapping login clicks while a flow is in flight", () => {
    const { result } = renderHook(() => usePlexLogin({ onAuthToken: vi.fn() }));

    act(() => {
      result.current.login();
      result.current.login();
    });

    expect(plexMocks.preparePopup).toHaveBeenCalledTimes(1);
  });

  it("reports popup preparation errors without starting login", () => {
    const onError = vi.fn();
    plexMocks.preparePopup.mockImplementationOnce(() => {
      throw new Error("Popups blocked");
    });
    const { result } = renderHook(() =>
      usePlexLogin({ onAuthToken: vi.fn(), onError })
    );

    act(() => {
      result.current.login();
    });

    expect(onError).toHaveBeenCalledWith("Popups blocked");
    expect(plexMocks.login).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("uses a default popup error when a non-Error is thrown", () => {
    const onError = vi.fn();
    plexMocks.preparePopup.mockImplementationOnce(() => {
      throw "blocked";
    });
    const { result } = renderHook(() =>
      usePlexLogin({ onAuthToken: vi.fn(), onError })
    );

    act(() => {
      result.current.login();
    });

    expect(onError).toHaveBeenCalledWith(
      "Failed to open authentication window. Please allow popups and try again."
    );
  });

  it("reports Plex login errors and still closes the popup", async () => {
    const onError = vi.fn();
    plexMocks.login.mockRejectedValue(new Error("Plex rejected the pin"));
    const { result } = renderHook(() =>
      usePlexLogin({ onAuthToken: vi.fn(), onError })
    );

    act(() => {
      result.current.login();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(onError).toHaveBeenCalledWith("Plex rejected the pin");
    expect(plexMocks.closePopup).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it("uses a default login error when a non-Error is rejected", async () => {
    const onError = vi.fn();
    plexMocks.login.mockRejectedValue("nope");
    const { result } = renderHook(() =>
      usePlexLogin({ onAuthToken: vi.fn(), onError })
    );

    act(() => {
      result.current.login();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(onError).toHaveBeenCalledWith("Failed to login with Plex");
  });

  it("tolerates missing onError handlers", async () => {
    plexMocks.preparePopup.mockImplementationOnce(() => {
      throw new Error("Popups blocked");
    });
    const { result } = renderHook(() => usePlexLogin({ onAuthToken: vi.fn() }));

    act(() => {
      result.current.login();
    });
    expect(result.current.loading).toBe(false);

    plexMocks.preparePopup.mockReset();
    plexMocks.preparePopup.mockImplementation(() => undefined);
    plexMocks.login.mockRejectedValue(new Error("fail"));

    act(() => {
      result.current.login();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.loading).toBe(false);
  });
});
