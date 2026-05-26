import {
  getJellyfinUsers,
  getServerUsers,
  getSettings,
  importJellyfinUsers,
  importUsers,
  type User,
} from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@utils/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserImport } from "./UserImport";

vi.mock("@services/api", () => ({
  getJellyfinUsers: vi.fn(),
  getServerUsers: vi.fn(),
  getSettings: vi.fn(),
  importJellyfinUsers: vi.fn(),
  importUsers: vi.fn(),
}));

vi.mock("@utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const existingUsers: User[] = [
  {
    id: "1",
    plexUsername: "already-plex",
    jellyfinUsername: "already-jellyfin",
    displayName: "Already Imported",
    isAdmin: false,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function renderUserImport(
  props: Partial<Parameters<typeof UserImport>[0]> = {}
) {
  return renderWithProviders(
    <UserImport
      isOpen
      onClose={vi.fn()}
      existingUsers={existingUsers}
      {...props}
    />
  );
}

describe("UserImport", () => {
  beforeEach(() => {
    vi.mocked(getSettings).mockReset();
    vi.mocked(getServerUsers).mockReset();
    vi.mocked(importUsers).mockReset();
    vi.mocked(getJellyfinUsers).mockReset();
    vi.mocked(importJellyfinUsers).mockReset();
  });

  it("shows a configuration warning when no import services are configured", async () => {
    vi.mocked(getSettings).mockResolvedValue({});

    renderUserImport();

    expect(
      await screen.findByText(
        "No server configured. Please configure Plex or Jellyfin in Settings."
      )
    ).toBeInTheDocument();
  });

  it("imports selected Plex users and filters users that already exist", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUsersImported = vi.fn();
    vi.mocked(getSettings).mockResolvedValue({
      plexServerUrl: "https://plex.example.test",
    });
    vi.mocked(getServerUsers).mockResolvedValue([
      {
        username: "already-plex",
        displayName: "Already Imported",
      },
      {
        username: "new-plex",
        displayName: "New Plex User",
        email: "new@example.test",
      },
    ]);
    vi.mocked(importUsers).mockResolvedValue({ imported: 1, users: [] });

    renderUserImport({ onClose, onUsersImported });

    expect(await screen.findByText("New Plex User")).toBeInTheDocument();
    expect(screen.queryByText("Already Imported")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select All" }));
    await user.click(screen.getByRole("button", { name: "Import 1 User" }));

    await waitFor(() => {
      expect(importUsers).toHaveBeenCalledWith("https://plex.example.test", [
        "new-plex",
      ]);
    });
    expect(showSuccess).toHaveBeenCalledWith("Users imported successfully");
    expect(onClose).toHaveBeenCalled();
    expect(onUsersImported).toHaveBeenCalled();
  });

  it("imports selected Jellyfin users from the Jellyfin tab", async () => {
    const user = userEvent.setup();
    const onUsersImported = vi.fn();
    vi.mocked(getSettings).mockResolvedValue({
      plexServerUrl: "https://plex.example.test",
      jellyfinHost: "jellyfin.local",
    });
    vi.mocked(getServerUsers).mockResolvedValue([]);
    vi.mocked(getJellyfinUsers).mockResolvedValue([
      {
        id: "jf-1",
        username: "new-jellyfin",
        displayName: "New Jellyfin User",
        isImported: false,
      },
    ]);
    vi.mocked(importJellyfinUsers).mockResolvedValue({
      imported: 1,
      users: [],
    });

    renderUserImport({ onUsersImported });

    await user.click(await screen.findByRole("button", { name: "Jellyfin" }));
    expect(await screen.findByText("New Jellyfin User")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select All" }));
    await user.click(screen.getByRole("button", { name: "Import 1 User" }));

    await waitFor(() => {
      expect(importJellyfinUsers).toHaveBeenCalledWith(["new-jellyfin"]);
    });
    expect(showSuccess).toHaveBeenCalledWith("Users imported successfully");
    expect(onUsersImported).toHaveBeenCalled();
  });

  it("shows import errors without closing the dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(getSettings).mockResolvedValue({
      plexServerUrl: "https://plex.example.test",
    });
    vi.mocked(getServerUsers).mockResolvedValue([
      {
        username: "new-plex",
        displayName: "New Plex User",
      },
    ]);
    vi.mocked(importUsers).mockRejectedValue(new Error("Import failed"));

    renderUserImport({ onClose });

    expect(await screen.findByText("New Plex User")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select All" }));
    await user.click(screen.getByRole("button", { name: "Import 1 User" }));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Import failed");
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
