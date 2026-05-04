import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddTraktFields0000000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "traktUsername",
        type: "varchar",
        length: "255",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "traktAccessToken",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "traktRefreshToken",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "traktTokenExpiresAt",
        type: "bigint",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "traktClientId",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "traktClientSecret",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "traktThumb",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "traktThumb");
    await queryRunner.dropColumn("users", "traktClientSecret");
    await queryRunner.dropColumn("users", "traktClientId");
    await queryRunner.dropColumn("users", "traktTokenExpiresAt");
    await queryRunner.dropColumn("users", "traktRefreshToken");
    await queryRunner.dropColumn("users", "traktAccessToken");
    await queryRunner.dropColumn("users", "traktUsername");
  }
}
