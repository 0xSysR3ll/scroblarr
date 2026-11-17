import { describe, expect, it } from "vitest";

import {
  coerceValue,
  DATA_TABLES,
  intersectColumns,
  parseArgs,
} from "./migrateSqliteToPostgres";

describe("migrateSqliteToPostgres helpers", () => {
  it("parses CLI flags", () => {
    expect(
      parseArgs(["--sqlite", "/tmp/db.sqlite", "--dry-run", "--force"], {
        sqlitePath: "/default.db",
      })
    ).toEqual({
      sqlitePath: "/tmp/db.sqlite",
      dryRun: true,
      force: true,
      help: false,
    });
  });

  it("parses --sqlite= form and help", () => {
    expect(
      parseArgs(["--sqlite=/data/scroblarr.db", "--help"], {
        sqlitePath: "/default.db",
      })
    ).toMatchObject({
      sqlitePath: "/data/scroblarr.db",
      help: true,
    });
  });

  it("rejects unknown args and missing --sqlite value", () => {
    expect(() => parseArgs(["--nope"], { sqlitePath: "/default.db" })).toThrow(
      /Unknown argument/
    );
    expect(() =>
      parseArgs(["--sqlite"], { sqlitePath: "/default.db" })
    ).toThrow(/--sqlite requires a path/);
  });

  it("coerces sqlite boolean integers", () => {
    expect(coerceValue("isAdmin", 1)).toBe(true);
    expect(coerceValue("success", 0)).toBe(false);
    expect(coerceValue("enabled", "0")).toBe(false);
    expect(coerceValue("enabled", "1")).toBe(true);
    expect(coerceValue("mediaTitle", "Hello")).toBe("Hello");
    expect(coerceValue("posterUrl", null)).toBeNull();
  });

  it("intersects columns in sqlite order", () => {
    expect(
      intersectColumns(["id", "legacy", "name"], ["name", "id", "extra"])
    ).toEqual(["id", "name"]);
  });

  it("copies tables in FK-safe order", () => {
    expect([...DATA_TABLES]).toEqual([
      "users",
      "settings",
      "sessions",
      "sync_history",
    ]);
  });
});
