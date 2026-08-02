import { useAuth } from "@contexts/AuthContext";
import { renderWithProviders } from "@test/render";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "./App";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@pages/auth/SetupPage", () => ({
  SetupPage: () => <h1>Setup page</h1>,
}));

vi.mock("@pages/auth/LoginPage", () => ({
  LoginPage: () => <h1>Login page</h1>,
}));

vi.mock("@pages/user/DashboardPage", () => ({
  DashboardPage: () => <h1>Dashboard page</h1>,
}));

vi.mock("@pages/admin/SettingsPage", () => ({
  SettingsPage: () => <h1>Settings page</h1>,
}));

vi.mock("@pages/admin/UsersPage", () => ({
  UsersPage: () => <h1>Users page</h1>,
}));

vi.mock("@pages/user/ProfilePage", () => ({
  ProfilePage: () => <h1>Profile page</h1>,
}));

vi.mock("@pages/user/SyncDashboardPage", () => ({
  SyncDashboardPage: () => <h1>Sync page</h1>,
}));

vi.mock("@utils/toast", () => ({
  showError: vi.fn(),
}));

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    loading: false,
    logout: vi.fn(),
    checkAuth: vi.fn(),
    setUserFromLogin: vi.fn(),
    isAuthenticated: false,
    isAdmin: false,
    ...overrides,
  });
}

function mockCheckAdminOk(hasAdmin: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasAdmin }),
    })
  );
}

describe("AppRoutes", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockAuth();
  });

  it("shows the offline page when check-admin cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    renderWithProviders(<AppRoutes />);

    expect(
      await screen.findByRole("heading", { name: /scroblarr is unavailable/i })
    ).toBeVisible();
  });

  it("shows the offline page for an invalid check-admin payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })
    );

    renderWithProviders(<AppRoutes />);

    expect(
      await screen.findByRole("heading", { name: /scroblarr is unavailable/i })
    ).toBeVisible();
  });

  it("routes to setup when the API confirms there is no admin", async () => {
    mockCheckAdminOk(false);

    renderWithProviders(<AppRoutes />, { route: "/" });

    expect(
      await screen.findByRole("heading", { name: /setup page/i })
    ).toBeVisible();
  });

  it("loads normal routes when the API confirms an admin exists", async () => {
    mockCheckAdminOk(true);

    renderWithProviders(<AppRoutes />, { route: "/login" });

    expect(
      await screen.findByRole("heading", { name: /login page/i })
    ).toBeVisible();
  });

  it("retries the admin check from the offline page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hasAdmin: true }),
      });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AppRoutes />, { route: "/login" });

    expect(
      await screen.findByRole("heading", { name: /scroblarr is unavailable/i })
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByRole("heading", { name: /login page/i })
    ).toBeVisible();
  });

  it("shows offline for non-OK responses before setup status is known", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
    );

    renderWithProviders(<AppRoutes />);

    expect(
      await screen.findByRole("heading", { name: /scroblarr is unavailable/i })
    ).toBeVisible();
  });

  it("aborts a stalled check-admin request and shows the offline page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
      )
    );

    try {
      renderWithProviders(<AppRoutes />);

      await vi.advanceTimersByTimeAsync(8_000);

      expect(
        await screen.findByRole("heading", {
          name: /scroblarr is unavailable/i,
        })
      ).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores overlapping retry clicks while an admin check is in flight", async () => {
    let releaseCheck: ((value: unknown) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseCheck = resolve;
          })
      );
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AppRoutes />, { route: "/login" });

    expect(
      await screen.findByRole("heading", { name: /scroblarr is unavailable/i })
    ).toBeVisible();

    const retry = screen.getByRole("button", { name: /try again/i });
    // Fire both clicks before React re-renders away from the offline page.
    act(() => {
      retry.click();
      retry.click();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    releaseCheck?.({
      ok: true,
      json: async () => ({ hasAdmin: true }),
    });

    expect(
      await screen.findByRole("heading", { name: /login page/i })
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps setup routing when a later check-admin failure happens after a known state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hasAdmin: false }),
      })
      .mockRejectedValueOnce(new Error("transient"));
    vi.stubGlobal("fetch", fetchMock);
    mockAuth({ isAuthenticated: true });

    renderWithProviders(<AppRoutes />, { route: "/" });

    expect(
      await screen.findByRole("heading", { name: /setup page/i })
    ).toBeVisible();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByRole("heading", { name: /setup page/i })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /scroblarr is unavailable/i })
    ).not.toBeInTheDocument();
  });
});
