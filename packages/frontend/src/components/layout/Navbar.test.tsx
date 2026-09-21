import { useAuth } from "@contexts/AuthContext";
import { renderWithProviders } from "@test/render";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Navbar } from "./Navbar";

vi.mock("@contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "user-1",
      username: "alice",
      displayName: "Alice Example",
      isAdmin: false,
    },
    loading: false,
    logout: vi.fn(),
    checkAuth: vi.fn(),
    setUserFromLogin: vi.fn(),
    isAuthenticated: true,
    isAdmin: false,
    ...overrides,
  });
}

describe("Navbar", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
  });

  it("renders nothing when the user is not authenticated", () => {
    mockAuth({ isAuthenticated: false, user: null });

    const { container } = renderWithProviders(<Navbar />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders local avatars from the display name", () => {
    mockAuth();

    renderWithProviders(<Navbar />);

    const avatars = screen.getAllByRole("img", { name: "Alice Example" });
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    expect(avatars[0]).toHaveTextContent("AE");
  });

  it("falls back to username when display name is missing", () => {
    mockAuth({
      user: {
        id: "user-1",
        username: "bob",
        isAdmin: false,
      },
    });

    renderWithProviders(<Navbar />);

    expect(screen.getAllByRole("img", { name: "bob" })[0]).toHaveTextContent(
      "BO"
    );
  });

  it("falls back to the generic user label when identity is missing", () => {
    mockAuth({
      user: {
        id: "user-1",
        username: "",
        isAdmin: false,
      },
    });

    renderWithProviders(<Navbar />);

    expect(screen.getAllByRole("img", { name: "User" })[0]).toHaveTextContent(
      "US"
    );
  });

  it("shows the thumb image when available and opens the menu avatar", async () => {
    const user = userEvent.setup();
    mockAuth({
      user: {
        id: "user-1",
        username: "alice",
        displayName: "Alice Example",
        thumb: "https://cdn.example/alice.jpg",
        isAdmin: true,
      },
    });

    renderWithProviders(<Navbar />);

    const triggerAvatars = screen.getAllByRole("img", {
      name: "Alice Example",
    });
    expect(triggerAvatars[0]).toBeInstanceOf(HTMLImageElement);
    expect(triggerAvatars[0]).toHaveAttribute(
      "src",
      "https://cdn.example/alice.jpg"
    );

    await user.click(triggerAvatars[0].closest("button")!);

    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("img", { name: "Alice Example" })
    ).toHaveAttribute("src", "https://cdn.example/alice.jpg");
  });
});
