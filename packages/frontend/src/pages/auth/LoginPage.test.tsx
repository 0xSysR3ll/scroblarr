import { useAuth } from "@contexts/AuthContext";
import { useJellyfinLogin } from "@hooks/auth/useJellyfinLogin";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import { getAuthProviders } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@hooks/auth/usePlexLogin", () => ({
  usePlexLogin: vi.fn(),
}));

vi.mock("@hooks/auth/useJellyfinLogin", () => ({
  useJellyfinLogin: vi.fn(),
}));

vi.mock("@services/api", () => ({
  getAuthProviders: vi.fn(),
  loginWithPlex: vi.fn(),
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

describe("LoginPage", () => {
  const plexLogin = vi.fn();

  beforeEach(() => {
    mockAuth();
    plexLogin.mockReset();
    vi.mocked(usePlexLogin).mockReturnValue({
      loading: false,
      login: plexLogin,
    });
    vi.mocked(useJellyfinLogin).mockReturnValue({
      loading: false,
      login: vi.fn(),
    });
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: true,
      plexConfigured: true,
      jellyfinConfigured: true,
    });
  });

  it("renders the Scroblarr brand and Login card", async () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Scroblarr" })).toBeVisible();
    expect(screen.getByText("Login")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /Auto \(system\)|Light mode|Dark mode/i,
      })
    ).toBeVisible();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Plex OAuth/i })).toBeVisible();
    });
  });

  it("starts Plex OAuth when the button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    const plexButton = await screen.findByRole("button", {
      name: /Plex OAuth/i,
    });
    await user.click(plexButton);

    expect(plexLogin).toHaveBeenCalled();
  });

  it("toggles jellyfin password visibility", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    const password = await screen.findByLabelText("Jellyfin password");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /Show password/i }));
    expect(password).toHaveAttribute("type", "text");
  });
});
