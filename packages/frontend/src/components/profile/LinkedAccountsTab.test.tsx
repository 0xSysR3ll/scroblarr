import { useAuth } from "@contexts/AuthContext";
import { usePlexLogin } from "@hooks/auth/usePlexLogin";
import {
  linkJellyfinAccount,
  linkEmbyAccount,
  unlinkPlexAccount,
  unlinkEmbyAccount,
  unlinkJellyfinAccount,
} from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError } from "@utils/toast";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LinkedAccountsTab } from "./LinkedAccountsTab";

const dialogForceOpen = vi.hoisted(() => ({ value: false }));

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@hooks/auth/usePlexLogin", () => ({
  usePlexLogin: vi.fn(),
}));

vi.mock("@services/api", () => ({
  linkPlexAccount: vi.fn(),
  linkJellyfinAccount: vi.fn(),
  linkEmbyAccount: vi.fn(),
  unlinkPlexAccount: vi.fn(),
  unlinkJellyfinAccount: vi.fn(),
  unlinkEmbyAccount: vi.fn(),
}));

vi.mock("@utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@components/ui/dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@components/ui/dialog")>();
  return {
    ...actual,
    Dialog: ({
      open,
      children,
      ...props
    }: ComponentProps<typeof actual.Dialog>) => (
      <actual.Dialog open={open || dialogForceOpen.value} {...props}>
        {children}
      </actual.Dialog>
    ),
  };
});

describe("LinkedAccountsTab", () => {
  const checkAuth = vi.fn();
  const onAccountLinked = vi.fn();

  beforeEach(() => {
    dialogForceOpen.value = false;
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
    vi.mocked(linkEmbyAccount).mockReset();
    vi.mocked(unlinkPlexAccount).mockReset();
    vi.mocked(unlinkEmbyAccount).mockReset();
    vi.mocked(unlinkJellyfinAccount).mockReset();
    vi.mocked(showError).mockReset();
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

  it("links an Emby account when embyConfigured", async () => {
    const user = userEvent.setup();
    vi.mocked(linkEmbyAccount).mockResolvedValue({
      id: "1",
      username: "alice",
      isAdmin: false,
    });

    renderWithProviders(
      <LinkedAccountsTab
        plexConfigured={false}
        jellyfinConfigured={false}
        embyConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    expect(screen.getByText("Emby")).toBeVisible();
    await user.type(screen.getByPlaceholderText("Emby username"), "alice");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(
      screen.getByRole("button", { name: "Authenticate with Emby" })
    );

    await waitFor(() => {
      expect(linkEmbyAccount).toHaveBeenCalledWith("alice", "secret");
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

  it("confirms before unlinking a Plex account when another media account remains", async () => {
    const user = userEvent.setup();
    vi.mocked(unlinkPlexAccount).mockResolvedValue({ success: true });

    renderWithProviders(
      <LinkedAccountsTab
        plexUsername="alice"
        jellyfinUsername="alice-jf"
        plexConfigured
        jellyfinConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    const unlinkButtons = screen.getAllByRole("button", { name: /unlink/i });
    await user.click(unlinkButtons[0]);
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
        jellyfinUsername="alice-jf"
        plexConfigured
        jellyfinConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    const unlinkButtons = screen.getAllByRole("button", { name: /unlink/i });
    await user.click(unlinkButtons[0]);
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

  it("shows linked Emby state without unlink when it is the only media account", () => {
    renderWithProviders(
      <LinkedAccountsTab
        jellyfinUsername="alice"
        plexConfigured={false}
        jellyfinConfigured={false}
        embyConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    expect(screen.getByText("Emby")).toBeVisible();
    expect(screen.getByText("Linked")).toBeVisible();
    expect(screen.queryByRole("button", { name: /unlink/i })).toBeNull();
  });

  it("requires Jellyfin credentials when inputs are empty", async () => {
    renderWithProviders(
      <LinkedAccountsTab
        plexConfigured={false}
        jellyfinConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    const button = screen.getByRole("button", {
      name: "Authenticate with Jellyfin",
    });
    const propsKey = Object.keys(button).find((key) =>
      key.startsWith("__reactProps$")
    );
    expect(propsKey).toBeDefined();
    (button as unknown as Record<string, { onClick?: (e: unknown) => void }>)[
      propsKey!
    ].onClick?.({
      preventDefault() {},
      stopPropagation() {},
    });

    expect(
      await screen.findByText("Jellyfin username and password are required")
    ).toBeVisible();
  });

  it("requires Emby credentials when inputs are empty", async () => {
    renderWithProviders(
      <LinkedAccountsTab
        plexConfigured={false}
        jellyfinConfigured={false}
        embyConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    const button = screen.getByRole("button", {
      name: "Authenticate with Emby",
    });
    const propsKey = Object.keys(button).find((key) =>
      key.startsWith("__reactProps$")
    );
    expect(propsKey).toBeDefined();
    (button as unknown as Record<string, { onClick?: (e: unknown) => void }>)[
      propsKey!
    ].onClick?.({
      preventDefault() {},
      stopPropagation() {},
    });

    expect(
      await screen.findByText("Emby username and password are required")
    ).toBeVisible();
  });

  it("unlinks an Emby account after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(unlinkEmbyAccount).mockResolvedValue({ success: true });

    renderWithProviders(
      <LinkedAccountsTab
        plexUsername="alice"
        jellyfinUsername="alice-emby"
        plexConfigured
        jellyfinConfigured={false}
        embyConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    const unlinkButtons = screen.getAllByRole("button", { name: /unlink/i });
    await user.click(unlinkButtons[1]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(unlinkEmbyAccount).toHaveBeenCalled();
      expect(checkAuth).toHaveBeenCalled();
      expect(onAccountLinked).toHaveBeenCalled();
    });
  });

  it("unlinks a Jellyfin account after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(unlinkJellyfinAccount).mockResolvedValue({ success: true });

    renderWithProviders(
      <LinkedAccountsTab
        plexUsername="alice"
        jellyfinUsername="alice-jf"
        plexConfigured
        jellyfinConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    const unlinkButtons = screen.getAllByRole("button", { name: /unlink/i });
    await user.click(unlinkButtons[1]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(unlinkJellyfinAccount).toHaveBeenCalled();
      expect(checkAuth).toHaveBeenCalled();
      expect(onAccountLinked).toHaveBeenCalled();
    });
  });

  it("falls back to the default Emby unlink error", async () => {
    const user = userEvent.setup();
    vi.mocked(unlinkEmbyAccount).mockRejectedValueOnce("offline");

    renderWithProviders(
      <LinkedAccountsTab
        plexUsername="alice"
        jellyfinUsername="alice-emby"
        plexConfigured
        jellyfinConfigured={false}
        embyConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    const unlinkButtons = screen.getAllByRole("button", { name: /unlink/i });
    await user.click(unlinkButtons[1]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Failed to unlink  account");
    });
  });

  it("shows the Plex admin warning when the Plex unlink modal is open without another linked media account", () => {
    dialogForceOpen.value = true;
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "1", username: "alice", isAdmin: true },
      loading: false,
      logout: vi.fn(),
      checkAuth,
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: true,
    });

    renderWithProviders(
      <LinkedAccountsTab
        plexUsername="alice"
        plexConfigured
        jellyfinConfigured={false}
        onAccountLinked={onAccountLinked}
      />
    );

    expect(
      screen.getByText(
        /As an admin, you must have at least one linked account/i
      )
    ).toBeVisible();
  });

  it("shows the Emby admin warning when the Emby unlink modal is open without Plex", () => {
    dialogForceOpen.value = true;
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "1", username: "alice", isAdmin: true },
      loading: false,
      logout: vi.fn(),
      checkAuth,
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: true,
    });

    renderWithProviders(
      <LinkedAccountsTab
        jellyfinUsername="alice-emby"
        plexConfigured={false}
        jellyfinConfigured={false}
        embyConfigured
        onAccountLinked={onAccountLinked}
      />
    );

    expect(
      screen.getByText(
        /As an admin, you must have at least one linked account/i
      )
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

  it("hides unlink when Plex is the only linked media account", () => {
    renderWithProviders(
      <LinkedAccountsTab
        plexUsername="admin"
        plexConfigured
        jellyfinConfigured={false}
        onAccountLinked={onAccountLinked}
      />
    );

    expect(screen.getByText("Linked")).toBeVisible();
    expect(screen.queryByRole("button", { name: /unlink/i })).toBeNull();
  });
});
