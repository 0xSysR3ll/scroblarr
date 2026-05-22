import {
  createUser,
  deleteUser,
  deleteUsers,
  getUsers,
  updateUser,
  type User,
} from "@services/api";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUsers } from "./useUsers";

vi.mock("@services/api", () => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  deleteUsers: vi.fn(),
  getUsers: vi.fn(),
  updateUser: vi.fn(),
}));

const users: User[] = [
  {
    id: "1",
    plexUsername: "alice",
    isAdmin: true,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    plexUsername: "bob",
    isAdmin: false,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("useUsers", () => {
  beforeEach(() => {
    vi.mocked(getUsers).mockReset();
    vi.mocked(createUser).mockReset();
    vi.mocked(updateUser).mockReset();
    vi.mocked(deleteUser).mockReset();
    vi.mocked(deleteUsers).mockReset();
  });

  it("loads users on mount", async () => {
    vi.mocked(getUsers).mockResolvedValue(users);

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.users).toEqual(users);
    expect(result.current.error).toBeNull();
  });

  it("adds, updates, and removes users in local state", async () => {
    vi.mocked(getUsers).mockResolvedValue(users);
    const newUser: User = {
      id: "3",
      plexUsername: "carol",
      isAdmin: false,
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.mocked(createUser).mockResolvedValue(newUser);
    vi.mocked(updateUser).mockResolvedValue({ ...users[1], enabled: false });
    vi.mocked(deleteUser).mockResolvedValue(undefined);
    vi.mocked(deleteUsers).mockResolvedValue({ deleted: 1 });

    const { result } = renderHook(() => useUsers());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.addUser({ plexUsername: "carol" });
    });
    expect(result.current.users.map((user) => user.id)).toEqual([
      "1",
      "2",
      "3",
    ]);

    await act(async () => {
      await result.current.modifyUser("2", { enabled: false });
    });
    expect(result.current.users.find((user) => user.id === "2")?.enabled).toBe(
      false
    );

    await act(async () => {
      await result.current.removeUser("1");
    });
    expect(result.current.users.map((user) => user.id)).toEqual(["2", "3"]);

    await act(async () => {
      await result.current.removeUsers(["3"]);
    });
    expect(result.current.users.map((user) => user.id)).toEqual(["2"]);
  });

  it("exposes load errors", async () => {
    vi.mocked(getUsers).mockRejectedValue(new Error("Network failed"));

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toEqual(new Error("Network failed"));
  });
});
