import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CollapsibleSettingsCard } from "./CollapsibleSettingsCard";

describe("CollapsibleSettingsCard", () => {
  it("is collapsed by default and hides children", () => {
    renderWithProviders(
      <CollapsibleSettingsCard
        title="Plex Server"
        description="Configure Plex"
        icon={<span>icon</span>}
      >
        <div>Panel body</div>
      </CollapsibleSettingsCard>
    );

    const toggle = screen.getByRole("button", { name: /Plex Server/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Panel body")).not.toBeInTheDocument();
    expect(screen.getByText("Configure Plex")).toBeInTheDocument();
  });

  it("expands and collapses content when the header is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CollapsibleSettingsCard
        title="Jellyfin Server"
        description="Configure Jellyfin"
        icon={<span>icon</span>}
        headerMeta={<span>Meta badge</span>}
      >
        <div>Expanded content</div>
      </CollapsibleSettingsCard>
    );

    expect(screen.getByText("Meta badge")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Jellyfin Server/i }));
    expect(
      screen.getByRole("button", { name: /Jellyfin Server/i })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Expanded content")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Jellyfin Server/i }));
    expect(
      screen.getByRole("button", { name: /Jellyfin Server/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Expanded content")).not.toBeInTheDocument();
  });

  it("can start open when defaultOpen is true", () => {
    renderWithProviders(
      <CollapsibleSettingsCard
        title="Open card"
        description="Already open"
        icon={<span>icon</span>}
        defaultOpen
      >
        <div>Visible body</div>
      </CollapsibleSettingsCard>
    );

    expect(screen.getByRole("button", { name: /Open card/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Visible body")).toBeInTheDocument();
  });
});
