import { TmdbRateLimitError } from "@integrations/tmdb/TmdbApiError";
import { TmdbClient } from "@integrations/tmdb/TmdbClient";
import type { MediaItem } from "@scroblarr/shared";
import { logger } from "@utils/logger";

const MAX_TV_CANDIDATES = 5;

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
      tvdbMovieId: media.tvdbMovieId ?? externalIds?.tvdbId,
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

    for (const candidate of candidates.slice(0, MAX_TV_CANDIDATES)) {
      const resolved = await this.resolveEpisodeAgainstShow(
        media,
        candidate.id
      );
      if (resolved) {
        return resolved;
      }

      const sequelResolved = await this.resolveEpisodeViaSequelRecommendations(
        media,
        candidate.id
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

  private async resolveEpisodeViaSequelRecommendations(
    media: MediaItem,
    parentSeriesId: number
  ): Promise<MediaItem | null> {
    const seasonNumber = media.seasonNumber!;
    const episodeNumber = media.episodeNumber!;

    const parentDetails =
      await this.tmdbClient.getTvShowDetails(parentSeriesId);
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

    for (const recommendation of ranked.slice(0, MAX_TV_CANDIDATES)) {
      for (const trySeason of seasonsToTry) {
        const episodeIds = await this.tmdbClient.getEpisodeExternalIds(
          recommendation.id,
          trySeason,
          episodeNumber
        );
        const seasonExists =
          episodeIds !== null ||
          (await this.tmdbClient.hasTvSeason(recommendation.id, trySeason));
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
    seriesId: number
  ): Promise<MediaItem | null> {
    const seasonNumber = media.seasonNumber!;
    const episodeNumber = media.episodeNumber!;

    let effectiveSeason = seasonNumber;
    let episodeIds = await this.tmdbClient.getEpisodeExternalIds(
      seriesId,
      effectiveSeason,
      episodeNumber
    );

    const seasonExists =
      episodeIds !== null ||
      (await this.tmdbClient.hasTvSeason(seriesId, effectiveSeason));

    if (!seasonExists) {
      const details = await this.tmdbClient.getTvShowDetails(seriesId);
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

        if (!episodeIds && !(await this.tmdbClient.hasTvSeason(seriesId, 1))) {
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

    if (
      episodeIds === null &&
      !(await this.tmdbClient.hasTvSeason(seriesId, effectiveSeason))
    ) {
      return null;
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
