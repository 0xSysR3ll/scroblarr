import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddSyncHistoryDestinationResults0000000000009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "sync_history",
      new TableColumn({
        name: "destinationResults",
        type: "text",
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("sync_history", "destinationResults");
  }
}
