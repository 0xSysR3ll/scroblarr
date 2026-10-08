import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import type { dataSource as dataSourceType } from "@config/database";
import type { SyncHistory } from "@entities/SyncHistory";
import type { User } from "@entities/User";
import type { SyncHistoryRepository } from "@repositories/SyncHistoryRepository";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type DataSourceInstance = typeof dataSourceType;
type UserEntity = typeof User;
type SyncHistoryEntity = typeof SyncHistory;
type SyncHistoryRepositoryClass = typeof SyncHistoryRepository;

describe("SyncHistoryRepository integration", () => {
  let tempDir: string;
  let originalDatabasePath: string | undefined;
  let originalPostgresHost: string | undefined;
  let dataSource: DataSourceInstance;
  let UserEntity: UserEntity;
  let SyncHistoryEntity: SyncHistoryEntity;
  let RepositoryClass: SyncHistoryRepositoryClass;
  let repository: InstanceType<SyncHistoryRepositoryClass>;
  let user: User;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "scroblarr-sync-history-"));
    originalDatabasePath = process.env.DATABASE_PATH;
    originalPostgresHost = process.env.POSTGRES_HOST;
    process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
    delete process.env.POSTGRES_HOST;

    vi.resetModules();

    ({ dataSource } = await import("@config/database"));
    ({ User: UserEntity } = await import("@entities/User"));
    ({ SyncHistory: SyncHistoryEntity } =
      await import("@entities/SyncHistory"));
    ({ SyncHistoryRepository: RepositoryClass } =
      await import("@repositories/SyncHistoryRepository"));

    dataSource.setOptions({
      entities: [UserEntity, SyncHistoryEntity],
      migrations: [],
      migrationsRun: false,
      synchronize: true,
    });

    await dataSource.initialize();
    repository = new RepositoryClass();
  });

  beforeEach(async () => {
    await dataSource.getRepository(SyncHistoryEntity).clear();
    await dataSource.getRepository(UserEntity).clear();
    user = await dataSource.getRepository(UserEntity).save({
      plexUsername: "plex-user",
      jellyfinUsername: "jellyfin-user",
      jellyfinUserId: "jellyfin-id",
      enabled: true,
    });
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }
    if (originalPostgresHost === undefined) {
      delete process.env.POSTGRES_HOST;
    } else {
      process.env.POSTGRES_HOST = originalPostgresHost;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("filters, sorts, and paginates sync history for a user", async () => {
    const otherUser = await dataSource.getRepository(UserEntity).save({
      plexUsername: "other-user",
      enabled: true,
    });

    await createHistory([
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Zeta Movie",
        source: "plex",
        success: true,
        syncedAt: daysAgo(3),
      },
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Alpha Episode",
        source: "jellyfin",
        success: false,
        errorMessage: "TVTime: Timeout",
        syncedAt: daysAgo(2),
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Beta Movie",
        source: "plex",
        success: false,
        errorMessage: "Trakt: Unauthorized",
        syncedAt: daysAgo(1),
      },
      {
        userId: otherUser.id,
        mediaType: "movie",
        mediaTitle: "Other User Movie",
        source: "plex",
        success: false,
        syncedAt: daysAgo(0),
      },
    ]);

    const result = await repository.findByUserPaginated(
      user.id,
      1,
      2,
      { mediaType: "movie", success: false, source: "plex" },
      "mediaTitle",
      "ASC"
    );

    expect(result.total).toBe(1);
    expect(result.data.map((item) => item.mediaTitle)).toEqual(["Beta Movie"]);
    expect(result.data[0]?.user.id).toBe(user.id);
  });

  it("filters paginated history by Emby source", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Emby Episode",
        source: "emby",
        success: true,
        syncedAt: daysAgo(1),
      },
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Jellyfin Episode",
        source: "jellyfin",
        success: true,
        syncedAt: daysAgo(0),
      },
    ]);

    const result = await repository.findByUserPaginated(user.id, 1, 10, {
      source: "emby",
    });

    expect(result.total).toBe(1);
    expect(result.data.map((item) => item.mediaTitle)).toEqual([
      "Emby Episode",
    ]);
    expect(result.data[0]?.source).toBe("emby");
  });

  it("keeps the newest rows when clearing old history", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Oldest",
        source: "plex",
        success: true,
        syncedAt: daysAgo(4),
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Middle",
        source: "plex",
        success: true,
        syncedAt: daysAgo(3),
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Newest",
        source: "plex",
        success: true,
        syncedAt: daysAgo(2),
      },
    ]);

    const deleted = await repository.clearOldByUser(user.id, 2);
    const remaining = await repository.findByUser(user.id, 10);

    expect(deleted).toBe(1);
    expect(remaining.map((item) => item.mediaTitle)).toEqual([
      "Newest",
      "Middle",
    ]);
  });

  it("calculates user statistics from persisted history", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Example Show",
        source: "plex",
        success: true,
        destinations: JSON.stringify(["TVTime", "Trakt"]),
        tmdbSeriesId: "123",
        syncedAt: daysAgo(1),
      },
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Example Show",
        source: "jellyfin",
        success: false,
        errorMessage: "TVTime: Rate limited",
        destinations: JSON.stringify(["Trakt"]),
        tmdbSeriesId: "123",
        syncedAt: daysAgo(0),
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Example Movie",
        source: "plex",
        success: true,
        destinations: JSON.stringify(["TVTime"]),
        syncedAt: daysAgo(10),
      },
    ]);

    const stats = await repository.getStatisticsByUser(user.id);

    expect(stats.total).toBe(3);
    expect(stats.successful).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.successRate).toBe(66.67);
    expect(stats.byMediaType).toEqual({ episode: 2, movie: 1, series: 1 });
    expect(stats.bySource).toEqual({ plex: 2, jellyfin: 1, emby: 0 });
    expect(stats.byDestination).toEqual({
      trakt: 1,
      tvtime: 2,
      simkl: 0,
      bingers: 0,
    });
    expect(stats.lastFailure?.mediaTitle).toBe("Example Show");
    const utcDay = new Date().getUTCDay();
    const elapsedWeekDays = (utcDay === 0 ? 6 : utcDay - 1) + 1;
    expect(stats.pace.usualWeek).toBe(
      Math.round((3 / 4) * (elapsedWeekDays / 7) * 10) / 10
    );
  });

  it("computes pace from last 28 days and same days last month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    try {
      const now = new Date();
      const dayOfMonth = now.getUTCDate();
      const lastMonthYear =
        now.getUTCMonth() === 0
          ? now.getUTCFullYear() - 1
          : now.getUTCFullYear();
      const lastMonthIndex =
        now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
      const daysInLastMonth = new Date(
        Date.UTC(lastMonthYear, lastMonthIndex + 1, 0)
      ).getUTCDate();
      const includedDay = Math.min(dayOfMonth, daysInLastMonth);
      const sameDayLastMonth = new Date(
        Date.UTC(lastMonthYear, lastMonthIndex, includedDay, 12)
      );
      const dayAfterIncluded =
        includedDay < daysInLastMonth
          ? new Date(
              Date.UTC(lastMonthYear, lastMonthIndex, includedDay + 1, 12)
            )
          : null;
      const inLast28Days =
        sameDayLastMonth.getTime() >= now.getTime() - 28 * 24 * 60 * 60 * 1000;
      const dayAfterInLast28 =
        dayAfterIncluded != null &&
        dayAfterIncluded.getTime() >= now.getTime() - 28 * 24 * 60 * 60 * 1000;

      await createHistory([
        {
          userId: user.id,
          mediaType: "movie",
          mediaTitle: "Recent A",
          source: "plex",
          success: true,
          syncedAt: daysAgo(1),
        },
        {
          userId: user.id,
          mediaType: "movie",
          mediaTitle: "Recent B",
          source: "plex",
          success: true,
          syncedAt: daysAgo(2),
        },
        {
          userId: user.id,
          mediaType: "movie",
          mediaTitle: "Recent C",
          source: "plex",
          success: true,
          syncedAt: daysAgo(3),
        },
        {
          userId: user.id,
          mediaType: "movie",
          mediaTitle: "Recent D",
          source: "plex",
          success: true,
          syncedAt: daysAgo(4),
        },
        {
          userId: user.id,
          mediaType: "movie",
          mediaTitle: "Same Day Last Month",
          source: "plex",
          success: true,
          syncedAt: sameDayLastMonth,
        },
        ...(dayAfterIncluded
          ? [
              {
                userId: user.id,
                mediaType: "movie" as const,
                mediaTitle: "Day After Same Days Window",
                source: "plex",
                success: true,
                syncedAt: dayAfterIncluded,
              },
            ]
          : []),
        {
          userId: user.id,
          mediaType: "movie",
          mediaTitle: "Older Than 28 Days",
          source: "plex",
          success: true,
          syncedAt: new Date(
            Date.UTC(lastMonthYear, lastMonthIndex - 1, 1, 12)
          ),
        },
      ]);

      const stats = await repository.getStatisticsByUser(user.id);

      const last28Count =
        4 + (inLast28Days ? 1 : 0) + (dayAfterInLast28 ? 1 : 0);
      const elapsedWeekDays = 4;
      expect(stats.pace.usualWeek).toBe(
        Math.round((last28Count / 4) * (elapsedWeekDays / 7) * 10) / 10
      );
      expect(stats.pace.sameDaysLastMonth).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("matches existing syncs by TVDB, IMDb, and TMDB identifiers", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Show A",
        success: true,
        tvdbEpisodeId: "1001",
        seasonNumber: 1,
        episodeNumber: 1,
      },
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Show B",
        success: true,
        imdbEpisodeId: "tt2001",
        seasonNumber: 2,
        episodeNumber: 3,
      },
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Show C",
        success: true,
        tmdbSeriesId: "3001",
        seasonNumber: 1,
        episodeNumber: 2,
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Movie A",
        success: true,
        tvdbMovieId: "4001",
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Movie B",
        success: true,
        imdbMovieId: "tt5001",
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Movie C",
        success: true,
        tmdbMovieId: "6001",
      },
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Failed episode",
        success: false,
        tmdbSeriesId: "9999",
        seasonNumber: 1,
        episodeNumber: 1,
      },
    ]);

    await expect(
      repository.hasExistingSync(user.id, "episode", {
        tvdbEpisodeId: "1001",
      })
    ).resolves.toBe(true);
    await expect(
      repository.hasExistingSync(user.id, "episode", {
        imdbEpisodeId: "tt2001",
      })
    ).resolves.toBe(true);
    await expect(
      repository.hasExistingSync(user.id, "episode", {
        tmdbSeriesId: "3001",
        seasonNumber: 1,
        episodeNumber: 2,
      })
    ).resolves.toBe(true);
    await expect(
      repository.hasExistingSync(user.id, "episode", {
        tmdbSeriesId: "3001",
        seasonNumber: 1,
        episodeNumber: 9,
      })
    ).resolves.toBe(false);
    await expect(
      repository.hasExistingSync(user.id, "episode", {
        tmdbSeriesId: "9999",
        seasonNumber: 1,
        episodeNumber: 1,
      })
    ).resolves.toBe(false);

    await expect(
      repository.hasExistingSync(user.id, "movie", {
        tvdbMovieId: "4001",
      })
    ).resolves.toBe(true);
    await expect(
      repository.hasExistingSync(user.id, "movie", {
        imdbMovieId: "tt5001",
      })
    ).resolves.toBe(true);
    await expect(
      repository.hasExistingSync(user.id, "movie", {
        tmdbMovieId: "6001",
      })
    ).resolves.toBe(true);
    await expect(
      repository.hasExistingSync(user.id, "movie", {
        tmdbMovieId: "6002",
      })
    ).resolves.toBe(false);
  });

  it("matches episodes and movies by title fallback identifiers", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Fallback Show",
        success: true,
        seasonNumber: 2,
        episodeNumber: 4,
        destinations: JSON.stringify(["Bingers"]),
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Fallback Movie",
        success: true,
        year: 2010,
        destinations: JSON.stringify(["Bingers"]),
      },
    ]);

    await expect(
      repository.hasExistingSync(user.id, "episode", {
        mediaTitle: "Fallback Show",
        seasonNumber: 2,
        episodeNumber: 4,
      })
    ).resolves.toBe(true);
    await expect(
      repository.hasExistingSync(user.id, "episode", {
        mediaTitle: "Fallback Show",
        seasonNumber: 2,
        episodeNumber: 5,
      })
    ).resolves.toBe(false);
    await expect(
      repository.hasExistingSync(user.id, "movie", {
        mediaTitle: "Fallback Movie",
        year: 2010,
      })
    ).resolves.toBe(true);

    await expect(
      repository.countSuccessfulDestinationSyncs(
        user.id,
        "Bingers",
        "episode",
        {
          mediaTitle: "Fallback Show",
          seasonNumber: 2,
          episodeNumber: 4,
        }
      )
    ).resolves.toBe(1);
    await expect(
      repository.countSuccessfulDestinationSyncs(user.id, "Bingers", "movie", {
        mediaTitle: "Fallback Movie",
        year: 2010,
      })
    ).resolves.toBe(1);
  });

  it("counts episodes by title fallback when TMDB id lookup misses", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Title Only Show",
        success: true,
        seasonNumber: 1,
        episodeNumber: 3,
        destinations: JSON.stringify(["Bingers"]),
      },
    ]);

    await expect(
      repository.countSuccessfulDestinationSyncs(
        user.id,
        "Bingers",
        "episode",
        {
          tmdbSeriesId: "99999",
          mediaTitle: "Title Only Show",
          seasonNumber: 1,
          episodeNumber: 3,
        }
      )
    ).resolves.toBe(1);
  });

  it("counts destination syncs across identifier strategies", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Show A",
        success: true,
        tvdbEpisodeId: "1001",
        destinations: JSON.stringify(["Bingers"]),
      },
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Show B",
        success: true,
        imdbEpisodeId: "tt2001",
        seasonNumber: 2,
        episodeNumber: 3,
        destinations: JSON.stringify(["Bingers"]),
      },
      {
        userId: user.id,
        mediaType: "episode",
        mediaTitle: "Show C",
        success: true,
        tmdbSeriesId: "3001",
        seasonNumber: 1,
        episodeNumber: 2,
        destinations: JSON.stringify(["Bingers"]),
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Movie A",
        success: true,
        tvdbMovieId: "4001",
        destinations: JSON.stringify(["Bingers"]),
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Movie B",
        success: true,
        imdbMovieId: "tt5001",
        destinations: JSON.stringify(["Bingers"]),
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Movie C",
        success: true,
        tmdbMovieId: "6001",
        destinations: JSON.stringify(["Bingers"]),
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Movie D",
        success: true,
        year: 2010,
        destinations: JSON.stringify(["Bingers"]),
      },
    ]);

    await expect(
      repository.countSuccessfulDestinationSyncs(
        user.id,
        "Bingers",
        "episode",
        {
          tvdbEpisodeId: "1001",
        }
      )
    ).resolves.toBe(1);
    await expect(
      repository.countSuccessfulDestinationSyncs(
        user.id,
        "Bingers",
        "episode",
        {
          imdbEpisodeId: "tt2001",
        }
      )
    ).resolves.toBe(1);
    await expect(
      repository.countSuccessfulDestinationSyncs(
        user.id,
        "Bingers",
        "episode",
        {
          tmdbSeriesId: "3001",
          seasonNumber: 1,
          episodeNumber: 2,
        }
      )
    ).resolves.toBe(1);
    await expect(
      repository.countSuccessfulDestinationSyncs(user.id, "Bingers", "movie", {
        tvdbMovieId: "4001",
      })
    ).resolves.toBe(1);
    await expect(
      repository.countSuccessfulDestinationSyncs(user.id, "Bingers", "movie", {
        imdbMovieId: "tt5001",
      })
    ).resolves.toBe(1);
    await expect(
      repository.countSuccessfulDestinationSyncs(user.id, "Bingers", "movie", {
        tmdbMovieId: "6001",
      })
    ).resolves.toBe(1);
    await expect(
      repository.countSuccessfulDestinationSyncs(user.id, "Bingers", "movie", {
        mediaTitle: "Movie D",
        year: 2010,
      })
    ).resolves.toBe(1);
    await expect(
      repository.countSuccessfulDestinationSyncs(user.id, "Bingers", "movie", {
        mediaTitle: "Missing",
        year: 2099,
      })
    ).resolves.toBe(0);
    await expect(
      repository.countSuccessfulDestinationSyncs(
        user.id,
        "Bingers",
        "episode",
        {}
      )
    ).resolves.toBe(0);
    await expect(
      repository.countSuccessfulDestinationSyncs(
        user.id,
        "Bingers",
        "movie",
        {}
      )
    ).resolves.toBe(0);
  });

  it("includes Bingers in destination statistics", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Bingers Movie",
        success: true,
        destinations: JSON.stringify(["Bingers"]),
      },
    ]);

    const stats = await repository.getStatisticsByUser(user.id);
    expect(stats.byDestination.bingers).toBe(1);
  });

  it("returns empty pace and null peak when the user has no history", async () => {
    const stats = await repository.getStatisticsByUser(user.id);

    expect(stats.total).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.pace).toEqual({ usualWeek: 0, sameDaysLastMonth: 0 });
    expect(stats.peakDay).toBeNull();
    expect(stats.lastSyncedAt).toBeNull();
    expect(stats.lastFailure).toBeNull();
    expect(stats.byMediaType.series).toBe(0);
    expect(stats.topThisMonth).toEqual([]);
  });

  it("treats usualWeek as zero when all syncs are older than 28 days", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Ancient",
        success: true,
        syncedAt: daysAgo(40),
      },
    ]);

    const stats = await repository.getStatisticsByUser(user.id);
    expect(stats.total).toBe(1);
    expect(stats.pace.usualWeek).toBe(0);
  });

  it("computes week start from Sunday with UTC fake timers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T15:00:00.000Z")); // Sunday

    try {
      await createHistory([
        {
          userId: user.id,
          mediaType: "movie",
          mediaTitle: "Sunday Watch",
          success: true,
          syncedAt: new Date("2026-10-04T12:00:00.000Z"),
        },
        {
          userId: user.id,
          mediaType: "movie",
          mediaTitle: "Prior Saturday",
          success: true,
          syncedAt: new Date("2026-10-03T12:00:00.000Z"),
        },
      ]);

      const stats = await repository.getStatisticsByUser(user.id);
      expect(stats.byPeriod.thisWeek).toBe(2);
      expect(stats.byPeriod.today).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to syncedAt sort for invalid sort fields", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Older",
        success: true,
        syncedAt: daysAgo(2),
      },
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Newer",
        success: true,
        syncedAt: daysAgo(0),
      },
    ]);

    const result = await repository.findByUserPaginated(
      user.id,
      1,
      10,
      undefined,
      "notAField",
      "DESC"
    );

    expect(result.data.map((item) => item.mediaTitle)).toEqual([
      "Newer",
      "Older",
    ]);
  });

  it("returns zero when clearOldByUser has nothing to remove", async () => {
    await createHistory([
      {
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Only",
        success: true,
      },
    ]);

    await expect(repository.clearOldByUser(user.id, 5)).resolves.toBe(0);
    await expect(repository.countByUser(user.id)).resolves.toBe(1);
  });

  it("covers create, save, find, count, and delete helpers", async () => {
    const created = await repository.create({
      userId: user.id,
      mediaType: "movie",
      mediaTitle: "Created Movie",
      source: "plex",
      success: true,
      wasRewatched: false,
      syncedAt: daysAgo(0),
    });
    expect(created.mediaTitle).toBe("Created Movie");

    created.mediaTitle = "Saved Movie";
    const saved = await repository.save(created);
    expect(saved.mediaTitle).toBe("Saved Movie");

    await expect(repository.count()).resolves.toBe(1);
    await expect(repository.countByUser(user.id)).resolves.toBe(1);

    const recent = await repository.findRecent(10);
    expect(recent.map((item) => item.mediaTitle)).toEqual(["Saved Movie"]);

    const byId = await repository.findById(saved.id);
    expect(byId?.mediaTitle).toBe("Saved Movie");

    const byIdForUser = await repository.findById(saved.id, user.id);
    expect(byIdForUser?.id).toBe(saved.id);

    await expect(
      repository.findById(saved.id, "missing-user")
    ).resolves.toBeNull();

    const second = await repository.create({
      userId: user.id,
      mediaType: "episode",
      mediaTitle: "Second",
      source: "plex",
      success: true,
      wasRewatched: false,
      syncedAt: daysAgo(1),
    });

    await expect(repository.deleteByIds([second.id], user.id)).resolves.toBe(1);
    await expect(repository.deleteByIds(["missing-id"], user.id)).resolves.toBe(
      0
    );
    await expect(repository.deleteById(saved.id, user.id)).resolves.toBe(true);
    await expect(repository.deleteById(saved.id, user.id)).resolves.toBe(false);

    await repository.create({
      userId: user.id,
      mediaType: "movie",
      mediaTitle: "Clear Me",
      source: "plex",
      success: true,
      wasRewatched: false,
    });
    await repository.clearByUser(user.id);
    await expect(repository.countByUser(user.id)).resolves.toBe(0);

    await repository.create({
      userId: user.id,
      mediaType: "movie",
      mediaTitle: "Clear All",
      source: "plex",
      success: true,
      wasRewatched: false,
    });
    await repository.clearAll();
    await expect(repository.count()).resolves.toBe(0);
  });

  async function createHistory(items: Array<Partial<SyncHistory>>) {
    await dataSource.getRepository(SyncHistoryEntity).save(
      items.map((item) => ({
        userId: user.id,
        mediaType: "movie",
        mediaTitle: "Untitled",
        source: "plex",
        success: true,
        wasRewatched: false,
        ...item,
      }))
    );
  }

  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
});
