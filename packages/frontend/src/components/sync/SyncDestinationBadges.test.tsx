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
  it("renders Bingers destination badges with sky styling", () => {
    renderWithProviders(
      <SyncDestinationBadges
        item={historyItem({ destinations: ["Bingers"] })}
      />
    );

    const badge = screen.getByLabelText("Bingers");
    expect(badge).toHaveClass("bg-sky-100");
    expect(screen.getByAltText("Bingers")).toHaveAttribute(
      "src",
      "/logos/bingers.png"
    );
  });
});
