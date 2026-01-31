import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AddSyncHistory0000000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "sync_history",
        columns: [
          {
            name: "id",
            type: "varchar",
            length: "36",
            isPrimary: true,
            generationStrategy: "uuid",
          },
          {
            name: "userId",
            type: "varchar",
            length: "36",
          },
          {
            name: "mediaType",
            type: "varchar",
            length: "50",
          },
          {
            name: "mediaTitle",
            type: "varchar",
            length: "500",
          },
          {
            name: "source",
            type: "varchar",
            length: "50",
            isNullable: true,
          },
          {
            name: "tvdbEpisodeId",
            type: "varchar",
            length: "100",
            isNullable: true,
          },
          {
            name: "tvdbMovieId",
            type: "varchar",
            length: "100",
            isNullable: true,
          },
          {
            name: "imdbMovieId",
            type: "varchar",
            length: "100",
            isNullable: true,
          },
          {
            name: "imdbEpisodeId",
            type: "varchar",
            length: "100",
            isNullable: true,
          },
          {
            name: "tmdbMovieId",
            type: "varchar",
            length: "100",
            isNullable: true,
          },
          {
            name: "tmdbSeriesId",
            type: "varchar",
            length: "100",
            isNullable: true,
          },
          {
            name: "posterUrl",
            type: "text",
            isNullable: true,
          },
          {
            name: "seasonNumber",
            type: "integer",
            isNullable: true,
          },
          {
            name: "episodeNumber",
            type: "integer",
            isNullable: true,
          },
          {
            name: "year",
            type: "integer",
            isNullable: true,
          },
          {
            name: "success",
            type: "boolean",
            default: true,
          },
          {
            name: "errorMessage",
            type: "text",
            isNullable: true,
          },
          {
            name: "wasRewatched",
            type: "boolean",
            default: false,
          },
          {
            name: "destinations",
            type: "text",
            isNullable: true,
          },
          {
            name: "syncedAt",
            type: "datetime",
            default: "CURRENT_TIMESTAMP",
          },
        ],
        foreignKeys: [
          {
            columnNames: ["userId"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
        ],
      }),
      true
    );

    // Check if indexes exist before creating them (for idempotency)
    const table = await queryRunner.getTable("sync_history");
    if (table) {
      const existingIndexNames = table.indices.map((idx) => idx.name);

      if (!existingIndexNames.includes("IDX_sync_history_userId")) {
        await queryRunner.createIndex(
          "sync_history",
          new TableIndex({
            name: "IDX_sync_history_userId",
            columnNames: ["userId"],
          })
        );
      }

      if (!existingIndexNames.includes("IDX_sync_history_syncedAt")) {
        await queryRunner.createIndex(
          "sync_history",
          new TableIndex({
            name: "IDX_sync_history_syncedAt",
            columnNames: ["syncedAt"],
          })
        );
      }

      if (!existingIndexNames.includes("IDX_sync_history_success")) {
        await queryRunner.createIndex(
          "sync_history",
          new TableIndex({
            name: "IDX_sync_history_success",
            columnNames: ["success"],
          })
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("sync_history");
  }
}
