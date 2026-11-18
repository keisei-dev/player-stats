import pg from "pg";
import { poolConfigFromEnv } from "./pg-config.js";

const { Pool } = pg;

export const pool = new Pool(poolConfigFromEnv());

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
});

// Prefer this helper so every caller uses parameterized queries ($1, $2, ...).
export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}
