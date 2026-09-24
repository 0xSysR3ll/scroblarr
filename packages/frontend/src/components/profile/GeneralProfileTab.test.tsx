import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GeneralProfileTab } from "./GeneralProfileTab";

describe("GeneralProfileTab", () => {
  it("shows the Admin chip when isAdmin is true", () => {
    renderWithProviders(
      <GeneralProfileTab
        displayName="Alice"
        username="alice"
        email="alice@example.test"
        isAdmin
      />
    );

    expect(screen.getByText("Alice")).toBeVisible();
    expect(screen.getByText("Admin")).toBeVisible();
  });
});
