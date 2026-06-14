import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddSimklFields0000000000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "simklUsername",
        type: "varchar",
        length: "255",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "simklAccessToken",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "simklClientId",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "simklThumb",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "simklThumb");
    await queryRunner.dropColumn("users", "simklClientId");
    await queryRunner.dropColumn("users", "simklAccessToken");
    await queryRunner.dropColumn("users", "simklUsername");
  }
}
