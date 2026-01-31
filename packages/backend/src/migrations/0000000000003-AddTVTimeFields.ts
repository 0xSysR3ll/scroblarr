import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddTVTimeFields0000000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "tvtimeAccessToken",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "tvtimeRefreshToken",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "tvtimeEmail",
        type: "varchar",
        length: "255",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "tvtimePassword",
        type: "text",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "tvtimeMarkMoviesAsRewatched",
        type: "boolean",
        default: false,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "tvtimeMarkEpisodesAsRewatched",
        type: "boolean",
        default: false,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "tvtimeThumb",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "tvtimeThumb");
    await queryRunner.dropColumn("users", "tvtimeMarkEpisodesAsRewatched");
    await queryRunner.dropColumn("users", "tvtimeMarkMoviesAsRewatched");
    await queryRunner.dropColumn("users", "tvtimePassword");
    await queryRunner.dropColumn("users", "tvtimeEmail");
    await queryRunner.dropColumn("users", "tvtimeRefreshToken");
    await queryRunner.dropColumn("users", "tvtimeAccessToken");
  }
}
