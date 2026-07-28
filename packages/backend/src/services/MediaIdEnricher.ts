import { TmdbRateLimitError } from "@integrations/tmdb/TmdbApiError";
import { TmdbClient } from "@integrations/tmdb/TmdbClient";
import type { MediaItem } from "@scroblarr/shared";
import { logger } from "@utils/logger";

const MAX_TV_CANDIDATES = 5;
/** Sequel fan-out is expensive; only try it for the top search hit. */
const MAX_SEQUEL_PARENT_CANDIDATES = 1;
const MAX_SEQUEL_RECOMMENDATIONS = 3;

function normalizeTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titlesMatch(left: string, right: string): boolean {
  return normalizeTitle(left) === normalizeTitle(right);
}

export function needsMediaIdEnrichment(media: MediaItem): boolean {
  if (media.type === "movie") {
    return !(media.tmdbMovieId || media.imdbMovieId || media.tvdbMovieId);
  }

  if (media.type === "episode") {
    return !(media.tmdbSeriesId || media.imdbEpisodeId || media.tvdbEpisodeId);
  }

  return false;
}

export class MediaIdEnricher {
  constructor(private readonly tmdbClient: TmdbClient) {}

  async enrich(media: MediaItem): Promise<MediaItem> {
    if (!needsMediaIdEnrichment(media)) {
      return media;
    }

    try {
      if (media.type === "movie") {
        return await this.enrichMovie(media);
      }
      if (media.type === "episode") {
        return await this.enrichEpisode(media);
      }
    } catch (error) {
      if (error instanceof TmdbRateLimitError) {
        logger.sync.warn(
          { mediaTitle: media.title, mediaType: media.type },
          "TMDB rate limit while enriching media IDs"
        );
      } else {
        logger.sync.warn(
          { error, mediaTitle: media.title, mediaType: media.type },
          "Failed to enrich media IDs from TMDB"
        );
      }
    }

    return media;
  }

  private async enrichMovie(media: MediaItem): Promise<MediaItem> {
    if (!media.title) {
      return media;
    }

    const results = await this.tmdbClient.searchMovie(media.title, media.year);
    const match = this.pickMovieMatch(results, media.title, media.year);
    if (!match) {
      logger.sync.debug(
        { mediaTitle: media.title, year: media.year },
        "No TMDB movie match for ID enrichment"
      );
      return media;
    }

    const externalIds = await this.tmdbClient.getMovieExternalIds(match.id);

    const enriched: MediaItem = {
      ...media,
      tmdbMovieId: match.id,
      imdbMovieId: media.imdbMovieId ?? externalIds?.imdbId,
      tvdbMovieId: media.tvdbMovieId,
    };

    logger.sync.info(
      {
        mediaTitle: media.title,
        tmdbMovieId: enriched.tmdbMovieId,
        imdbMovieId: enriched.imdbMovieId,
        tvdbMovieId: enriched.tvdbMovieId,
      },
      "Enriched movie IDs from TMDB"
    );

    return enriched;
  }

  private async enrichEpisode(media: MediaItem): Promise<MediaItem> {
    if (
      !media.title ||
      media.seasonNumber === undefined ||
      media.episodeNumber === undefined
    ) {
      return media;
    }

    const results = await this.tmdbClient.searchTv(media.title, media.year);
    const candidates = this.rankTvMatches(
      results,
      media.title,
      media.year
    ).filter((candidate) => candidate.score >= 10);

    const cache = this.createLookupCache();
    const ranked = candidates.slice(0, MAX_TV_CANDIDATES);

    for (const candidate of ranked) {
      const resolved = await this.resolveEpisodeAgainstShow(
        media,
        candidate.id,
        cache
      );
      if (resolved) {
        return resolved;
      }
    }

    for (const candidate of ranked.slice(0, MAX_SEQUEL_PARENT_CANDIDATES)) {
      const sequelResolved = await this.resolveEpisodeViaSequelRecommendations(
        media,
        candidate.id,
        cache
      );
      if (sequelResolved) {
        return sequelResolved;
      }
    }

    logger.sync.debug(
      {
        mediaTitle: media.title,
        seasonNumber: media.seasonNumber,
        episodeNumber: media.episodeNumber,
        year: media.year,
      },
      "No TMDB episode match for ID enrichment"
    );

    return media;
  }

  private createLookupCache() {
    const showDetails = new Map<
      number,
      Awaited<ReturnType<TmdbClient["getTvShowDetails"]>>
    >();
    const seasonExists = new Map<string, boolean>();

    return {
      getTvShowDetails: async (seriesId: number) => {
        if (showDetails.has(seriesId)) {
          return showDetails.get(seriesId)!;
        }
        const details = await this.tmdbClient.getTvShowDetails(seriesId);
        showDetails.set(seriesId, details);
        return details;
      },
      hasTvSeason: async (seriesId: number, seasonNumber: number) => {
        const key = `${seriesId}:${seasonNumber}`;
        if (seasonExists.has(key)) {
          return seasonExists.get(key)!;
        }
        const exists = await this.tmdbClient.hasTvSeason(
          seriesId,
          seasonNumber
        );
        seasonExists.set(key, exists);
        return exists;
      },
    };
  }

  private async resolveEpisodeViaSequelRecommendations(
    media: MediaItem,
    parentSeriesId: number,
    cache: ReturnType<MediaIdEnricher["createLookupCache"]>
  ): Promise<MediaItem | null> {
    const seasonNumber = media.seasonNumber!;
    const episodeNumber = media.episodeNumber!;

    const parentDetails = await cache.getTvShowDetails(parentSeriesId);
    const parentSeasonCount = parentDetails?.numberOfSeasons;
    if (!parentSeasonCount || seasonNumber <= parentSeasonCount) {
      return null;
    }

    const recommendations =
      await this.tmdbClient.getTvRecommendations(parentSeriesId);
    if (recommendations.length === 0) {
      return null;
    }

    const parentTitle = parentDetails?.name || media.title;
    const ranked = [...recommendations].sort((a, b) => {
      const score = (item: (typeof recommendations)[number]) => {
        let value = item.popularity ?? 0;
        const names = [item.name, item.originalName].filter(
          Boolean
        ) as string[];
        if (
          names.some((name) =>
            normalizeTitle(name).startsWith(`${normalizeTitle(parentTitle)} `)
          )
        ) {
          value += 1000;
        }
        return value;
      };
      return score(b) - score(a);
    });

    const sequelSeason = seasonNumber - parentSeasonCount;
    const seasonsToTry = [...new Set([sequelSeason, 1].filter((s) => s >= 1))];

    for (const recommendation of ranked.slice(0, MAX_SEQUEL_RECOMMENDATIONS)) {
      for (const trySeason of seasonsToTry) {
        const episodeIds = await this.tmdbClient.getEpisodeExternalIds(
          recommendation.id,
          trySeason,
          episodeNumber
        );
        const seasonExists =
          episodeIds !== null ||
          (await cache.hasTvSeason(recommendation.id, trySeason));
        if (!seasonExists) {
          continue;
        }

        const enriched: MediaItem = {
          ...media,
          seasonNumber: trySeason,
          tmdbSeriesId: recommendation.id,
          imdbEpisodeId: media.imdbEpisodeId ?? episodeIds?.imdbId,
          tvdbEpisodeId: media.tvdbEpisodeId ?? episodeIds?.tvdbId,
        };

        logger.sync.info(
          {
            mediaTitle: media.title,
            parentSeriesId,
            sequelTitle: recommendation.name,
            originalSeason: seasonNumber,
            remappedSeason: trySeason,
            episodeNumber,
            tmdbSeriesId: enriched.tmdbSeriesId,
            imdbEpisodeId: enriched.imdbEpisodeId,
            tvdbEpisodeId: enriched.tvdbEpisodeId,
          },
          "Enriched episode IDs from TMDB sequel recommendation"
        );

        return enriched;
      }
    }

    return null;
  }

  private async resolveEpisodeAgainstShow(
    media: MediaItem,
    seriesId: number,
    cache: ReturnType<MediaIdEnricher["createLookupCache"]>
  ): Promise<MediaItem | null> {
    const seasonNumber = media.seasonNumber!;
    const episodeNumber = media.episodeNumber!;

    let effectiveSeason = seasonNumber;
    let episodeIds = await this.tmdbClient.getEpisodeExternalIds(
      seriesId,
      effectiveSeason,
      episodeNumber
    );

    let seasonExists =
      episodeIds !== null ||
      (await cache.hasTvSeason(seriesId, effectiveSeason));

    if (!seasonExists) {
      const details = await cache.getTvShowDetails(seriesId);
      const canRemapSeason =
        details?.numberOfSeasons === 1 &&
        seasonNumber !== 1 &&
        episodeNumber >= 1 &&
        this.isLikelyStandaloneSeasonTitle(media.title);

      if (canRemapSeason) {
        effectiveSeason = 1;
        episodeIds = await this.tmdbClient.getEpisodeExternalIds(
          seriesId,
          effectiveSeason,
          episodeNumber
        );

        seasonExists =
          episodeIds !== null ||
          (await cache.hasTvSeason(seriesId, effectiveSeason));
        if (!seasonExists) {
          return null;
        }

        logger.sync.info(
          {
            mediaTitle: media.title,
            originalSeason: seasonNumber,
            remappedSeason: effectiveSeason,
            episodeNumber,
            tmdbSeriesId: seriesId,
          },
          "Remapped episode season for single-season TMDB show"
        );
      } else {
        return null;
      }
    }

    const enriched: MediaItem = {
      ...media,
      seasonNumber: effectiveSeason,
      tmdbSeriesId: seriesId,
      imdbEpisodeId: media.imdbEpisodeId ?? episodeIds?.imdbId,
      tvdbEpisodeId: media.tvdbEpisodeId ?? episodeIds?.tvdbId,
    };

    logger.sync.info(
      {
        mediaTitle: media.title,
        seasonNumber: enriched.seasonNumber,
        episodeNumber: enriched.episodeNumber,
        tmdbSeriesId: enriched.tmdbSeriesId,
        imdbEpisodeId: enriched.imdbEpisodeId,
        tvdbEpisodeId: enriched.tvdbEpisodeId,
        remappedSeason: effectiveSeason !== seasonNumber,
      },
      "Enriched episode IDs from TMDB"
    );

    return enriched;
  }

  private isLikelyStandaloneSeasonTitle(title: string): boolean {
    const words = normalizeTitle(title)
      .split(" ")
      .filter(
        (word) =>
          word.length > 0 &&
          !["the", "a", "an", "and", "of", "with"].includes(word)
      );
    return words.length >= 2 || normalizeTitle(title).length >= 24;
  }

  private pickMovieMatch(
    results: Array<{
      id: number;
      title?: string;
      originalTitle?: string;
      releaseDate?: string;
      popularity?: number;
    }>,
    title: string,
    year?: number
  ): { id: number } | null {
    const exact = results.filter(
      (item) =>
        (item.title && titlesMatch(item.title, title)) ||
        (item.originalTitle && titlesMatch(item.originalTitle, title))
    );
    if (exact.length === 0) {
      return null;
    }

    const ranked = [...exact].sort((a, b) => {
      const score = (item: (typeof exact)[number]) => {
        let value = 0;
        if (year && item.releaseDate?.startsWith(`${year}-`)) {
          value += 100;
        }
        value += item.popularity ?? 0;
        return value;
      };
      return score(b) - score(a);
    });

    return ranked[0];
  }

  private rankTvMatches(
    results: Array<{
      id: number;
      name?: string;
      originalName?: string;
      firstAirDate?: string;
      popularity?: number;
    }>,
    title: string,
    year?: number
  ): Array<{ id: number; score: number }> {
    return [...results]
      .map((item) => {
        let score = 0;
        if (
          (item.name && titlesMatch(item.name, title)) ||
          (item.originalName && titlesMatch(item.originalName, title))
        ) {
          score += 10;
        }
        if (year && item.firstAirDate?.startsWith(`${year}-`)) {
          score += 5;
        }
        // Keep TMDB popularity as a stable tiebreaker within the integer score bands.
        score += Math.min((item.popularity ?? 0) / 1000, 0.9);
        return { id: item.id, score };
      })
      .sort((a, b) => b.score - a.score);
  }
}
