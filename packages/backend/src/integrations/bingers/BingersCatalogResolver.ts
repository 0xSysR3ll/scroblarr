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

export class BingersCatalogResolver {
  private static readonly FETCH_TIMEOUT_MS = 20_000;

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
    const candidates = await this.searchTitles(media.title, "movie");
    const matched = await this.pickTitleByExternalIds(candidates, {
      title: media.title,
      imdb: media.imdbMovieId,
      tmdb: media.tmdbMovieId,
      tvdb: media.tvdbMovieId,
      year: media.year,
      preferKind: "movie",
    });

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

    const candidates = await this.searchTitles(media.title, "show");
    const matched = await this.pickTitleByExternalIds(candidates, {
      // Episode IMDb is episode-level; show match relies on TMDB series + title/year
      title: media.title,
      tmdb: media.tmdbSeriesId,
      year: media.year,
      preferKind: "show",
    });

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
    }
  ): Promise<SearchTitleResult | null> {
    const scored: Array<{ candidate: SearchTitleResult; score: number }> = [];

    for (const candidate of candidates.slice(0, 12)) {
      if (!candidate.metadata) {
        continue;
      }

      try {
        const metadata = await this.fetchJson<MetadataGrain>(
          `${BINGERS_CATALOG_BASE}/catalog/${candidate.id}/metadata@${candidate.metadata}.json`
        );
        const score = this.scoreMetadataMatch(metadata, opts);
        if (score > 0) {
          scored.push({ candidate, score });
        }
      } catch (error) {
        logger.bingers.debug(
          { error, titleId: candidate.id },
          "Failed to fetch Bingers metadata grain"
        );
      }
    }

    scored.sort((a, b) => b.score - a.score);
    if (scored[0]?.score) {
      return scored[0].candidate;
    }

    // Soft fallback only when both title and year verify — never pick an unmatched hit
    if (opts.title && opts.year !== undefined) {
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

    return null;
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
      .replace(/[^a-z0-9]+/g, " ")
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
        throw bingersErrorFromResponse(response.status, text);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof BingersApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Bingers catalog request timed out: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
