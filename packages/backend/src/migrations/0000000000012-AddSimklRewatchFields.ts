import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddSimklRewatchFields0000000000012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "simklMarkMoviesAsRewatched",
        type: "boolean",
        default: false,
        isNullable: false,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "simklMarkEpisodesAsRewatched",
        type: "boolean",
        default: false,
        isNullable: false,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "simklAccountType",
        type: "varchar",
        length: "32",
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "simklAccountType");
    await queryRunner.dropColumn("users", "simklMarkEpisodesAsRewatched");
    await queryRunner.dropColumn("users", "simklMarkMoviesAsRewatched");
  }
}
