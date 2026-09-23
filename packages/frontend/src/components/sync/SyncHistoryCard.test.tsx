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

function renderCard(
  item: SyncHistoryItem,
  options: {
    retrying?: string | null;
    isSelected?: boolean;
    confirmDeleteId?: string | null;
  } = {}
) {
  const onRetry = vi.fn();
  const onDelete = vi.fn();
  const onCancelDelete = vi.fn();

  const { container } = renderWithProviders(
    <SyncHistoryCard
      item={item}
      isSelected={options.isSelected ?? false}
      confirmDeleteId={options.confirmDeleteId ?? null}
      deleting={null}
      retrying={options.retrying ?? null}
      onSelect={vi.fn()}
      onDelete={onDelete}
      onCancelDelete={onCancelDelete}
      onRetry={onRetry}
    />
  );

  return { onRetry, onDelete, onCancelDelete, container };
}

describe("SyncHistoryCard", () => {
  it("shows the retry action for failed sync history items", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderCard(baseItem);

    await user.click(screen.getByRole("button", { name: "Retry this sync" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the retry action for partial sync history items", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderCard({
      ...baseItem,
      success: true,
      destinations: ["Trakt"],
      errorMessage: "TVTime: temporary failure",
    });

    await user.click(screen.getByRole("button", { name: "Retry this sync" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables retry while any retry is already in flight", () => {
    renderCard(baseItem, { retrying: "another-history-id" });

    expect(
      screen.getByRole("button", { name: "Retry this sync" })
    ).toBeDisabled();
  });

  it("applies selected and confirming styles", () => {
    const { container: selected } = renderCard(baseItem, { isSelected: true });
    expect(selected.firstChild).toHaveClass("border-warning-500");

    const { container: confirming } = renderCard(baseItem, {
      confirmDeleteId: baseItem.id,
    });
    expect(confirming.firstChild).toHaveClass("border-destructive");
    expect(
      screen.getByRole("button", { name: "Confirm delete" })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  it("shows success and jellyfin source variants", () => {
    renderCard({
      ...baseItem,
      success: true,
      errorMessage: undefined,
      source: "jellyfin",
    });

    expect(screen.getByText("Jellyfin")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Retry this sync" })
    ).toBeNull();
  });
});
