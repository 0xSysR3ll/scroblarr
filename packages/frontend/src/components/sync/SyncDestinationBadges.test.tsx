import type { SyncHistoryItem } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SyncDestinationBadges } from "./SyncDestinationBadges";

function historyItem(
  overrides: Partial<SyncHistoryItem> = {}
): SyncHistoryItem {
  return {
    id: "history-1",
    userId: "user-1",
    username: "alice",
    mediaType: "movie",
    mediaTitle: "Example Movie",
    source: "plex",
    success: true,
    syncedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("SyncDestinationBadges", () => {
  it("renders Bingers destination badges with logo coral styling", () => {
    renderWithProviders(
      <SyncDestinationBadges
        item={historyItem({ destinations: ["Bingers"] })}
      />
    );

    const badge = screen.getByLabelText("Bingers");
    expect(badge).toHaveClass("bg-(--bingers-chip-bg)");
    expect(screen.getByAltText("Bingers")).toHaveAttribute(
      "src",
      "/logos/bingers.png"
    );
  });

  it.each([
    ["Trakt", "/logos/trakt.svg"],
    ["Simkl", "/logos/simkl.svg"],
    ["TVTime", "/logos/tvtime.svg"],
  ] as const)("renders the %s destination badge", (name, logo) => {
    renderWithProviders(
      <SyncDestinationBadges item={historyItem({ destinations: [name] })} />
    );

    expect(screen.getByLabelText(name)).toBeInTheDocument();
    expect(screen.getByAltText(name)).toHaveAttribute("src", logo);
  });
});
