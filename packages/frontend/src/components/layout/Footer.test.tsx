import { useAuth } from "@contexts/AuthContext";
import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Footer } from "./Footer";

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

describe("Footer", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
  });

  it("renders nothing when the user is not authenticated", () => {
    mockAuth({ isAuthenticated: false });

    const { container } = renderWithProviders(<Footer />);

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("link", { name: /documentation/i })
    ).not.toBeInTheDocument();
  });

  it("shows Documentation and GitHub links when authenticated", () => {
    mockAuth({
      isAuthenticated: true,
      user: { id: "1", username: "alice", isAdmin: false },
    });

    renderWithProviders(<Footer />);

    expect(screen.getByRole("link", { name: /documentation/i })).toBeVisible();
    expect(
      screen.getByRole("link", { name: /github repository/i })
    ).toBeVisible();
  });
});
