import type pg from "pg";

// DATABASE_URL, when set, is a hosted Postgres string (Supabase transaction
// pooler or Neon "-pooler" host). Local PG* variables are the fallback.
export function poolConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): pg.PoolConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (connectionString) {
    return {
      connectionString,
      ssl: sslForConnectionString(connectionString, env),
      max: positiveInt(env.PG_POOL_MAX, 1),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    };
  }

  return {
    host: env.PGHOST || "localhost",
    port: positiveInt(env.PGPORT, 5432),
    user: env.PGUSER,
    password: env.PGPASSWORD || undefined,
    database: env.PGDATABASE || "worldcup",
    max: positiveInt(env.PG_POOL_MAX, 10),
    allowExitOnIdle: true,
  };
}

export function sslForConnectionString(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env
): pg.PoolConfig["ssl"] {
  if (env.DATABASE_SSL === "false") return undefined;

  const verify = env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true";
  const ssl = { rejectUnauthorized: verify };

  if (env.DATABASE_SSL === "true") return ssl;
  if (/sslmode=disable/i.test(connectionString)) return undefined;
  if (isLocalConnection(connectionString)) return undefined;
  return ssl;
}

function isLocalConnection(connectionString: string): boolean {
  let hostname = "";
  try {
    hostname = new URL(connectionString).hostname;
  } catch {
    return false;
  }
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
