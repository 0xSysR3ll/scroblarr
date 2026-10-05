import "reflect-metadata";
import { dataSource } from "@config/database";
import { SyncHistory } from "@entities/SyncHistory";
import { SyncHistoryRepository } from "@repositories/SyncHistoryRepository";
import { UserRepository } from "@repositories/UserRepository";
import { logger } from "@utils/logger";

const TMDB_API_KEY = "93c692ae360a4f64bf331664f7d8deba";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
}

interface TMDBTVShow {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
}

async function fetchTmdbList<T>(path: string): Promise<T[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}${path}${path.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}&language=en-US`
    );
    if (!response.ok) {
      logger.system.warn(
        { path, status: response.status },
        "TMDB list request failed"
      );
      return [];
    }
    const data = (await response.json()) as { results?: T[] };
    return data.results || [];
  } catch (error) {
    logger.system.warn({ error, path }, "Failed to fetch TMDB list");
    return [];
  }
}

async function fetchRecentPopularMovies(): Promise<TMDBMovie[]> {
  const [
    popular1,
    popular2,
    popular3,
    popular4,
    nowPlaying,
    trending,
    topRated,
  ] = await Promise.all([
    fetchTmdbList<TMDBMovie>("/movie/popular?page=1"),
    fetchTmdbList<TMDBMovie>("/movie/popular?page=2"),
    fetchTmdbList<TMDBMovie>("/movie/popular?page=3"),
    fetchTmdbList<TMDBMovie>("/movie/popular?page=4"),
    fetchTmdbList<TMDBMovie>("/movie/now_playing?page=1"),
    fetchTmdbList<TMDBMovie>("/trending/movie/week"),
    fetchTmdbList<TMDBMovie>("/movie/top_rated?page=1"),
  ]);

  const byId = new Map<number, TMDBMovie>();
  for (const movie of [
    ...trending,
    ...nowPlaying,
    ...popular1,
    ...popular2,
    ...popular3,
    ...popular4,
    ...topRated,
  ]) {
    if (movie?.id && movie.title) {
      byId.set(movie.id, movie);
    }
  }
  return [...byId.values()];
}

async function fetchRecentPopularTVShows(): Promise<TMDBTVShow[]> {
  const [popular1, popular2, onTheAir, trending] = await Promise.all([
    fetchTmdbList<TMDBTVShow>("/tv/popular?page=1"),
    fetchTmdbList<TMDBTVShow>("/tv/popular?page=2"),
    fetchTmdbList<TMDBTVShow>("/tv/on_the_air?page=1"),
    fetchTmdbList<TMDBTVShow>("/trending/tv/week"),
  ]);

  const byId = new Map<number, TMDBTVShow>();
  for (const show of [...trending, ...onTheAir, ...popular1, ...popular2]) {
    if (show?.id && show.name) {
      byId.set(show.id, show);
    }
  }
  return [...byId.values()];
}

const sources = ["plex", "jellyfin", "emby"] as const;
type SeedDestination = "Trakt" | "Simkl" | "Bingers";
const partialSyncErrors: Record<SeedDestination, string> = {
  Trakt:
    'Trakt API error: 409 - {"watched_at":"2026-05-11T19:40:00.000Z","expires_at":"2026-05-11T20:38:00.000Z"}',
  Simkl: "Simkl API error: 503 - Service temporarily unavailable",
  Bingers: "Bingers API error: Network timeout",
};

function randomElement<T>(array: readonly T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateFakeTVDBId(): string {
  return randomInt(100000, 999999).toString();
}

function generateFakeIMDBId(isMovie: boolean): string {
  if (isMovie) {
    return `tt${randomInt(1000000, 9999999)}`;
  }
  return `tt${randomInt(10000000, 99999999)}`;
}

interface OrderedEpisode {
  show: TMDBTVShow;
  seasonNumber: number;
  episodeNumber: number;
  source: (typeof sources)[number];
}

function buildOrderedEpisodes(
  shows: TMDBTVShow[],
  count: number
): OrderedEpisode[] {
  if (shows.length === 0 || count <= 0) {
    return [];
  }

  const episodes: OrderedEpisode[] = [];
  const usedKeys = new Set<string>();
  const nextEpisode = new Map<number, { season: number; episode: number }>();
  const shuffledShows = [...shows].sort(() => Math.random() - 0.5);
  let showCursor = 0;
  const EPISODES_PER_SEASON = 10;
  const MAX_SEASON = 5;
  let idlePasses = 0;

  while (episodes.length < count && idlePasses < shuffledShows.length * 2) {
    const show = shuffledShows[showCursor % shuffledShows.length];
    showCursor++;

    const progress = nextEpisode.get(show.id) ?? { season: 1, episode: 1 };
    if (progress.season > MAX_SEASON) {
      idlePasses++;
      continue;
    }

    const source = randomElement(sources);
    let seasonNumber = progress.season;
    let episodeNumber = progress.episode;
    const runLength = Math.min(randomInt(4, 8), count - episodes.length);
    let added = 0;

    for (let i = 0; i < runLength && episodes.length < count; i++) {
      if (episodeNumber > EPISODES_PER_SEASON) {
        seasonNumber += 1;
        episodeNumber = 1;
      }
      if (seasonNumber > MAX_SEASON) {
        break;
      }

      const key = `${show.id}:S${seasonNumber}E${episodeNumber}`;
      if (usedKeys.has(key)) {
        episodeNumber += 1;
        continue;
      }

      usedKeys.add(key);
      episodes.push({ show, seasonNumber, episodeNumber, source });
      added++;
      episodeNumber += 1;
    }

    nextEpisode.set(show.id, { season: seasonNumber, episode: episodeNumber });
    if (added === 0) {
      idlePasses++;
    } else {
      idlePasses = 0;
    }
  }

  return episodes;
}

function eveningOnDay(day: Date, now: Date): Date {
  const d = new Date(day);
  d.setHours(randomInt(19, 22), randomInt(0, 59), randomInt(0, 59), 0);
  if (d.getTime() > now.getTime()) {
    return new Date(now.getTime() - randomInt(45, 180) * 60 * 1000);
  }
  return d;
}

function buildRealisticWatchTimes(count: number, now: Date): Date[] {
  if (count <= 0) {
    return [];
  }

  const dayStartsNewestFirst: Date[] = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  dayStartsNewestFirst.push(new Date(cursor));
  cursor.setDate(cursor.getDate() - 1);

  while (dayStartsNewestFirst.length < count) {
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    let watches: number;
    if (isWeekend) {
      watches = randomInt(1, 2);
    } else {
      watches = Math.random() > 0.2 ? 1 : 0;
    }

    for (let w = 0; w < watches && dayStartsNewestFirst.length < count; w++) {
      dayStartsNewestFirst.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  const dayStarts = dayStartsNewestFirst.reverse();
  const times: Date[] = [];
  let previousMs = 0;

  for (let i = 0; i < dayStarts.length; i++) {
    const sameDayAsPrev =
      i > 0 && dayStarts[i].getTime() === dayStarts[i - 1].getTime();
    const t = eveningOnDay(dayStarts[i], now);

    if (sameDayAsPrev) {
      t.setHours(
        Math.min(Math.max(t.getHours(), 21), 23),
        randomInt(0, 59),
        0,
        0
      );
    }

    if (t.getTime() <= previousMs) {
      t.setTime(previousMs + 60 * 60 * 1000);
    }
    if (t.getTime() > now.getTime()) {
      t.setTime(Math.max(previousMs + 60 * 1000, now.getTime() - 60 * 1000));
    }

    times.push(t);
    previousMs = t.getTime();
  }

  return times;
}

type SeedWatchItem =
  | { kind: "episode"; episode: OrderedEpisode }
  | { kind: "movie"; movie: TMDBMovie };

function buildWatchPlan(
  episodes: OrderedEpisode[],
  movies: TMDBMovie[]
): SeedWatchItem[] {
  const plan: SeedWatchItem[] = [];
  const movieQueue = [...movies];
  const tonightMovie = movieQueue.length > 0 ? movieQueue.shift()! : undefined;

  const runs: OrderedEpisode[][] = [];
  let current: OrderedEpisode[] = [];
  for (const ep of episodes) {
    const prev = current[current.length - 1];
    if (
      prev &&
      prev.show.id === ep.show.id &&
      (prev.seasonNumber < ep.seasonNumber ||
        (prev.seasonNumber === ep.seasonNumber &&
          prev.episodeNumber + 1 === ep.episodeNumber))
    ) {
      current.push(ep);
    } else {
      if (current.length) {
        runs.push(current);
      }
      current = [ep];
    }
  }
  if (current.length) {
    runs.push(current);
  }

  for (const run of runs) {
    for (const episode of run) {
      plan.push({ kind: "episode", episode });
    }
    if (movieQueue.length > 0 && Math.random() > 0.3) {
      plan.push({ kind: "movie", movie: movieQueue.shift()! });
    }
  }

  while (movieQueue.length > 0) {
    plan.unshift({ kind: "movie", movie: movieQueue.shift()! });
  }

  if (tonightMovie) {
    plan.push({ kind: "movie", movie: tonightMovie });
  }

  return plan;
}

function pickDestinations(
  linkedDestinations: readonly SeedDestination[],
  isPartialSync: boolean
): {
  successfulDestinations: string[];
  failedDestination?: SeedDestination;
} {
  if (linkedDestinations.length === 0) {
    return { successfulDestinations: [] };
  }

  if (!isPartialSync) {
    return { successfulDestinations: [...linkedDestinations] };
  }

  const failedDestination = randomElement(linkedDestinations);
  return {
    successfulDestinations: linkedDestinations.filter(
      (d) => d !== failedDestination
    ),
    failedDestination,
  };
}

function toHistoryEntry(
  userId: string,
  item: SeedWatchItem,
  syncedAt: Date,
  index: number,
  profile: {
    source: (typeof sources)[number];
    linkedDestinations: readonly SeedDestination[];
  }
): Partial<SyncHistory> {
  const isPartialSync = index === 4 || index === 11;
  const { successfulDestinations, failedDestination } = pickDestinations(
    profile.linkedDestinations,
    isPartialSync
  );
  const success = successfulDestinations.length > 0;

  const base = {
    userId,
    success,
    errorMessage: failedDestination
      ? `${failedDestination}: ${partialSyncErrors[failedDestination]}`
      : undefined,
    wasRewatched: false,
    destinations:
      successfulDestinations.length > 0
        ? JSON.stringify(successfulDestinations)
        : undefined,
    syncedAt,
    source: profile.source,
  };

  if (item.kind === "movie") {
    const movie = item.movie;
    return {
      ...base,
      mediaType: "movie",
      mediaTitle: movie.title,
      year: movie.release_date
        ? new Date(movie.release_date).getFullYear()
        : undefined,
      posterUrl: movie.poster_path
        ? `${TMDB_IMAGE_BASE}${movie.poster_path}`
        : undefined,
      tmdbMovieId: movie.id.toString(),
      tvdbMovieId: generateFakeTVDBId(),
      imdbMovieId: generateFakeIMDBId(true),
    };
  }

  const ep = item.episode;
  const seasonLabel = ep.seasonNumber.toString().padStart(2, "0");
  const episodeLabel = ep.episodeNumber.toString().padStart(2, "0");
  return {
    ...base,
    mediaType: "episode",
    mediaTitle: `${ep.show.name} - S${seasonLabel}E${episodeLabel}`,
    year: ep.show.first_air_date
      ? new Date(ep.show.first_air_date).getFullYear()
      : undefined,
    seasonNumber: ep.seasonNumber,
    episodeNumber: ep.episodeNumber,
    posterUrl: ep.show.poster_path
      ? `${TMDB_IMAGE_BASE}${ep.show.poster_path}`
      : undefined,
    tmdbSeriesId: ep.show.id.toString(),
    tvdbEpisodeId: generateFakeTVDBId(),
    imdbEpisodeId: generateFakeIMDBId(false),
  };
}

async function seedDatabase() {
  try {
    await dataSource.initialize();
    logger.system.info("Database connected");

    const userRepository = new UserRepository();
    const syncHistoryRepository = new SyncHistoryRepository();

    let user = await userRepository.findAdmin();
    if (!user) {
      const allUsers = await userRepository.findAll();
      user = allUsers[0];
    }

    if (!user) {
      logger.system.info("No user found, creating admin user...");
      user = await userRepository.create({
        displayName: "Admin User",
        email: "admin@example.com",
        isAdmin: true,
        enabled: true,
        plexUsername: "admin",
      });
      logger.system.info(`Created user: ${user.id}`);
    } else {
      logger.system.info(
        `Using existing user: ${user.id} (${user.displayName || user.plexUsername || user.jellyfinUsername || "Unknown"})`
      );
    }

    const existingHistory = await syncHistoryRepository.findByUser(user.id, 1);
    if (existingHistory.length > 0) {
      logger.system.info("Found existing sync history entries. Clearing...");
      await dataSource.getRepository(SyncHistory).delete({ userId: user.id });
    }

    logger.system.info("Fetching recent popular / trending media from TMDB...");

    const [allMovies, allTVShows] = await Promise.all([
      fetchRecentPopularMovies(),
      fetchRecentPopularTVShows(),
    ]);

    logger.system.info(
      { movies: allMovies.length, tvShows: allTVShows.length },
      "Fetched media from TMDB"
    );

    if (allMovies.length === 0 && allTVShows.length === 0) {
      logger.system.error("No media fetched from TMDB, using fallback data");
      throw new Error("Failed to fetch media from TMDB");
    }

    logger.system.info("Generating sync history data...");

    const now = new Date();
    const targetMovieCount = 150;
    const targetEpisodeCount = 100;

    const profile = {
      source: randomElement(sources),
      linkedDestinations: ["Trakt", "Simkl", "Bingers"] as const,
    };
    logger.system.info(
      {
        source: profile.source,
        destinations: profile.linkedDestinations,
      },
      "Seed user profile"
    );

    const orderedEpisodes = buildOrderedEpisodes(
      allTVShows,
      targetEpisodeCount
    );
    const uniqueMovies = [...allMovies]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(targetMovieCount, allMovies.length));

    const plan = buildWatchPlan(orderedEpisodes, uniqueMovies);
    const rewatchCount = 2;
    const times = buildRealisticWatchTimes(plan.length + rewatchCount, now);

    const historyEntries: Partial<SyncHistory>[] = plan.map((item, index) =>
      toHistoryEntry(user.id, item, times[index], index, profile)
    );

    const rewatchSources = [
      historyEntries.find((entry) => entry.mediaType === "movie"),
      historyEntries.find((entry) => entry.mediaType === "episode"),
    ].filter((entry): entry is Partial<SyncHistory> => Boolean(entry));

    for (let i = 0; i < rewatchSources.length; i++) {
      const original = rewatchSources[i];
      historyEntries.push({
        userId: user.id,
        mediaType: original.mediaType,
        mediaTitle: original.mediaTitle,
        source: profile.source,
        year: original.year,
        seasonNumber: original.seasonNumber,
        episodeNumber: original.episodeNumber,
        posterUrl: original.posterUrl,
        tmdbMovieId: original.tmdbMovieId,
        tmdbSeriesId: original.tmdbSeriesId,
        tvdbMovieId: original.tvdbMovieId,
        tvdbEpisodeId: original.tvdbEpisodeId,
        imdbMovieId: original.imdbMovieId,
        imdbEpisodeId: original.imdbEpisodeId,
        success: true,
        errorMessage: undefined,
        wasRewatched: true,
        destinations: JSON.stringify([...profile.linkedDestinations]),
        syncedAt: times[plan.length + i],
      });
    }

    logger.system.info(
      `Inserting ${historyEntries.length} sync history entries...`
    );

    let entriesWithDestinations = 0;
    for (const entry of historyEntries) {
      if (entry.destinations) {
        entriesWithDestinations++;
      }
      await syncHistoryRepository.create(entry);
    }

    logger.system.info(
      { entriesWithDestinations, totalEntries: historyEntries.length },
      "Destinations verification"
    );

    const stats = await syncHistoryRepository.getStatisticsByUser(user.id);

    const byDay = new Map<string, number>();
    for (const entry of historyEntries) {
      if (!entry.syncedAt) {
        continue;
      }
      const key = entry.syncedAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + 1);
    }
    const maxPerDay = Math.max(0, ...byDay.values());

    logger.system.info(
      {
        total: stats.total,
        successful: stats.successful,
        failed: stats.failed,
        successRate: `${stats.successRate.toFixed(1)}%`,
        episodes: stats.byMediaType.episode,
        movies: stats.byMediaType.movie,
        today: stats.byPeriod.today,
        thisWeek: stats.byPeriod.thisWeek,
        thisMonth: stats.byPeriod.thisMonth,
        maxWatchesPerDay: maxPerDay,
      },
      `✅ Successfully seeded database with ${stats.total} sync history entries!`
    );

    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    logger.system.error({ error }, "Failed to seed database");
    process.exit(1);
  }
}

seedDatabase();
