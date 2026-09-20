import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import type { dataSource as dataSourceType } from "@config/database";
import type { User } from "@entities/User";
import type { SessionRepository } from "@repositories/SessionRepository";
import type { SettingsRepository } from "@repositories/SettingsRepository";
import type { SyncHistoryRepository } from "@repositories/SyncHistoryRepository";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type DataSourceInstance = typeof dataSourceType;
type SessionRepositoryClass = typeof SessionRepository;
type SettingsRepositoryClass = typeof SettingsRepository;
type SyncHistoryRepositoryClass = typeof SyncHistoryRepository;
type UserEntity = typeof User;

/**
 * Upgrade-safety suite for TypeORM 1.x / better-sqlite3 majors.
 * Boots like production (migrationsRun, no synchronize) and exercises
 * repositories that depend on relation/select APIs and migration helpers.
 *
 * Migrations/entities are passed as classes so Vitest transforms them;
 * TypeORM's filesystem glob loader cannot parse raw .ts in this runner.
 */
describe("database upgrade (SQLite migrations + repositories)", () => {
  let tempDir: string;
  let originalDatabasePath: string | undefined;
  let originalPostgresHost: string | undefined;
  let dataSource: DataSourceInstance;
  let UserEntity: UserEntity;
  let sessionRepository: InstanceType<SessionRepositoryClass>;
  let settingsRepository: InstanceType<SettingsRepositoryClass>;
  let syncHistoryRepository: InstanceType<SyncHistoryRepositoryClass>;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "scroblarr-db-upgrade-"));
    originalDatabasePath = process.env.DATABASE_PATH;
    originalPostgresHost = process.env.POSTGRES_HOST;
    process.env.DATABASE_PATH = path.join(tempDir, "upgrade.sqlite");
    delete process.env.POSTGRES_HOST;

    vi.resetModules();

    ({ dataSource } = await import("@config/database"));
    ({ User: UserEntity } = await import("@entities/User"));
    const { Session } = await import("@entities/Session");
    const { Settings } = await import("@entities/Settings");
    const { SyncHistory } = await import("@entities/SyncHistory");
    const { SessionRepository: SessionRepositoryClass } =
      await import("@repositories/SessionRepository");
    const { SettingsRepository: SettingsRepositoryClass } =
      await import("@repositories/SettingsRepository");
    const { SyncHistoryRepository: SyncHistoryRepositoryClass } =
      await import("@repositories/SyncHistoryRepository");

    const { InitialMigration0000000000001 } =
      await import("../migrations/0000000000001-InitialMigration");
    const { AddSettings0000000000002 } =
      await import("../migrations/0000000000002-AddSettings");
    const { AddTVTimeFields0000000000003 } =
      await import("../migrations/0000000000003-AddTVTimeFields");
    const { AddSyncHistory0000000000004 } =
      await import("../migrations/0000000000004-AddSyncHistory");
    const { AddTraktFields0000000000005 } =
      await import("../migrations/0000000000005-AddTraktFields");
    const { AddSessionsTable0000000000006 } =
      await import("../migrations/0000000000006-AddSessionsTable");
    const { AddSyncHistoryRetryFields0000000000007 } =
      await import("../migrations/0000000000007-AddSyncHistoryRetryFields");
    const { AddSimklFields0000000000008 } =
      await import("../migrations/0000000000008-AddSimklFields");
    const { AddSyncHistoryDestinationResults0000000000009 } =
      await import("../migrations/0000000000009-AddSyncHistoryDestinationResults");
    const { AddBingersFields0000000000010 } =
      await import("../migrations/0000000000010-AddBingersFields");

    dataSource.setOptions({
      synchronize: false,
      migrationsRun: true,
      entities: [UserEntity, Session, Settings, SyncHistory],
      migrations: [
        InitialMigration0000000000001,
        AddSettings0000000000002,
        AddTVTimeFields0000000000003,
        AddSyncHistory0000000000004,
        AddTraktFields0000000000005,
        AddSessionsTable0000000000006,
        AddSyncHistoryRetryFields0000000000007,
        AddSimklFields0000000000008,
        AddSyncHistoryDestinationResults0000000000009,
        AddBingersFields0000000000010,
      ],
    });

    await dataSource.initialize();

    sessionRepository = new SessionRepositoryClass();
    settingsRepository = new SettingsRepositoryClass();
    syncHistoryRepository = new SyncHistoryRepositoryClass();
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

  it("applies every migration on an empty SQLite database", async () => {
    expect(dataSource.options.type).toBe("better-sqlite3");
    expect(dataSource.options.synchronize).toBe(false);

    const executed = await dataSource.query(
      "SELECT name FROM migrations ORDER BY id ASC"
    );
    expect(executed).toHaveLength(10);
    expect(dataSource.migrations).toHaveLength(10);

    const syncColumns: Array<{ name: string }> = await dataSource.query(
      "PRAGMA table_info('sync_history')"
    );
    const columnNames = new Set(syncColumns.map((column) => column.name));
    // Migration 0007 (uses queryRunner.dataSource) + later upgrade columns
    expect(columnNames.has("originalMediaId")).toBe(true);
    expect(columnNames.has("retriedAt")).toBe(true);
    expect(columnNames.has("destinationResults")).toBe(true);

    const userColumns: Array<{ name: string }> = await dataSource.query(
      "PRAGMA table_info('users')"
    );
    expect(userColumns.some((column) => column.name === "bingersUserId")).toBe(
      true
    );

    const tables: Array<{ name: string }> = await dataSource.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );
    const tableNames = tables.map((table) => table.name);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "users",
        "settings",
        "sync_history",
        "sessions",
        "migrations",
      ])
    );
  });

  it("loads session user relations and rejects expired or disabled sessions", async () => {
    const user = await dataSource.getRepository(UserEntity).save({
      plexUsername: "upgrade-session-user",
      enabled: true,
    });

    const token = await sessionRepository.createSession(
      user.id,
      60 * 60 * 1000
    );
    const loaded = await sessionRepository.findUserByToken(token);
    expect(loaded?.id).toBe(user.id);
    expect(loaded?.plexUsername).toBe("upgrade-session-user");

    await expect(
      sessionRepository.findUserByToken("missing")
    ).resolves.toBeNull();

    const expiredToken = await sessionRepository.createSession(user.id, -1);
    await expect(
      sessionRepository.findUserByToken(expiredToken)
    ).resolves.toBeNull();

    const disabled = await dataSource.getRepository(UserEntity).save({
      plexUsername: "upgrade-disabled-user",
      enabled: false,
    });
    const disabledToken = await sessionRepository.createSession(
      disabled.id,
      60 * 60 * 1000
    );
    await expect(
      sessionRepository.findUserByToken(disabledToken)
    ).resolves.toBeNull();
  });

  it("persists settings and sync history after migrations", async () => {
    await settingsRepository.set("tmdb_api_key", "test-key");
    await expect(settingsRepository.get("tmdb_api_key")).resolves.toBe(
      "test-key"
    );
    await expect(settingsRepository.getAll()).resolves.toMatchObject({
      tmdb_api_key: "test-key",
    });

    const user = await dataSource.getRepository(UserEntity).save({
      plexUsername: "upgrade-sync-user",
      enabled: true,
    });

    const history = await syncHistoryRepository.create({
      userId: user.id,
      mediaType: "movie",
      mediaTitle: "Upgrade Movie",
      success: true,
      source: "plex",
      destinations: '["trakt"]',
      tmdbMovieId: "42",
    });

    const byId = await syncHistoryRepository.findById(history.id, user.id);
    expect(byId?.mediaTitle).toBe("Upgrade Movie");
    expect(byId?.user?.id).toBe(user.id);

    const recent = await syncHistoryRepository.findRecent(5);
    expect(recent.some((row) => row.id === history.id)).toBe(true);
    expect(recent.find((row) => row.id === history.id)?.user?.id).toBe(user.id);

    await expect(
      syncHistoryRepository.hasExistingSync(user.id, "movie", {
        tmdbMovieId: "42",
      })
    ).resolves.toBe(true);
  });

  it("is idempotent when migrations have already run", async () => {
    const pending = await dataSource.showMigrations();
    expect(pending).toBe(false);

    const ran = await dataSource.runMigrations();
    expect(ran).toEqual([]);
  });
});
