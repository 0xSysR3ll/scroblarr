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

function renderRow(item: SyncHistoryItem, retrying: string | null = null) {
  const onRetry = vi.fn();

  renderWithProviders(
    <table>
      <tbody>
        <SyncHistoryTableRow
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
      </tbody>
    </table>
  );

  return { onRetry };
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
    renderRow(baseItem, "another-history-id");

    expect(
      screen.getByRole("button", { name: "Retry this sync" })
    ).toBeDisabled();
  });
});
