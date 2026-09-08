import { MediaItem } from "@scroblarr/shared";
import { logger } from "@utils/logger";

import { BingersApiError, bingersErrorFromResponse } from "./BingersApiError";

export const BINGERS_API_BASE = "https://api.bingers.app";
export const BINGERS_CATALOG_BASE = "https://catalog.bingers.app";

export type BingersEntityKind = "movie" | "episode";

export interface BingersEntityRef {
  entityKind: BingersEntityKind;
  entityId: string;
  titleId: string;
}

interface SearchTitleResult {
  id: string;
  kind: "show" | "movie" | string;
  metadata?: string;
  card?: {
    originalTitle?: string;
    year?: number;
    titlesI18n?: Record<string, string>;
  };
}

interface ExternalId {
  id?: string;
  source?: string;
  type?: string;
}

interface MetadataGrain {
  id?: string;
  kind?: string;
  year?: number;
  external_ids?: ExternalId[];
}

interface VersionsIndex {
  titleId?: string;
  kind?: string;
  files?: {
    metadata?: string;
    seasons?: Record<string, string>;
  };
}

interface SeasonGrain {
  season?: number;
  episodes?: Array<{ id?: string; n?: number }>;
}

export type BingersAlternateTitles = {
  forTv?: (tmdbSeriesId: number) => Promise<string[]>;
  forMovie?: (tmdbMovieId: number) => Promise<string[]>;
};

export class BingersCatalogResolver {
  private static readonly FETCH_TIMEOUT_MS = 20_000;

  constructor(private readonly getAlternateTitles?: BingersAlternateTitles) {}

  async resolveEntity(media: MediaItem): Promise<BingersEntityRef> {
    if (media.type === "movie") {
      return this.resolveMovie(media);
    }
    if (media.type === "episode") {
      return this.resolveEpisode(media);
    }
    throw new Error(`Unsupported media type: ${media.type}`);
  }

  private async resolveMovie(media: MediaItem): Promise<BingersEntityRef> {
    const tmdbMovieId = media.tmdbMovieId;
    const forMovie = this.getAlternateTitles?.forMovie;
    const matched = await this.matchTitle(
      media.title,
      "movie",
      {
        imdb: media.imdbMovieId,
        tmdb: tmdbMovieId,
        tvdb: media.tvdbMovieId,
        year: media.year,
      },
      tmdbMovieId !== undefined && forMovie
        ? () => forMovie(tmdbMovieId)
        : undefined
    );

    if (!matched) {
      throw new Error(
        `Could not resolve Bingers movie entity for "${media.title}"`
      );
    }

    return {
      entityKind: "movie",
      entityId: matched.id,
      titleId: matched.id,
    };
  }

  private async resolveEpisode(media: MediaItem): Promise<BingersEntityRef> {
    if (media.seasonNumber === undefined || media.episodeNumber === undefined) {
      throw new Error("Episode requires seasonNumber and episodeNumber");
    }

    const tmdbSeriesId = media.tmdbSeriesId;
    const forTv = this.getAlternateTitles?.forTv;
    const matched = await this.matchTitle(
      media.title,
      "show",
      {
        imdb: media.imdbSeriesId,
        tmdb: tmdbSeriesId,
        tvdb: media.tvdbSeriesId,
        year: media.year,
      },
      tmdbSeriesId !== undefined && forTv
        ? () => forTv(tmdbSeriesId)
        : undefined
    );

    if (!matched) {
      throw new Error(
        `Could not resolve Bingers show entity for "${media.title}"`
      );
    }

    const versions = await this.fetchJson<VersionsIndex>(
      `${BINGERS_CATALOG_BASE}/catalog/${matched.id}/versions.json`
    );
    const seasonToken = versions.files?.seasons?.[String(media.seasonNumber)];
    if (!seasonToken) {
      throw new Error(
        `Bingers catalog has no season ${media.seasonNumber} for "${media.title}"`
      );
    }

    const season = await this.fetchJson<SeasonGrain>(
      `${BINGERS_CATALOG_BASE}/catalog/${matched.id}/season-${media.seasonNumber}@${seasonToken}.json`
    );
    const episode = season.episodes?.find((ep) => ep.n === media.episodeNumber);
    if (!episode?.id) {
      throw new Error(
        `Bingers catalog has no S${media.seasonNumber}E${media.episodeNumber} for "${media.title}"`
      );
    }

    return {
      entityKind: "episode",
      entityId: episode.id,
      titleId: matched.id,
    };
  }

  private async matchTitle(
    primaryTitle: string,
    preferKind: "movie" | "show",
    ids: {
      imdb?: string;
      tmdb?: number;
      tvdb?: number;
      year?: number;
    },
    loadAlternates?: () => Promise<string[]>
  ): Promise<SearchTitleResult | null> {
    const matchOpts = { ...ids, preferKind, title: primaryTitle };
    let matched = await this.pickTitleByExternalIds(
      await this.searchTitles(primaryTitle, preferKind),
      matchOpts
    );
    if (matched || !loadAlternates) {
      return matched;
    }

    try {
      const alternates = await loadAlternates();
      const primary = this.normalizeTitle(primaryTitle);
      for (const alternate of alternates) {
        if (!alternate.trim() || this.normalizeTitle(alternate) === primary) {
          continue;
        }
        matched = await this.pickTitleByExternalIds(
          await this.searchTitles(alternate, preferKind),
          { ...matchOpts, title: alternate, allowTitleFallback: false }
        );
        if (matched) {
          return matched;
        }
      }
    } catch (error) {
      logger.bingers.debug(
        { error, title: primaryTitle, tmdb: ids.tmdb, preferKind },
        "Failed to load TMDB alternate titles for Bingers catalog match"
      );
    }

    return null;
  }

  private async searchTitles(
    query: string,
    preferKind: "movie" | "show"
  ): Promise<SearchTitleResult[]> {
    const q = query.trim();
    if (!q) {
      throw new Error("Title is required to search Bingers catalog");
    }

    const url = new URL(`${BINGERS_API_BASE}/search/titles`);
    url.searchParams.set("q", q);
    url.searchParams.set("page", "0");
    url.searchParams.set("lang", "en");

    const body = await this.fetchJson<{ results?: SearchTitleResult[] }>(
      url.toString()
    );
    const results = body.results ?? [];

    const preferred = results.filter((r) => r.kind === preferKind);
    return preferred.length > 0 ? preferred : results;
  }

  private async pickTitleByExternalIds(
    candidates: SearchTitleResult[],
    opts: {
      title?: string;
      imdb?: string;
      tmdb?: number;
      tvdb?: number;
      year?: number;
      preferKind: "movie" | "show";
      allowTitleFallback?: boolean;
    }
  ): Promise<SearchTitleResult | null> {
    const metadataCandidates = candidates
      .slice(0, 12)
      .filter((candidate) => candidate.metadata);
    const scoredResults = await this.mapWithConcurrency(
      metadataCandidates,
      3,
      async (candidate) => {
        try {
          const metadata = await this.fetchJson<MetadataGrain>(
            `${BINGERS_CATALOG_BASE}/catalog/${candidate.id}/metadata@${candidate.metadata}.json`
          );
          const score = this.scoreMetadataMatch(metadata, opts);
          return score > 0 ? { candidate, score } : null;
        } catch (error) {
          if (
            error instanceof BingersApiError &&
            (error.isRateLimited || error.isAuthError)
          ) {
            throw error;
          }
          logger.bingers.debug(
            { error, titleId: candidate.id },
            "Failed to fetch Bingers metadata grain"
          );
          return null;
        }
      }
    );
    const scored = scoredResults.filter(
      (entry): entry is { candidate: SearchTitleResult; score: number } =>
        entry !== null
    );

    scored.sort((a, b) => b.score - a.score);
    if (scored[0]?.score) {
      return scored[0].candidate;
    }

    if (opts.allowTitleFallback === false) {
      return null;
    }

    // Soft fallback only when both title and year verify — never pick an unmatched hit
    if (opts.title && Number.isFinite(opts.year)) {
      const wanted = this.normalizeTitle(opts.title);
      const byTitleAndYear = candidates.find(
        (c) =>
          c.card?.year === opts.year &&
          this.candidateTitles(c).some((t) => this.normalizeTitle(t) === wanted)
      );
      if (byTitleAndYear) {
        return byTitleAndYear;
      }
    }

    if (
      opts.preferKind === "show" &&
      opts.title &&
      !Number.isFinite(opts.year)
    ) {
      const wanted = this.normalizeTitle(opts.title);
      const titleMatches = candidates.filter(
        (candidate) =>
          candidate.kind === "show" &&
          this.candidateTitles(candidate).some(
            (title) => this.normalizeTitle(title) === wanted
          )
      );
      if (titleMatches.length === 1) {
        return titleMatches[0];
      }
    }

    return null;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }

    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(limit, items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = nextIndex++;
          if (index >= items.length) {
            break;
          }
          results[index] = await fn(items[index]);
        }
      })
    );

    return results;
  }

  private candidateTitles(candidate: SearchTitleResult): string[] {
    const titles: string[] = [];
    if (candidate.card?.originalTitle) {
      titles.push(candidate.card.originalTitle);
    }
    if (candidate.card?.titlesI18n) {
      titles.push(...Object.values(candidate.card.titlesI18n));
    }
    return titles;
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  private scoreMetadataMatch(
    metadata: MetadataGrain,
    opts: {
      imdb?: string;
      tmdb?: number;
      tvdb?: number;
      year?: number;
      preferKind: "movie" | "show";
    }
  ): number {
    let score = 0;
    const ids = metadata.external_ids ?? [];

    if (opts.imdb) {
      const imdb = opts.imdb.toLowerCase();
      if (
        ids.some(
          (e) =>
            e.source?.toLowerCase() === "imdb" &&
            String(e.id ?? "").toLowerCase() === imdb
        )
      ) {
        score += 100;
      }
    }

    if (opts.tmdb !== undefined) {
      const tmdb = String(opts.tmdb);
      if (
        ids.some(
          (e) =>
            (e.source?.toLowerCase() === "tmdb" ||
              e.source?.toLowerCase() === "themoviedb.com") &&
            String(e.id ?? "") === tmdb
        )
      ) {
        score += 80;
      }
    }

    if (opts.tvdb !== undefined) {
      const tvdb = String(opts.tvdb);
      if (
        ids.some(
          (e) =>
            e.source?.toLowerCase() === "tvdb" && String(e.id ?? "") === tvdb
        )
      ) {
        score += 80;
      }
    }

    if (score === 0) {
      return 0;
    }

    if (
      opts.year !== undefined &&
      metadata.year !== undefined &&
      metadata.year === opts.year
    ) {
      score += 10;
    }

    if (metadata.kind === opts.preferKind) {
      score += 5;
    }

    return score;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      BingersCatalogResolver.FETCH_TIMEOUT_MS
    );
    const clearFetchTimeout = () => clearTimeout(timeout);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Origin: "https://bingers.app",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        clearFetchTimeout();
        throw bingersErrorFromResponse(response.status, text);
      }

      const body = (await response.json()) as T;
      clearFetchTimeout();
      return body;
    } catch (error) {
      clearFetchTimeout();
      if (error instanceof BingersApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Bingers catalog request timed out: ${url}`);
      }
      throw error;
    }
  }
}
