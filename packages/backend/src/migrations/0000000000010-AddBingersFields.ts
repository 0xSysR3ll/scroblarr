import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddBingersFields0000000000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "bingersCookieJar",
        type: "text",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "bingersSessionExpiresAt",
        type: "bigint",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "bingersEmail",
        type: "varchar",
        length: "255",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "bingersUserId",
        type: "varchar",
        length: "255",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "bingersUsername",
        type: "varchar",
        length: "255",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "bingersThumb",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "bingersMarkMoviesAsRewatched",
        type: "boolean",
        default: false,
        isNullable: false,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "bingersMarkEpisodesAsRewatched",
        type: "boolean",
        default: false,
        isNullable: false,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "bingersMarkEpisodesAsRewatched");
    await queryRunner.dropColumn("users", "bingersMarkMoviesAsRewatched");
    await queryRunner.dropColumn("users", "bingersThumb");
    await queryRunner.dropColumn("users", "bingersUsername");
    await queryRunner.dropColumn("users", "bingersUserId");
    await queryRunner.dropColumn("users", "bingersEmail");
    await queryRunner.dropColumn("users", "bingersSessionExpiresAt");
    await queryRunner.dropColumn("users", "bingersCookieJar");
  }
}
