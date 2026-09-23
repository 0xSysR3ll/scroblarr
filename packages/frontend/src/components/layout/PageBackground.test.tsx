import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageBackground } from "./PageBackground";

describe("PageBackground", () => {
  it("renders children", () => {
    renderWithProviders(
      <PageBackground>
        <p>Background child</p>
      </PageBackground>
    );

    expect(screen.getByText("Background child")).toBeVisible();
  });
});
