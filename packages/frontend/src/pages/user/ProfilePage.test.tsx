import { useAuth } from "@contexts/AuthContext";
import { getAuthProviders } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfilePage } from "./ProfilePage";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@services/api", () => ({
  getAuthProviders: vi.fn(),
}));

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: "user-1",
        username: "alice",
        plexUsername: "alice",
        isAdmin: false,
      },
      loading: false,
      logout: vi.fn(),
      checkAuth: vi.fn(),
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: false,
    });
    vi.mocked(getAuthProviders).mockResolvedValue({
      hasAdmin: true,
      jellyfinConfigured: true,
      plexConfigured: true,
    });
  });

  it("renders the integrations tab route", async () => {
    renderWithProviders(<ProfilePage />, { route: "/profile/integrations" });

    // IntegrationsTab renders collapsible sections headed by destination names.
    expect(
      await screen.findByRole("heading", { name: /Trakt/i })
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: /Simkl/i })).toBeVisible();
  });
});
