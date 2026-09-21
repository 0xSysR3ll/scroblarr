import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UserAvatar } from "./UserAvatar";

describe("UserAvatar", () => {
  it("renders the image when src is provided", () => {
    render(<UserAvatar name="Jane Doe" src="https://cdn.example/thumb.jpg" />);

    const image = screen.getByRole("img", { name: "Jane Doe" });
    expect(image).toBeInstanceOf(HTMLImageElement);
    expect(image).toHaveAttribute("src", "https://cdn.example/thumb.jpg");
  });

  it("renders local initials when src is missing", () => {
    render(<UserAvatar name="Jane Doe" />);

    expect(screen.getByRole("img", { name: "Jane Doe" })).toHaveTextContent(
      "JD"
    );
    expect(screen.queryByRole("img", { name: "Jane Doe" })?.tagName).toBe(
      "DIV"
    );
  });

  it("uses two letters from a single-word name", () => {
    render(<UserAvatar name="Alice" />);

    expect(screen.getByRole("img", { name: "Alice" })).toHaveTextContent("AL");
  });

  it("falls back to initials when the image fails to load", () => {
    render(
      <UserAvatar name="Bob Smith" src="https://cdn.example/broken.jpg" />
    );

    fireEvent.error(screen.getByRole("img", { name: "Bob Smith" }));

    expect(screen.getByRole("img", { name: "Bob Smith" })).toHaveTextContent(
      "BS"
    );
  });

  it("retries a new src after a previous image failure", () => {
    const { rerender } = render(
      <UserAvatar name="User" src="https://cdn.example/broken.jpg" />
    );

    fireEvent.error(screen.getByRole("img", { name: "User" }));
    expect(screen.getByRole("img", { name: "User" })).toHaveTextContent("US");

    rerender(<UserAvatar name="User" src="https://cdn.example/ok.jpg" />);

    const image = screen.getByRole("img", { name: "User" });
    expect(image).toBeInstanceOf(HTMLImageElement);
    expect(image).toHaveAttribute("src", "https://cdn.example/ok.jpg");
  });

  it("prefers alt over name for the accessible label", () => {
    render(<UserAvatar name="Jane Doe" alt="Profile photo" />);

    expect(screen.getByRole("img", { name: "Profile photo" })).toBeVisible();
  });

  it("defaults the label and initials when name is missing", () => {
    render(<UserAvatar />);

    expect(screen.getByRole("img", { name: "User" })).toHaveTextContent("?");
  });
});
