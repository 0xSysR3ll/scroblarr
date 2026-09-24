import type { SyncHistoryItem } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SyncHistoryTableRow } from "./SyncHistoryTableRow";

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

function renderRow(
  item: SyncHistoryItem,
  options: {
    retrying?: string | null;
    isSelected?: boolean;
    confirmDeleteId?: string | null;
  } = {}
) {
  const onRetry = vi.fn();

  const { container } = renderWithProviders(
    <table>
      <tbody>
        <SyncHistoryTableRow
          item={item}
          isSelected={options.isSelected ?? false}
          confirmDeleteId={options.confirmDeleteId ?? null}
          deleting={null}
          retrying={options.retrying ?? null}
          onSelect={vi.fn()}
          onDelete={vi.fn()}
          onCancelDelete={vi.fn()}
          onRetry={onRetry}
        />
      </tbody>
    </table>
  );

  return { onRetry, container };
}

describe("SyncHistoryTableRow", () => {
  it("shows the retry action for failed sync history items", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderRow(baseItem);

    await user.click(screen.getByRole("button", { name: "Retry this sync" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the retry action for partial sync history items", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderRow({
      ...baseItem,
      success: true,
      destinations: ["Trakt"],
      errorMessage: "TVTime: temporary failure",
    });

    await user.click(screen.getByRole("button", { name: "Retry this sync" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables retry while any retry is already in flight", () => {
    renderRow(baseItem, { retrying: "another-history-id" });

    expect(
      screen.getByRole("button", { name: "Retry this sync" })
    ).toBeDisabled();
  });

  it("applies selected and confirming row styles", () => {
    const { container: selected } = renderRow(baseItem, { isSelected: true });
    expect(selected.querySelector("tr")).toHaveClass("bg-warning-50");

    const { container: confirming } = renderRow(baseItem, {
      confirmDeleteId: baseItem.id,
    });
    expect(confirming.querySelector("tr")).toHaveClass("bg-destructive/10");
    expect(
      screen.getByRole("button", { name: "Confirm delete" })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  it("shows success status and jellyfin source chip", () => {
    renderRow({
      ...baseItem,
      success: true,
      errorMessage: undefined,
      source: "jellyfin",
    });

    expect(screen.getByText("Success")).toBeVisible();
    expect(screen.getByText("Jellyfin")).toBeVisible();
  });
});
