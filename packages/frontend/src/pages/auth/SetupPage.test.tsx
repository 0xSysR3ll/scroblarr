import { useAuth } from "@contexts/AuthContext";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import { setupAdmin, setupJellyfinAdmin } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SetupPage } from "./SetupPage";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@hooks/auth/usePlexLogin", () => ({
  usePlexLogin: vi.fn(),
}));

vi.mock("@services/api", () => ({
  setupAdmin: vi.fn(),
  setupJellyfinAdmin: vi.fn(),
}));

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    loading: false,
    logout: vi.fn(),
    checkAuth: vi.fn().mockResolvedValue(undefined),
    setUserFromLogin: vi.fn(),
    isAuthenticated: false,
    isAdmin: false,
    ...overrides,
  });
}

describe("SetupPage", () => {
  beforeEach(() => {
    mockAuth();
    vi.mocked(usePlexLogin).mockReturnValue({
      loading: false,
      login: vi.fn(),
    });
    vi.mocked(setupAdmin).mockReset();
    vi.mocked(setupJellyfinAdmin).mockReset();
  });

  it("validates Jellyfin server hostnames before setup", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetupPage />);

    await user.click(screen.getByRole("button", { name: /jellyfin/i }));
    await user.type(screen.getByLabelText("Server Hostname"), "bad host");
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /setup admin/i }));

    expect(
      await screen.findByText(/please enter a valid hostname/i)
    ).toBeVisible();
    expect(setupJellyfinAdmin).not.toHaveBeenCalled();
  });

  it("sets local auth state after successful Jellyfin admin setup", async () => {
    const user = userEvent.setup();
    const checkAuth = vi.fn().mockResolvedValue(undefined);
    const setUserFromLogin = vi.fn();
    mockAuth({
      checkAuth,
      setUserFromLogin,
    });
    vi.mocked(setupJellyfinAdmin).mockResolvedValue({
      user: {
        id: "admin-1",
        username: "admin",
        displayName: "Admin",
        email: "admin@example.test",
        isAdmin: true,
      },
      accessToken: "token",
    });

    renderWithProviders(<SetupPage />);

    await user.click(screen.getByRole("button", { name: /jellyfin/i }));
    await user.type(screen.getByLabelText("Server Hostname"), "jellyfin.local");
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /setup admin/i }));

    await waitFor(() => {
      expect(setUserFromLogin).toHaveBeenCalledWith({
        id: "admin-1",
        username: "admin",
        displayName: "Admin",
        email: "admin@example.test",
        isAdmin: true,
        jellyfinUsername: "admin",
      });
    });
    await waitFor(() => {
      expect(setupJellyfinAdmin).toHaveBeenCalledWith(
        "admin",
        "secret",
        "jellyfin.local",
        8096,
        false,
        ""
      );
    });
    await waitFor(() => {
      expect(checkAuth).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(localStorage.getItem("authSource")).toBe("jellyfin");
    });
  });
});
