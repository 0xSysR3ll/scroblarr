import { useAuth } from "@contexts/AuthContext";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import { linkJellyfinAccount, unlinkPlexAccount } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError } from "@utils/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LinkedAccountsTab } from "./LinkedAccountsTab";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@hooks/auth/usePlexLogin", () => ({
  usePlexLogin: vi.fn(),
}));

vi.mock("@services/api", () => ({
  linkPlexAccount: vi.fn(),
  linkJellyfinAccount: vi.fn(),
  unlinkPlexAccount: vi.fn(),
  unlinkJellyfinAccount: vi.fn(),
}));

vi.mock("@utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

describe("LinkedAccountsTab", () => {
  const checkAuth = vi.fn();
  const onAccountLinked = vi.fn();

  beforeEach(() => {
    checkAuth.mockReset().mockResolvedValue(undefined);
    onAccountLinked.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "1", username: "alice", isAdmin: false },
      loading: false,
      logout: vi.fn(),
      checkAuth,
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: false,
    });
    vi.mocked(usePlexLogin).mockReturnValue({
      loading: false,
      login: vi.fn(),
    });
    vi.mocked(linkJellyfinAccount).mockReset();
    vi.mocked(unlinkPlexAccount).mockReset();
  });

  it("links a Jellyfin account with entered credentials", async () => {
    const user = userEvent.setup();
    vi.mocked(linkJellyfinAccount).mockResolvedValue({
      id: "1",
      username: "alice",
      isAdmin: false,
    });

    renderWithProviders(
      <LinkedAccountsTab
        plexConfigured={false}
        jellyfinConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    await user.type(screen.getByPlaceholderText("Jellyfin username"), "alice");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(
      screen.getByRole("button", { name: "Authenticate with Jellyfin" })
    );

    await waitFor(() => {
      expect(linkJellyfinAccount).toHaveBeenCalledWith("alice", "secret");
    });
    expect(checkAuth).toHaveBeenCalled();
    expect(onAccountLinked).toHaveBeenCalled();
  });

  it("shows an error when Jellyfin linking fails", async () => {
    const user = userEvent.setup();
    vi.mocked(linkJellyfinAccount).mockRejectedValue(new Error("invalid"));

    renderWithProviders(
      <LinkedAccountsTab
        plexConfigured={false}
        jellyfinConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    await user.type(screen.getByPlaceholderText("Jellyfin username"), "alice");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(
      screen.getByRole("button", { name: "Authenticate with Jellyfin" })
    );

    expect(await screen.findByText("invalid")).toBeVisible();
    expect(checkAuth).not.toHaveBeenCalled();
    expect(onAccountLinked).not.toHaveBeenCalled();
  });

  it("confirms before unlinking a Plex account", async () => {
    const user = userEvent.setup();
    vi.mocked(unlinkPlexAccount).mockResolvedValue({ success: true });

    renderWithProviders(
      <LinkedAccountsTab
        plexUsername="alice"
        plexConfigured
        jellyfinConfigured={false}
        onAccountLinked={onAccountLinked}
      />
    );

    await user.click(screen.getByRole("button", { name: /unlink/i }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(unlinkPlexAccount).toHaveBeenCalled();
    });
    expect(checkAuth).toHaveBeenCalled();
    expect(onAccountLinked).toHaveBeenCalled();
  });

  it("shows an error toast when Plex unlinking fails", async () => {
    const user = userEvent.setup();
    vi.mocked(unlinkPlexAccount).mockRejectedValue(new Error("invalid"));

    renderWithProviders(
      <LinkedAccountsTab
        plexUsername="alice"
        plexConfigured
        jellyfinConfigured={false}
        onAccountLinked={onAccountLinked}
      />
    );

    await user.click(screen.getByRole("button", { name: /unlink/i }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("invalid");
    });
    expect(checkAuth).not.toHaveBeenCalled();
    expect(onAccountLinked).not.toHaveBeenCalled();
  });
});
