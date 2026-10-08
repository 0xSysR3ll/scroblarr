import type { SyncHistoryItem } from "@services/api";
import { renderWithProviders } from "@test/render";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SyncHistoryMediaLinks } from "./SyncHistoryMediaLinks";

const baseItem: SyncHistoryItem = {
  id: "history-1",
  userId: "user-1",
  username: "alice",
  mediaType: "movie",
  mediaTitle: "Example Movie",
  source: "plex",
  success: true,
  syncedAt: new Date().toISOString(),
};

describe("SyncHistoryMediaLinks", () => {
  it("renders dark-background and light-background media links", () => {
    renderWithProviders(
      <SyncHistoryMediaLinks
        item={{
          ...baseItem,
          tvdbMovieId: "123",
          imdbMovieId: "tt456",
          tmdbMovieId: "789",
        }}
      />
    );

    const tvdb = screen.getByTitle(/TVDB:/i);
    expect(tvdb).toHaveAttribute(
      "href",
      "https://www.thetvdb.com/?tab=movie&id=123"
    );
    expect(tvdb).toHaveClass("bg-foreground");

    const imdb = screen.getByTitle(/IMDB:/i);
    expect(imdb).toHaveAttribute("href", "https://www.imdb.com/title/tt456");
    expect(imdb).toHaveClass("bg-primary/10");

    expect(screen.getByAltText("TMDB")).toBeInTheDocument();
  });

  it("renders nothing when the item has no media ids", () => {
    const { container } = renderWithProviders(
      <SyncHistoryMediaLinks item={baseItem} />
    );

    expect(container.querySelector("a")).toBeNull();
  });
});
