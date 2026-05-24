import { useAuth } from "@contexts/AuthContext";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProtectedRoute } from "./ProtectedRoute";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    loading: false,
    logout: vi.fn(),
    checkAuth: vi.fn(),
    setUserFromLogin: vi.fn(),
    isAuthenticated: false,
    isAdmin: false,
    ...overrides,
  });
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderRoute(requireAdmin = false) {
  render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute requireAdmin={requireAdmin}>
              <h1>Protected content</h1>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<h1>Login page</h1>} />
        <Route path="/" element={<h1>Home page</h1>} />
      </Routes>
      <LocationDisplay />
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
  });

  it("redirects unauthenticated users to login", () => {
    mockAuth();

    renderRoute();

    expect(screen.getByRole("heading", { name: "Login page" })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("shows loading state without redirecting", () => {
    mockAuth({ loading: true });

    renderRoute();

    expect(screen.getByRole("status", { name: "Loading" })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("/protected");
  });

  it("redirects non-admin users away from admin-only routes", () => {
    mockAuth({ isAuthenticated: true, isAdmin: false });

    renderRoute(true);

    expect(screen.getByRole("heading", { name: "Home page" })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("renders protected content for admin users", () => {
    mockAuth({ isAuthenticated: true, isAdmin: true });

    renderRoute(true);

    expect(
      screen.getByRole("heading", { name: "Protected content" })
    ).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("/protected");
  });
});
