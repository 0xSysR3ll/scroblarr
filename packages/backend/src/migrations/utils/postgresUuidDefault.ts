import type { QueryRunner } from "typeorm";

/**
 * For varchar(36) PKs, TypeORM omits `id` on INSERT for Postgres more often than
 * for SQLite. A DB default fills the column. SQLite keeps using ORM-generated UUIDs.
 */
export async function setPostgresUuidTextColumnDefault(
  queryRunner: QueryRunner,
  tableName: string,
  columnName: string
): Promise<void> {
  if (queryRunner.connection.options.type !== "postgres") {
    return;
  }
  await queryRunner.query(
    `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET DEFAULT gen_random_uuid()::text`
  );
}
