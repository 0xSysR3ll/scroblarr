import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AboutSettingsTab } from "./AboutSettingsTab";

describe("AboutSettingsTab", () => {
  it("shows TMDB attribution text", () => {
    renderWithProviders(
      <AboutSettingsTab
        versionInfo={{
          version: "1.0.0",
          tag: "v1.0.0",
          githubRepository: "0xsysr3ll/scroblarr",
        }}
      />
    );

    expect(
      screen.getByText(
        "This product uses the TMDB API but is not endorsed or certified by TMDB."
      )
    ).toBeInTheDocument();
  });
});
