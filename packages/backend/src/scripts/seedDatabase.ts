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

interface TMDBPerson {
  id: number;
  name: string;
  known_for: Array<{
    id: number;
    media_type: "movie" | "tv";
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path: string | null;
  }>;
}

async function fetchPopularMovies(): Promise<TMDBMovie[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`
    );
    const data = (await response.json()) as { results?: TMDBMovie[] };
    return data.results || [];
  } catch (error) {
    logger.system.warn({ error }, "Failed to fetch popular movies from TMDB");
    return [];
  }
}

async function fetchPopularTVShows(): Promise<TMDBTVShow[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`
    );
    const data = (await response.json()) as { results?: TMDBTVShow[] };
    return data.results || [];
  } catch (error) {
    logger.system.warn({ error }, "Failed to fetch popular TV shows from TMDB");
    return [];
  }
}

async function fetchPopularPeople(): Promise<TMDBPerson[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/person/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`
    );
    const data = (await response.json()) as { results?: TMDBPerson[] };
    return data.results || [];
  } catch (error) {
    logger.system.warn({ error }, "Failed to fetch popular people from TMDB");
    return [];
  }
}

const sources = ["plex", "jellyfin"];
const destinations = ["Trakt", "TVTime"];
const partialSyncErrors: Record<string, string> = {
  Trakt:
    'Trakt API error: 409 - {"watched_at":"2026-05-11T19:40:00.000Z","expires_at":"2026-05-11T20:38:00.000Z"}',
  TVTime:
    "TVTime API error: Bad Gateway - TVTime service temporarily unavailable",
};

function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBoolean(): boolean {
  return Math.random() > 0.1;
}

function generateFakeTVDBId(): string {
  return randomInt(100000, 999999).toString();
}

function generateFakeIMDBId(isMovie: boolean): string {
  if (isMovie) {
    return `tt${randomInt(1000000, 9999999)}`;
  } else {
    return `tt${randomInt(10000000, 99999999)}`;
  }
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
    const existingCount = existingHistory.length;

    if (existingCount > 0) {
      logger.system.info(`Found existing sync history entries. Clearing...`);
      await dataSource.getRepository(SyncHistory).delete({ userId: user.id });
    }

    logger.system.info("Fetching popular media from TMDB...");

    const [movies, tvShows, people] = await Promise.all([
      fetchPopularMovies(),
      fetchPopularTVShows(),
      fetchPopularPeople(),
    ]);

    const allMovies: TMDBMovie[] = [...movies];
    const allTVShows: TMDBTVShow[] = [...tvShows];

    people.forEach((person) => {
      person.known_for.forEach((item) => {
        if (item.media_type === "movie" && item.title) {
          allMovies.push({
            id: item.id,
            title: item.title,
            release_date: item.release_date || "",
            poster_path: item.poster_path,
          });
        } else if (item.media_type === "tv" && item.name) {
          allTVShows.push({
            id: item.id,
            name: item.name,
            first_air_date: item.first_air_date || "",
            poster_path: item.poster_path,
          });
        }
      });
    });

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
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const historyEntries: Partial<SyncHistory>[] = [];

    for (let i = 0; i < 250; i++) {
      const isMovie = Math.random() > 0.4;
      const mediaType = isMovie ? "movie" : "episode";
      const isPartialSync = i < 12;
      const success = isPartialSync || randomBoolean();
      const source = randomElement(sources);

      const successfulDestinations = success
        ? [randomElement(destinations)]
        : [];
      const successfulDestination = successfulDestinations[0];

      // For successful syncs, 40% chance of syncing to both destinations.
      // Partial syncs keep only the successful destination here and store the
      // failed destination in errorMessage, matching production history rows.
      if (success && !isPartialSync && Math.random() > 0.6) {
        const otherDest = destinations.find((d) => d !== successfulDestination);
        if (otherDest) {
          successfulDestinations.push(otherDest);
        }
      }

      let mediaTitle: string;
      let year: number | undefined;
      let seasonNumber: number | undefined;
      let episodeNumber: number | undefined;
      let posterUrl: string | undefined;
      let tmdbMovieId: string | undefined;
      let tmdbSeriesId: string | undefined;
      let tvdbMovieId: string | undefined;
      let tvdbEpisodeId: string | undefined;
      let imdbMovieId: string | undefined;
      let imdbEpisodeId: string | undefined;

      if (isMovie && allMovies.length > 0) {
        const movie = randomElement(allMovies);
        mediaTitle = movie.title;
        if (movie.release_date) {
          year = new Date(movie.release_date).getFullYear();
        }
        if (movie.poster_path) {
          posterUrl = `${TMDB_IMAGE_BASE}${movie.poster_path}`;
        }
        tmdbMovieId = movie.id.toString();
        tvdbMovieId = generateFakeTVDBId();
        imdbMovieId = generateFakeIMDBId(true);
      } else if (!isMovie && allTVShows.length > 0) {
        const show = randomElement(allTVShows);
        seasonNumber = randomInt(1, 5);
        episodeNumber = randomInt(1, 12);
        mediaTitle = `${show.name} - S${seasonNumber.toString().padStart(2, "0")}E${episodeNumber.toString().padStart(2, "0")}`;
        if (show.poster_path) {
          posterUrl = `${TMDB_IMAGE_BASE}${show.poster_path}`;
        }
        tmdbSeriesId = show.id.toString();
        tvdbEpisodeId = generateFakeTVDBId();
        imdbEpisodeId = generateFakeIMDBId(false);
      } else {
        continue;
      }

      let syncedAt: Date;
      if (i < 10) {
        syncedAt = randomDate(today, now);
      } else if (i < 50) {
        syncedAt = randomDate(oneWeekAgo, now);
      } else if (i < 120) {
        syncedAt = randomDate(oneMonthAgo, now);
      } else {
        syncedAt = randomDate(oneYearAgo, now);
      }

      const failedDestination = isPartialSync
        ? destinations.find(
            (destination) => destination !== successfulDestination
          )
        : success
          ? undefined
          : randomElement(destinations);
      const errorMessage = failedDestination
        ? `${failedDestination}: ${partialSyncErrors[failedDestination]}`
        : undefined;
      const wasRewatched =
        successfulDestinations.includes("TVTime") && Math.random() > 0.85;

      historyEntries.push({
        userId: user.id,
        mediaType,
        mediaTitle,
        source,
        year,
        seasonNumber,
        episodeNumber,
        posterUrl,
        tmdbMovieId,
        tmdbSeriesId,
        tvdbMovieId,
        tvdbEpisodeId,
        imdbMovieId,
        imdbEpisodeId,
        success,
        errorMessage,
        wasRewatched,
        destinations:
          successfulDestinations.length > 0
            ? JSON.stringify(successfulDestinations)
            : undefined,
        syncedAt,
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
