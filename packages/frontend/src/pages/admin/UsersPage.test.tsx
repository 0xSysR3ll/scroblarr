import { useAuth } from "@contexts/AuthContext";
import { useUsers } from "@hooks/users/useUsers";
import type { User } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsersPage } from "./UsersPage";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@hooks/users/useUsers", () => ({
  useUsers: vi.fn(),
}));

vi.mock("@components/users/UserImport", () => ({
  UserImport: () => null,
}));

vi.mock("@utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const users: User[] = [
  {
    id: "admin-1",
    plexUsername: "admin",
    displayName: "Admin",
    email: "admin@example.test",
    isAdmin: true,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "user-1",
    plexUsername: "bob",
    displayName: "Bob",
    email: "bob@example.test",
    isAdmin: false,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function mockUseUsers(overrides: Partial<ReturnType<typeof useUsers>> = {}) {
  vi.mocked(useUsers).mockReturnValue({
    users,
    loading: false,
    error: null,
    removeUser: vi.fn(),
    removeUsers: vi.fn(),
    modifyUser: vi.fn(),
    loadUsers: vi.fn(),
    addUser: vi.fn(),
    ...overrides,
  });
}

describe("UsersPage", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "admin-1", username: "admin", isAdmin: true },
      loading: false,
      logout: vi.fn(),
      checkAuth: vi.fn(),
      setUserFromLogin: vi.fn(),
      isAuthenticated: true,
      isAdmin: true,
    });
    mockUseUsers();
  });

  it("shows a loading state", () => {
    mockUseUsers({ loading: true, users: [] });

    renderWithProviders(<UsersPage />);

    expect(screen.getByText("Loading...")).toBeVisible();
  });

  it("shows an error state", () => {
    mockUseUsers({
      loading: false,
      error: new Error("boom"),
      users: [],
    });

    renderWithProviders(<UsersPage />);

    expect(screen.getByText(/Error: boom/)).toBeVisible();
  });

  it("shows Import Users for admins", () => {
    renderWithProviders(<UsersPage />);

    expect(screen.getByRole("button", { name: /Import Users/i })).toBeVisible();
  });

  it("shows Delete Selected after selecting users", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    const table = screen.getByRole("table");
    await user.click(
      within(table).getByRole("checkbox", { name: "Select Bob" })
    );

    expect(
      screen.getByRole("button", { name: /Delete Selected/i })
    ).toBeVisible();
  });
});
