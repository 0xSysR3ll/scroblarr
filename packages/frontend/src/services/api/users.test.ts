import { jsonResponse } from "@test/jsonResponse";
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  createUser,
  deleteUsers,
  getServerUsers,
  getUsers,
  updateUser,
} from "./users";

describe("users api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fetches users with auth headers", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: "1" }]));

    await expect(getUsers()).resolves.toEqual([{ id: "1" }]);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/users", {
      headers: expect.objectContaining({
        "Content-Type": "application/json",
      }),
    });
  });

  it("creates users with a JSON body", async () => {
    const user = { id: "2", plexUsername: "alice" };
    fetchMock.mockResolvedValueOnce(jsonResponse(user));

    await expect(createUser({ plexUsername: "alice" })).resolves.toEqual(user);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/users", {
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ plexUsername: "alice" }),
    });
  });

  it("encodes Plex server URLs when fetching import candidates", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await getServerUsers("https://plex.example.test:32400/library");

    const actualUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://app");

    expect(actualUrl.pathname).toBe("/api/v1/users/plex-users");
    expect(actualUrl.searchParams.get("serverUrl")).toBe(
      "https://plex.example.test:32400/library"
    );
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      headers: expect.objectContaining({
        "Content-Type": "application/json",
      }),
    });
  });

  it("bulk deletes users by request body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: 2 }));

    await expect(deleteUsers(["1", "2"])).resolves.toEqual({ deleted: 2 });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/users", {
      method: "DELETE",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ ids: ["1", "2"] }),
    });
  });

  it("throws on failed updates", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(updateUser("1", { enabled: false })).rejects.toThrow(
      "Failed to update user"
    );
  });
});
