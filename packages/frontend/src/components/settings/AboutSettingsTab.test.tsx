import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AboutSettingsTab } from "./AboutSettingsTab";

describe("AboutSettingsTab", () => {
  it("shows TMDB attribution text", () => {
    renderWithProviders(
      <AboutSettingsTab
        versionInfo={{
          version: "v1.0.0",
          commitTag: "abc123",
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

  it("warns when running a develop build and strips the develop- prefix", () => {
    renderWithProviders(
      <AboutSettingsTab
        versionInfo={{
          version: "develop-abc123def",
          commitTag: "abc123def",
          updateAvailable: false,
          githubRepository: "0xsysr3ll/scroblarr",
        }}
      />
    );

    expect(
      screen.getByText(/running the develop branch of Scroblarr/i)
    ).toBeInTheDocument();
    expect(screen.getByText("abc123def")).toBeInTheDocument();
    expect(screen.queryByText(/develop-abc123def/)).not.toBeInTheDocument();
  });

  it("shows unavailable, up-to-date, and out-of-date badges", () => {
    const { rerender } = renderWithProviders(
      <AboutSettingsTab
        versionInfo={{
          version: "v1.0.0",
          commitTag: "abc123",
          githubRepository: "0xsysr3ll/scroblarr",
          releasesError: "failed to fetch",
        }}
      />
    );
    expect(screen.getByText("Unavailable")).toBeInTheDocument();

    rerender(
      <AboutSettingsTab
        versionInfo={{
          version: "v1.0.0",
          commitTag: "abc123",
          githubRepository: "0xsysr3ll/scroblarr",
          updateAvailable: false,
        }}
      />
    );
    expect(screen.getByText("Up to Date")).toBeInTheDocument();

    rerender(
      <AboutSettingsTab
        versionInfo={{
          version: "v1.0.0",
          commitTag: "abc123",
          githubRepository: "0xsysr3ll/scroblarr",
          updateAvailable: true,
        }}
      />
    );
    expect(screen.getByText(/Out of Date/i)).toBeInTheDocument();
  });

  it("hides update badges for local builds", () => {
    renderWithProviders(
      <AboutSettingsTab
        versionInfo={{
          version: "develop-local",
          commitTag: "local",
          updateAvailable: false,
          githubRepository: "0xsysr3ll/scroblarr",
        }}
      />
    );

    expect(screen.queryByText("Up to Date")).not.toBeInTheDocument();
    expect(screen.queryByText(/Out of Date/i)).not.toBeInTheDocument();
  });

  it("shows unavailable copy when version info is missing", () => {
    renderWithProviders(<AboutSettingsTab versionInfo={null} />);

    expect(
      screen.getByText("Version information is currently unavailable.")
    ).toBeInTheDocument();
  });

  it("links develop badges to the compare URL and stable badges to latestUrl", () => {
    const { rerender } = renderWithProviders(
      <AboutSettingsTab
        versionInfo={{
          version: "develop-abc123def",
          commitTag: "abc123def",
          updateAvailable: true,
          githubRepository: "0xsysr3ll/scroblarr",
        }}
      />
    );

    expect(screen.getByRole("link", { name: /Out of Date/i })).toHaveAttribute(
      "href",
      "https://github.com/0xsysr3ll/scroblarr/compare/abc123def...develop"
    );

    rerender(
      <AboutSettingsTab
        versionInfo={{
          version: "v1.0.0",
          commitTag: "abc123",
          updateAvailable: true,
          latestUrl:
            "https://github.com/0xsysr3ll/scroblarr/releases/tag/v2.0.0",
          githubRepository: "0xsysr3ll/scroblarr",
        }}
      />
    );

    expect(screen.getByRole("link", { name: /Out of Date/i })).toHaveAttribute(
      "href",
      "https://github.com/0xsysr3ll/scroblarr/releases/tag/v2.0.0"
    );
  });
});
