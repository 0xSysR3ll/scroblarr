import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBingersAlternateTitles } from "./bingersAlternateTitles";

describe("createBingersAlternateTitles", () => {
  const tmdb = {
    getTvShowDetails: vi.fn(),
    getMovieTitleDetails: vi.fn(),
  };

  beforeEach(() => {
    tmdb.getTvShowDetails.mockReset();
    tmdb.getMovieTitleDetails.mockReset();
  });

  it("returns TV original and localized names", async () => {
    tmdb.getTvShowDetails.mockResolvedValue({
      originalName: "La Flamme",
      name: "The Flame",
    });

    const titles = createBingersAlternateTitles(tmdb as never);

    await expect(titles.forTv?.(94626)).resolves.toEqual([
      "La Flamme",
      "The Flame",
    ]);
    expect(tmdb.getTvShowDetails).toHaveBeenCalledWith(94626);
  });

  it("returns movie original and localized titles", async () => {
    tmdb.getMovieTitleDetails.mockResolvedValue({
      originalTitle: "Intouchables",
      title: "The Intouchables",
    });

    const titles = createBingersAlternateTitles(tmdb as never);

    await expect(titles.forMovie?.(77338)).resolves.toEqual([
      "Intouchables",
      "The Intouchables",
    ]);
    expect(tmdb.getMovieTitleDetails).toHaveBeenCalledWith(77338);
  });

  it("filters blank and missing TMDB titles", async () => {
    tmdb.getTvShowDetails.mockResolvedValue({
      originalName: "  ",
      name: undefined,
    });
    tmdb.getMovieTitleDetails.mockResolvedValue(null);

    const titles = createBingersAlternateTitles(tmdb as never);

    await expect(titles.forTv?.(1)).resolves.toEqual([]);
    await expect(titles.forMovie?.(2)).resolves.toEqual([]);
  });
});
