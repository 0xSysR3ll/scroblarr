import { useAuth } from "@contexts/AuthContext";
import type { User } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showSuccess } from "@utils/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserList } from "./UserList";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const users: User[] = [
  {
    id: "current-user",
    plexUsername: "alice",
    displayName: "Alice",
    email: "alice@example.test",
    isAdmin: false,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "regular-user",
    plexUsername: "bob",
    displayName: "Bob",
    email: "bob@example.test",
    isAdmin: false,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "admin-user",
    plexUsername: "carol",
    displayName: "Carol",
    email: "carol@example.test",
    isAdmin: true,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function getUserTableRow(name: string) {
  const table = screen.getByRole("table");
  const row = within(table).getByText(name).closest("tr");

  expect(row).not.toBeNull();

  return row as HTMLElement;
}

describe("UserList", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "current-user", username: "alice", isAdmin: true },
      loading: false,
      logout: vi.fn(),
      checkAuth: vi.fn(),
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: true,
    });
  });

  it("shows an empty state when there are no users", () => {
    renderWithProviders(<UserList users={[]} />);

    expect(screen.getByText("No users found")).toBeInTheDocument();
  });

  it("selects only non-current non-admin users for bulk actions", async () => {
    const user = userEvent.setup();
    const onSelectedIdsChange = vi.fn();

    renderWithProviders(
      <UserList
        users={users}
        onBulkDelete={vi.fn()}
        selectedIds={new Set()}
        onSelectedIdsChange={onSelectedIdsChange}
      />
    );

    await user.click(
      within(screen.getByRole("table")).getByRole("checkbox", {
        name: "Select All",
      })
    );

    const selectedIds = onSelectedIdsChange.mock.calls[0][0] as Set<string>;
    expect([...selectedIds]).toEqual(["regular-user"]);
  });

  it("confirms before deleting a user", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<UserList users={users} onDelete={onDelete} />);

    const bobRow = getUserTableRow("Bob");

    await user.click(
      within(bobRow).getByRole("button", { name: "Delete user" })
    );
    await user.click(
      within(bobRow).getByRole("button", { name: "Confirm delete" })
    );

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("regular-user");
    });
    expect(showSuccess).toHaveBeenCalledWith("User deleted successfully");
  });

  it("toggles a user's enabled state", async () => {
    const user = userEvent.setup();
    const onToggleEnabled = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(
      <UserList users={users} onToggleEnabled={onToggleEnabled} />
    );

    const bobRow = getUserTableRow("Bob");

    await user.click(within(bobRow).getByRole("button", { name: "Enabled" }));

    await waitFor(() => {
      expect(onToggleEnabled).toHaveBeenCalledWith("regular-user", false);
    });
  });

  it("shows a Simkl badge for linked users", () => {
    renderWithProviders(
      <UserList
        users={[
          {
            ...users[1],
            simklUsername: "bob-simkl",
          },
        ]}
      />
    );

    const bobRow = getUserTableRow("Bob");
    expect(within(bobRow).getByText("Simkl")).toBeInTheDocument();
  });

  it("shows a Simkl badge in the mobile card layout", () => {
    renderWithProviders(
      <UserList
        users={[
          {
            ...users[1],
            simklUsername: "bob-simkl",
          },
        ]}
      />
    );

    const mobileView = document.querySelector(".md\\:hidden");
    expect(mobileView).not.toBeNull();

    const bobMobileCard = within(mobileView as HTMLElement)
      .getByText("Bob")
      .closest(".surface-panel");
    expect(bobMobileCard).not.toBeNull();
    expect(
      within(bobMobileCard as HTMLElement).getByText("Simkl")
    ).toBeInTheDocument();
  });

  it("falls back to plex username or User for avatar labels", () => {
    renderWithProviders(
      <UserList
        users={[
          {
            ...users[1],
            id: "plex-only",
            displayName: undefined,
            plexUsername: "plex-bob",
          },
          {
            ...users[1],
            id: "nameless",
            displayName: undefined,
            plexUsername: "",
          },
        ]}
      />
    );

    expect(
      screen.getAllByRole("img", { name: "plex-bob" }).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("img", { name: "User" }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it("shows jellyfin and trakt badges and selection styles", async () => {
    const user = userEvent.setup();
    const onSelectedIdsChange = vi.fn();

    renderWithProviders(
      <UserList
        users={[
          {
            ...users[1],
            jellyfinUsername: "bob-jf",
            traktUsername: "bob-trakt",
          },
        ]}
        onBulkDelete={vi.fn()}
        selectedIds={new Set(["regular-user"])}
        onSelectedIdsChange={onSelectedIdsChange}
        onToggleEnabled={vi.fn()}
      />
    );

    const bobRow = getUserTableRow("Bob");
    expect(within(bobRow).getByText("Jellyfin")).toBeVisible();
    expect(within(bobRow).getByText("Trakt")).toBeVisible();
    expect(bobRow).toHaveClass("bg-warning-50");
    expect(
      within(bobRow).getByRole("button", { name: "Enabled" })
    ).toBeVisible();

    const mobileView = document.querySelector(".md\\:hidden");
    expect(mobileView).not.toBeNull();
    const bobMobileCard = within(mobileView as HTMLElement)
      .getByText("Bob")
      .closest(".surface-panel");
    expect(bobMobileCard).not.toBeNull();
    expect(bobMobileCard).toHaveClass("border-warning-500");
    expect(
      within(bobMobileCard as HTMLElement).getByText("Jellyfin")
    ).toBeVisible();
    expect(
      within(bobMobileCard as HTMLElement).getByText("Trakt")
    ).toBeVisible();

    await user.click(
      within(bobRow).getByRole("checkbox", { name: "Select Bob" })
    );
    expect(onSelectedIdsChange).toHaveBeenCalled();
  });

  it("shows a non-toggleable enabled chip for the current user", () => {
    renderWithProviders(<UserList users={users} onToggleEnabled={vi.fn()} />);

    const aliceRow = getUserTableRow("Alice");
    expect(within(aliceRow).getByText("Enabled")).toBeVisible();
    expect(
      within(aliceRow).queryByRole("button", { name: "Enabled" })
    ).toBeNull();
  });

  it("shows disabled chip styles for inactive users", () => {
    const disabledUsers: User[] = [
      {
        ...users[0],
        id: "current-disabled",
        displayName: "Current Disabled",
        enabled: false,
      },
      {
        ...users[1],
        id: "other-disabled",
        displayName: "Other Disabled",
        enabled: false,
      },
    ];

    vi.mocked(useAuth).mockReturnValue({
      user: { id: "current-disabled", username: "alice", isAdmin: true },
      loading: false,
      logout: vi.fn(),
      checkAuth: vi.fn(),
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: true,
    });

    renderWithProviders(
      <UserList users={disabledUsers} onToggleEnabled={vi.fn()} />
    );

    const currentRow = getUserTableRow("Current Disabled");
    const otherRow = getUserTableRow("Other Disabled");
    expect(within(currentRow).getByText("Disabled")).toBeVisible();
    expect(
      within(otherRow).getByRole("button", { name: "Disabled" })
    ).toBeVisible();
  });
});
