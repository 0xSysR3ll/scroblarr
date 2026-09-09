import type { TmdbClient } from "@integrations/tmdb/TmdbClient";

import type { BingersAlternateTitles } from "./BingersCatalogResolver";

function nonEmptyTitles(...titles: Array<string | undefined | null>): string[] {
  return titles.filter((title): title is string => !!title?.trim());
}

/** TMDB original/localized names used when Bingers title search misses. */
export function createBingersAlternateTitles(
  tmdb: TmdbClient
): BingersAlternateTitles {
  return {
    forTv: async (tmdbSeriesId) => {
      const details = await tmdb.getTvShowDetails(tmdbSeriesId);
      return nonEmptyTitles(details?.originalName, details?.name);
    },
    forMovie: async (tmdbMovieId) => {
      const details = await tmdb.getMovieTitleDetails(tmdbMovieId);
      return nonEmptyTitles(details?.originalTitle, details?.title);
    },
  };
}
