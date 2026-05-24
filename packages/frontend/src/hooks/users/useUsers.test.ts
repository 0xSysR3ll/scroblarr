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

function createUsersFixture(): User[] {
  return [
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
}

async function renderUseUsersWithInitialUsers() {
  const initialUsers = createUsersFixture();
  vi.mocked(getUsers).mockResolvedValue(initialUsers);
  const hook = renderHook(() => useUsers());

  await waitFor(() => {
    expect(hook.result.current.loading).toBe(false);
  });

  return { ...hook, initialUsers };
}

describe("useUsers", () => {
  beforeEach(() => {
    vi.mocked(getUsers).mockReset();
    vi.mocked(createUser).mockReset();
    vi.mocked(updateUser).mockReset();
    vi.mocked(deleteUser).mockReset();
    vi.mocked(deleteUsers).mockReset();
  });

  it("loads users on mount", async () => {
    const initialUsers = createUsersFixture();
    vi.mocked(getUsers).mockResolvedValue(initialUsers);

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(getUsers).toHaveBeenCalledTimes(1);
    expect(result.current.users).toEqual(initialUsers);
    expect(result.current.error).toBeNull();
  });

  it("adds, updates, and removes users in local state", async () => {
    const initialUsers = createUsersFixture();
    vi.mocked(getUsers).mockResolvedValue(initialUsers);
    const newUser: User = {
      id: "3",
      plexUsername: "carol",
      isAdmin: false,
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.mocked(createUser).mockResolvedValue(newUser);
    vi.mocked(updateUser).mockResolvedValue({
      ...initialUsers[1],
      enabled: false,
    });
    vi.mocked(deleteUser).mockResolvedValue(undefined);
    vi.mocked(deleteUsers).mockResolvedValue({ deleted: 1 });

    const { result } = renderHook(() => useUsers());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.addUser({ plexUsername: "carol" });
    });
    expect(createUser).toHaveBeenCalledWith({ plexUsername: "carol" });
    expect(result.current.users.map((user) => user.id)).toEqual([
      "1",
      "2",
      "3",
    ]);

    await act(async () => {
      await result.current.modifyUser("2", { enabled: false });
    });
    expect(updateUser).toHaveBeenCalledWith("2", { enabled: false });
    expect(result.current.users.find((user) => user.id === "2")?.enabled).toBe(
      false
    );

    await act(async () => {
      await result.current.removeUser("1");
    });
    expect(deleteUser).toHaveBeenCalledWith("1");
    expect(result.current.users.map((user) => user.id)).toEqual(["2", "3"]);

    await act(async () => {
      await result.current.removeUsers(["3"]);
    });
    expect(deleteUsers).toHaveBeenCalledWith(["3"]);
    expect(result.current.users.map((user) => user.id)).toEqual(["2"]);
  });

  it("preserves users and exposes create errors", async () => {
    const error = new Error("create failed");
    vi.mocked(createUser).mockRejectedValue(error);
    const { result, initialUsers } = await renderUseUsersWithInitialUsers();

    await act(async () => {
      await expect(
        result.current.addUser({ plexUsername: "carol" })
      ).rejects.toThrow("create failed");
    });

    expect(createUser).toHaveBeenCalledWith({ plexUsername: "carol" });
    expect(result.current.users).toEqual(initialUsers);
    expect(result.current.error).toBe(error);
  });

  it("preserves users and exposes update errors", async () => {
    const error = new Error("update failed");
    vi.mocked(updateUser).mockRejectedValue(error);
    const { result, initialUsers } = await renderUseUsersWithInitialUsers();

    await act(async () => {
      await expect(
        result.current.modifyUser("2", { enabled: false })
      ).rejects.toThrow("update failed");
    });

    expect(updateUser).toHaveBeenCalledWith("2", { enabled: false });
    expect(result.current.users).toEqual(initialUsers);
    expect(result.current.error).toBe(error);
  });

  it("preserves users and exposes delete errors", async () => {
    const error = new Error("delete failed");
    vi.mocked(deleteUser).mockRejectedValue(error);
    const { result, initialUsers } = await renderUseUsersWithInitialUsers();

    await act(async () => {
      await expect(result.current.removeUser("1")).rejects.toThrow(
        "delete failed"
      );
    });

    expect(deleteUser).toHaveBeenCalledWith("1");
    expect(result.current.users).toEqual(initialUsers);
    expect(result.current.error).toBe(error);
  });

  it("preserves users and exposes bulk-delete errors", async () => {
    const error = new Error("bulk delete failed");
    vi.mocked(deleteUsers).mockRejectedValue(error);
    const { result, initialUsers } = await renderUseUsersWithInitialUsers();

    await act(async () => {
      await expect(result.current.removeUsers(["3"])).rejects.toThrow(
        "bulk delete failed"
      );
    });

    expect(deleteUsers).toHaveBeenCalledWith(["3"]);
    expect(result.current.users).toEqual(initialUsers);
    expect(result.current.error).toBe(error);
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
