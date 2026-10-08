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
    deleting?: string | null;
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
          deleting={options.deleting ?? null}
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

  it("shows Emby source chip", () => {
    renderRow({
      ...baseItem,
      success: true,
      errorMessage: undefined,
      source: "emby",
    });

    expect(screen.getByText("Emby")).toBeVisible();
  });

  it("falls back to plain text for unknown sources", () => {
    renderRow({
      ...baseItem,
      success: true,
      errorMessage: undefined,
      source: "tautulli" as SyncHistoryItem["source"],
    });

    expect(screen.getByText("tautulli")).toBeVisible();
  });

  it("shows a placeholder when source is missing", () => {
    const { container } = renderRow({
      ...baseItem,
      success: true,
      errorMessage: undefined,
      source: undefined,
      destinations: ["Trakt"],
    });

    const sourceCell = container.querySelectorAll("td")[4];
    expect(sourceCell?.textContent).toBe("-");
  });

  it("shows a rewatched badge and media links when available", () => {
    renderRow({
      ...baseItem,
      success: true,
      errorMessage: undefined,
      wasRewatched: true,
      destinations: ["Bingers"],
      tmdbMovieId: "42",
    });

    expect(screen.getByText("Rewatched")).toBeVisible();
    expect(screen.getByTitle(/TMDB:/i)).toBeVisible();
  });

  it("shows spinners while deleting or retrying the current item", () => {
    const { container: deleting } = renderRow(baseItem, {
      confirmDeleteId: baseItem.id,
      deleting: baseItem.id,
    });
    expect(deleting.querySelector(".animate-spin")).not.toBeNull();

    const { container: retrying } = renderRow(baseItem, {
      retrying: baseItem.id,
    });
    expect(retrying.querySelector(".animate-spin")).not.toBeNull();
  });
});
