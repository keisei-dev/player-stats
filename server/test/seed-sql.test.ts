import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { csvPath, prepareSetupSql, setupSqlPath, stagingColumns } from "../src/seed.js";

const sql = readFileSync(setupSqlPath, "utf8");

describe("setup_db.sql", () => {
  it("splits around the psql \\copy and keeps the load order", () => {
    const { beforeCopy, afterCopy } = prepareSetupSql(sql);
    expect(beforeCopy.some((statement) => /drop table if exists performances/i.test(statement))).toBe(
      true
    );
    expect(beforeCopy.at(-1)).toMatch(/create table raw_staging/i);
    expect(afterCopy[0]).toMatch(/create table players/i);
    expect(afterCopy.some((statement) => /insert into performances/i.test(statement))).toBe(true);
    expect(afterCopy.some((statement) => /insert into matches/i.test(statement))).toBe(true);

    const joined = [...beforeCopy, ...afterCopy].join("\n");
    expect(joined).not.toContain("\\copy");
    expect(joined).not.toContain("fifa_world_cup_2026_player_performance.csv");
  });

  it("matches the CSV header column for column", () => {
    const header = readFileSync(csvPath, "utf8").split(/\r?\n/, 1)[0].split(",");
    expect(stagingColumns(sql)).toEqual(header);
  });
});
