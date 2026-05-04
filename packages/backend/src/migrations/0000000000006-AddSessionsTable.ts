import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddSessionsTable0000000000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "sessions",
        columns: [
          {
            name: "id",
            type: "varchar",
            length: "36",
            isPrimary: true,
          },
          {
            name: "userId",
            type: "varchar",
            length: "36",
          },
          {
            name: "token",
            type: "varchar",
            length: "500",
            isUnique: true,
          },
          {
            name: "expiresAt",
            type: "bigint",
          },
        ],
      }),
      true
    );

    await queryRunner.query(
      `INSERT INTO sessions (id, "userId", token, "expiresAt")
       SELECT "sessionToken", id, "sessionToken", "sessionTokenExpiresAt"
       FROM users
       WHERE "sessionToken" IS NOT NULL AND "sessionToken" != '' AND "sessionTokenExpiresAt" IS NOT NULL`
    );

    await queryRunner.dropColumn("users", "sessionToken");
    await queryRunner.dropColumn("users", "sessionTokenExpiresAt");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      await (async () => {
        const { TableColumn } = await import("typeorm");
        return new TableColumn({
          name: "sessionToken",
          type: "varchar",
          length: "500",
          isNullable: true,
        });
      })()
    );
    await queryRunner.addColumn(
      "users",
      await (async () => {
        const { TableColumn } = await import("typeorm");
        return new TableColumn({
          name: "sessionTokenExpiresAt",
          type: "bigint",
          isNullable: true,
        });
      })()
    );

    await queryRunner.query(
      `UPDATE users SET "sessionToken" = (SELECT token FROM sessions s WHERE s."userId" = users.id ORDER BY s."expiresAt" DESC LIMIT 1), "sessionTokenExpiresAt" = (SELECT "expiresAt" FROM sessions s WHERE s."userId" = users.id ORDER BY s."expiresAt" DESC LIMIT 1) WHERE id IN (SELECT "userId" FROM sessions)`
    );

    await queryRunner.dropTable("sessions");
  }
}
