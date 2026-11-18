import { describe, expect, it } from "vitest";
import { poolConfigFromEnv } from "../src/pg-config.js";
import { seedEnv } from "../src/seed.js";

const hosted = "postgres://user:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

describe("poolConfigFromEnv", () => {
  it("uses a hosted URL with SSL and a small pool", () => {
    const config = poolConfigFromEnv({ DATABASE_URL: hosted });
    expect(config.connectionString).toBe(hosted);
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.max).toBe(1);
  });

  it("skips SSL for localhost and for an explicit disable", () => {
    expect(
      poolConfigFromEnv({
        DATABASE_URL: "postgres://user:secret@localhost:5432/worldcup",
      }).ssl
    ).toBeUndefined();
    expect(
      poolConfigFromEnv({
        DATABASE_URL: "postgres://user:secret@127.0.0.1:5432/worldcup",
      }).ssl
    ).toBeUndefined();
    expect(
      poolConfigFromEnv({
        DATABASE_URL: `${hosted}?sslmode=disable`,
      }).ssl
    ).toBeUndefined();
    expect(
      poolConfigFromEnv({ DATABASE_URL: hosted, DATABASE_SSL: "false" }).ssl
    ).toBeUndefined();
  });

  it("can require a verified certificate and a custom pool size", () => {
    const config = poolConfigFromEnv({
      DATABASE_URL: hosted,
      DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
      PG_POOL_MAX: "4",
    });
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
    expect(config.max).toBe(4);
  });

  it("falls back to the local PG* variables", () => {
    expect(
      poolConfigFromEnv({
        PGHOST: "db.internal",
        PGPORT: "5433",
        PGUSER: "postgres",
        PGPASSWORD: "",
        PGDATABASE: "worldcup",
      })
    ).toMatchObject({
      host: "db.internal",
      port: 5433,
      user: "postgres",
      password: undefined,
      database: "worldcup",
      max: 10,
    });
  });
});

describe("seedEnv", () => {
  it("prefers DIRECT_URL so COPY does not go through the pooler", () => {
    expect(
      seedEnv({ DATABASE_URL: "postgres://pool", DIRECT_URL: " postgres://direct " })
        .DATABASE_URL
    ).toBe("postgres://direct");
  });

  it("keeps DATABASE_URL when no direct URL is set", () => {
    expect(seedEnv({ DATABASE_URL: "postgres://pool" }).DATABASE_URL).toBe(
      "postgres://pool"
    );
  });
});
