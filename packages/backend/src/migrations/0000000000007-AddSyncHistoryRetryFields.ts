import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddSyncHistoryRetryFields0000000000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "sync_history",
      new TableColumn({
        name: "originalMediaId",
        type: "varchar",
        length: "255",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "sync_history",
      new TableColumn({
        name: "retriedAt",
        type: "timestamp",
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("sync_history", "retriedAt");
    await queryRunner.dropColumn("sync_history", "originalMediaId");
  }
}
