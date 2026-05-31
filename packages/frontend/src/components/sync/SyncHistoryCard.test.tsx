import type { SyncHistoryItem } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SyncHistoryCard } from "./SyncHistoryCard";

const baseItem: SyncHistoryItem = {
  id: "history-1",
  userId: "user-1",
  username: "alice",
  mediaType: "movie",
  mediaTitle: "Example Movie",
  source: "plex",
  success: false,
  errorMessage: "TVTime: temporary failure",
  syncedAt: new Date().toISOString(),
};

function renderCard(item: SyncHistoryItem, retrying: string | null = null) {
  const onRetry = vi.fn();

  renderWithProviders(
    <SyncHistoryCard
      item={item}
      isSelected={false}
      confirmDeleteId={null}
      deleting={null}
      retrying={retrying}
      onSelect={vi.fn()}
      onDelete={vi.fn()}
      onCancelDelete={vi.fn()}
      onRetry={onRetry}
    />
  );

  return { onRetry };
}

describe("SyncHistoryCard", () => {
  it("shows the retry action for failed sync history items", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderCard(baseItem);

    await user.click(screen.getByRole("button", { name: "Retry this sync" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides the retry action for partial sync history items", () => {
    renderCard({
      ...baseItem,
      success: true,
      destinations: ["Trakt"],
      errorMessage: "TVTime: temporary failure",
    });

    expect(
      screen.queryByRole("button", { name: "Retry this sync" })
    ).not.toBeInTheDocument();
  });

  it("disables retry while any retry is already in flight", () => {
    renderCard(baseItem, "another-history-id");

    expect(
      screen.getByRole("button", { name: "Retry this sync" })
    ).toBeDisabled();
  });
});
