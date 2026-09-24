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
      expect(checkAuth).toHaveBeenCalled();
      expect(onAccountLinked).toHaveBeenCalled();
    });
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
      expect(checkAuth).toHaveBeenCalled();
      expect(onAccountLinked).toHaveBeenCalled();
    });
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

  it("shows a Plex link error from OAuth failure", async () => {
    const user = userEvent.setup();
    vi.mocked(usePlexLogin).mockImplementation((opts) => ({
      loading: false,
      login: () => {
        opts.onError?.("plex oauth failed");
      },
    }));

    renderWithProviders(
      <LinkedAccountsTab
        plexConfigured
        jellyfinConfigured={false}
        onAccountLinked={onAccountLinked}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Authenticate with Plex" })
    );

    expect(await screen.findByText("plex oauth failed")).toBeVisible();
  });

  it("shows linked Jellyfin state and unlink control", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <LinkedAccountsTab
        jellyfinUsername="alice"
        plexConfigured={false}
        jellyfinConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    expect(screen.getByText("Linked")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /unlink/i }));
    expect(
      screen.getByRole("heading", { name: /Unlink Jellyfin Account/i })
    ).toBeVisible();
  });

  it("shows a warning when no media servers are configured", () => {
    renderWithProviders(
      <LinkedAccountsTab
        plexConfigured={false}
        jellyfinConfigured={false}
        onAccountLinked={onAccountLinked}
      />
    );

    expect(screen.getByText(/No media servers are configured/i)).toBeVisible();
  });

  it("warns admins when unlinking their only Plex account", async () => {
    const user = userEvent.setup();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "1", username: "admin", isAdmin: true },
      loading: false,
      logout: vi.fn(),
      checkAuth,
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: true,
    });

    renderWithProviders(
      <LinkedAccountsTab
        plexUsername="admin"
        plexConfigured
        jellyfinConfigured={false}
        onAccountLinked={onAccountLinked}
      />
    );

    await user.click(screen.getByRole("button", { name: /unlink/i }));
    expect(
      screen.getByText(
        /As an admin, you must have at least one linked account/i
      )
    ).toBeVisible();
  });

  it("warns admins when unlinking their only Jellyfin account", async () => {
    const user = userEvent.setup();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "1", username: "admin", isAdmin: true },
      loading: false,
      logout: vi.fn(),
      checkAuth,
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: true,
    });

    renderWithProviders(
      <LinkedAccountsTab
        jellyfinUsername="admin"
        plexConfigured={false}
        jellyfinConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    await user.click(screen.getByRole("button", { name: /unlink/i }));
    expect(
      screen.getByText(
        /As an admin, you must have at least one linked account/i
      )
    ).toBeVisible();
  });
});
