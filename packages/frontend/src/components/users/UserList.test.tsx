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
});
