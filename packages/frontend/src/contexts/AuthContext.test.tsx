import {
  getCurrentUser,
  invalidateBingersCache,
  invalidateSimklCache,
  invalidateTraktCache,
} from "@services/api";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth, type AuthUser } from "./AuthContext";

vi.mock("@services/api", () => ({
  getCurrentUser: vi.fn(),
  invalidateBingersCache: vi.fn(),
  invalidateSimklCache: vi.fn(),
  invalidateTraktCache: vi.fn(),
}));

const authUser: AuthUser = {
  id: "user-1",
  username: "alice",
  displayName: "Alice",
  isAdmin: true,
};

function AuthConsumer() {
  const auth = useAuth();

  return (
    <div>
      <div data-testid="loading">{auth.loading ? "loading" : "ready"}</div>
      <div data-testid="user">{auth.user?.username ?? "anonymous"}</div>
      <div data-testid="authenticated">
        {auth.isAuthenticated ? "authenticated" : "guest"}
      </div>
      <button type="button" onClick={auth.logout}>
        Logout
      </button>
    </div>
  );
}

function renderAuthProvider() {
  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    vi.mocked(getCurrentUser).mockReset();
  });

  it("loads the current user on mount", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(authUser);

    renderAuthProvider();

    expect(await screen.findByTestId("user")).toHaveTextContent("alice");
    expect(screen.getByTestId("loading")).toHaveTextContent("ready");
    expect(screen.getByTestId("authenticated")).toHaveTextContent(
      "authenticated"
    );
  });

  it("treats failed current-user checks as a guest session", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(
      Object.assign(new Error("Failed to get current user: 401"), {
        status: 401,
      })
    );

    renderAuthProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("ready");
    });
    expect(screen.getByTestId("user")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("authenticated")).toHaveTextContent("guest");
  });

  it("logs out through the backend and clears local auth state", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getCurrentUser).mockResolvedValue(authUser);
    localStorage.setItem("authSource", "plex");

    renderAuthProvider();
    expect(await screen.findByTestId("user")).toHaveTextContent("alice");

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("anonymous");
    });
    expect(localStorage.getItem("authSource")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/logout", {
      method: "POST",
      credentials: "include",
    });
    expect(invalidateSimklCache).toHaveBeenCalled();
    expect(invalidateTraktCache).toHaveBeenCalled();
    expect(invalidateBingersCache).toHaveBeenCalled();
  });
});
