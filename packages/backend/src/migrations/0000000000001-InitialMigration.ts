import { MigrationInterface, QueryRunner, Table } from "typeorm";

import { setPostgresUuidTextColumnDefault } from "./utils/postgresUuidDefault";

export class InitialMigration0000000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "users",
        columns: [
          {
            name: "id",
            type: "varchar",
            length: "36",
            isPrimary: true,
            generationStrategy: "uuid",
          },
          {
            name: "plexUsername",
            type: "varchar",
            length: "255",
            isNullable: true,
            isUnique: true,
          },
          {
            name: "displayName",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "email",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "tvtimeUsername",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "plexAccessToken",
            type: "varchar",
            length: "500",
            isNullable: true,
          },
          {
            name: "sessionToken",
            type: "varchar",
            length: "500",
            isNullable: true,
          },
          {
            name: "sessionTokenExpiresAt",
            type: "bigint",
            isNullable: true,
          },
          {
            name: "plexThumb",
            type: "varchar",
            length: "500",
            isNullable: true,
          },
          {
            name: "jellyfinUsername",
            type: "varchar",
            length: "255",
            isNullable: true,
            isUnique: true,
          },
          {
            name: "jellyfinAccessToken",
            type: "varchar",
            length: "500",
            isNullable: true,
          },
          {
            name: "jellyfinUserId",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "jellyfinThumb",
            type: "varchar",
            length: "500",
            isNullable: true,
          },
          {
            name: "isAdmin",
            type: "boolean",
            default: false,
          },
          {
            name: "enabled",
            type: "boolean",
            default: true,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true
    );

    await setPostgresUuidTextColumnDefault(queryRunner, "users", "id");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("users");
  }
}
