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
    expect(stats.bySource).toEqual({ plex: 2, jellyfin: 1 });
    expect(stats.byDestination).toEqual({
      trakt: 2,
      tvtime: 2,
      simkl: 0,
      bingers: 0,
    });
    expect(stats.lastFailure?.mediaTitle).toBe("Example Show");
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
