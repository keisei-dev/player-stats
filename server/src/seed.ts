import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { poolConfigFromEnv } from "./pg-config.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const setupSqlPath = path.join(repoRoot, "docs/setup_db.sql");
export const csvPath = path.join(
  repoRoot,
  "docs/fifa_world_cup_2026_player_performance.csv"
);

// Prefer the direct connection for COPY. Fall back to DATABASE_URL, then PG*.
export function seedEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (env.DIRECT_URL?.trim()) {
    return { ...env, DATABASE_URL: env.DIRECT_URL.trim() };
  }
  return env;
}

export function prepareSetupSql(sql: string): { beforeCopy: string[]; afterCopy: string[] } {
  const withoutCopy = sql.replace(/^[ \t]*\\copy[^\n]*$/gim, "");
  const statements = withoutCopy
    .split(/;\s*/)
    .map(stripComments)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("\\"));

  const stagingIndex = statements.findIndex((statement) =>
    /create table raw_staging/i.test(statement)
  );
  if (stagingIndex === -1) {
    throw new Error("setup_db.sql is missing the raw_staging table");
  }

  return {
    beforeCopy: statements.slice(0, stagingIndex + 1),
    afterCopy: statements.slice(stagingIndex + 1),
  };
}

export function stagingColumns(sql: string): string[] {
  const match = sql.match(/CREATE TABLE raw_staging \(([\s\S]*?)\);/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((name) => name.length > 0);
}

function stripComments(statement: string): string {
  return statement
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

export async function seed(env: NodeJS.ProcessEnv = process.env) {
  const sql = readFileSync(setupSqlPath, "utf8");
  const { beforeCopy, afterCopy } = prepareSetupSql(sql);
  const client = new pg.Client({
    ...poolConfigFromEnv(seedEnv(env)),
    connectionTimeoutMillis: 20_000,
  });

  await client.connect();
  try {
    await client.query("BEGIN");
    for (const statement of beforeCopy) {
      await client.query(statement);
    }
    await copyCsv(client, csvPath);
    let counts: Record<string, unknown> | undefined;
    for (const statement of afterCopy) {
      const result = await client.query(statement);
      if (result.rows?.[0] && "performances" in result.rows[0]) {
        counts = result.rows[0];
      }
    }
    const performances = Number(counts?.performances ?? 0);
    if (!Number.isFinite(performances) || performances <= 0) {
      throw new Error("Seed finished without loading performances");
    }
    await client.query("DROP TABLE IF EXISTS raw_staging");
    await client.query("COMMIT");
    console.log(
      `Seeded ${counts?.performances} performances (${counts?.players} players, ${counts?.matches} matches).`
    );
    return counts;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection may already be closed.
    }
    throw err;
  } finally {
    await client.end();
  }
}

async function copyCsv(client: pg.Client, filePath: string) {
  const { from: copyFrom } = await import("pg-copy-streams");
  const { createReadStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const inbound = client.query(
    copyFrom("COPY raw_staging FROM STDIN WITH (FORMAT csv, HEADER true)") as unknown as pg.Submittable
  );
  await pipeline(createReadStream(filePath), inbound as unknown as NodeJS.WritableStream);
}
