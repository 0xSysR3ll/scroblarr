import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddSimklOAuthV2Fields0000000000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "simklRefreshToken",
        type: "varchar",
        length: "500",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "simklTokenExpiresAt",
        type: "bigint",
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "simklTokenExpiresAt");
    await queryRunner.dropColumn("users", "simklRefreshToken");
  }
}
