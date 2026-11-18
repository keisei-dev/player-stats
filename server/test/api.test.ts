import type { QueryResult } from "pg";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db.js", () => ({
  query: vi.fn(),
  pool: { on: vi.fn(), end: vi.fn() },
}));

import { app } from "../src/app.js";
import { query } from "../src/db.js";

const mockedQuery = vi.mocked(query);

type Row = Record<string, unknown>;

function result(rows: Row[], rowCount = rows.length): QueryResult {
  return {
    rows,
    rowCount,
    command: "SELECT",
    oid: 0,
    fields: [],
  } as QueryResult;
}

const sample = {
  id: 7,
  player_id: "P00055",
  player_name: "Rodri Fati",
  team: "Spain",
  position: "Goalkeeper",
  match_id: "M00001",
  match_date: "2026-07-10",
  opponent_team: "South Africa",
  match_result: "W",
  goals: 1,
  assists: 0,
  minutes_played: 72,
  player_rating: "6.5",
};

beforeEach(() => {
  mockedQuery.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/health", () => {
  it("reports the service is up", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "player-stats-api" });
  });
});

describe("GET /api/health/db", () => {
  it("returns table counts", async () => {
    mockedQuery.mockResolvedValue(
      result([{ players: "120", matches: "40", performances: "800" }])
    );
    const res = await request(app).get("/api/health/db");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.counts.performances).toBe("800");
  });

  it("returns 500 when the database is down", async () => {
    mockedQuery.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await request(app).get("/api/health/db");
    expect(res.status).toBe(500);
    expect(res.body.status).toBe("error");
  });
});

describe("GET /api/performances", () => {
  it("returns a page of rows with the default sort", async () => {
    mockedQuery.mockImplementation(async (text: string) => {
      if (text.includes("COUNT(*)")) return result([{ total: 40 }]);
      return result([sample]);
    });

    const res = await request(app).get("/api/performances");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 1,
      pageSize: 25,
      total: 40,
      totalPages: 2,
      sort: "id",
      order: "asc",
      pageSizeOptions: [10, 25, 50, 100],
    });
    expect(res.body.data).toEqual([sample]);

    const listSql = mockedQuery.mock.calls.map((call) => String(call[0])).find((sql) =>
      sql.includes("ORDER BY")
    );
    expect(listSql).toContain("ORDER BY pf.id ASC");
    expect(mockedQuery.mock.calls[1][1]).toEqual([25, 0]);
  });

  it("applies search, filters, sort, and pagination", async () => {
    mockedQuery.mockImplementation(async (text: string) => {
      if (text.includes("COUNT(*)")) return result([{ total: 1 }]);
      return result([sample]);
    });

    const res = await request(app).get("/api/performances").query({
      page: 2,
      pageSize: 10,
      q: " Rodri ",
      position: "Goalkeeper",
      team: "Spain",
      sort: "goals",
      order: "desc",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      sort: "goals",
      order: "desc",
    });

    const countCall = mockedQuery.mock.calls[0];
    expect(String(countCall[0])).toContain(
      "WHERE p.player_name ILIKE $1 AND p.position = $2 AND p.team = $3"
    );
    expect(countCall[1]).toEqual(["%Rodri%", "Goalkeeper", "Spain"]);

    const listCall = mockedQuery.mock.calls[1];
    expect(String(listCall[0])).toContain("ORDER BY pf.goals DESC, pf.id ASC");
    expect(listCall[1]).toEqual(["%Rodri%", "Goalkeeper", "Spain", 10, 10]);
  });

  it("rejects a page size and sort column that are not on the whitelist", async () => {
    mockedQuery.mockImplementation(async (text: string) => {
      if (text.includes("COUNT(*)")) return result([{ total: 0 }]);
      return result([]);
    });

    const res = await request(app)
      .get("/api/performances")
      .query({ pageSize: 15, sort: "goals;drop table", order: "DROP" });

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(25);
    expect(res.body.sort).toBe("id");
    expect(res.body.order).toBe("asc");
    expect(res.body.totalPages).toBe(1);
    const sql = String(mockedQuery.mock.calls[1][0]);
    expect(sql).toContain("ORDER BY pf.id ASC");
    expect(sql).not.toContain("drop table");
  });

  it("returns 500 when the list query fails", async () => {
    mockedQuery.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/api/performances");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch performances");
  });
});

describe("GET /api/performances/filters", () => {
  it("returns distinct positions and teams", async () => {
    mockedQuery.mockImplementation(async (text: string) => {
      if (String(text).includes("DISTINCT position")) {
        return result([{ position: "Goalkeeper" }, { position: "Midfielder" }]);
      }
      return result([{ team: "Spain" }]);
    });

    const res = await request(app).get("/api/performances/filters");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      positions: ["Goalkeeper", "Midfielder"],
      teams: ["Spain"],
    });
  });

  it("returns 500 when the lookup fails", async () => {
    mockedQuery.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/api/performances/filters");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch filter options");
  });
});

describe("GET /api/performances/:id", () => {
  it("returns the row", async () => {
    mockedQuery.mockResolvedValue(result([sample]));
    const res = await request(app).get("/api/performances/7");
    expect(res.status).toBe(200);
    expect(res.body.player_name).toBe("Rodri Fati");
    expect(mockedQuery.mock.calls[0][1]).toEqual([7]);
  });

  it("returns 400 for an id that is not an integer", async () => {
    const res = await request(app).get("/api/performances/abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid id");
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it("returns 404 when the row is missing", async () => {
    mockedQuery.mockResolvedValue(result([]));
    const res = await request(app).get("/api/performances/99");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Performance not found");
  });

  it("returns 500 when the lookup throws", async () => {
    mockedQuery.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/api/performances/7");
    expect(res.status).toBe(500);
  });
});

describe("POST /api/performances", () => {
  it("requires player_id and match_id", async () => {
    const res = await request(app).post("/api/performances").send({ player_id: "P1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("player_id and match_id are required");
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it("inserts editable fields and ignores unknown ones", async () => {
    mockedQuery.mockResolvedValue(result([{ id: 50, goals: 2 }]));
    const res = await request(app).post("/api/performances").send({
      player_id: "P00055",
      match_id: "M00009",
      goals: 2,
      opponent_team: "",
      injected: "nope",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(50);
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(String(sql)).toContain(
      "INSERT INTO performances (player_id, match_id, opponent_team, goals)"
    );
    expect(String(sql)).not.toContain("injected");
    expect(params).toEqual(["P00055", "M00009", null, 2]);
  });

  it("returns 400 when the player or match does not exist", async () => {
    mockedQuery.mockRejectedValue(Object.assign(new Error("fk"), { code: "23503" }));
    const res = await request(app)
      .post("/api/performances")
      .send({ player_id: "nope", match_id: "M00001" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unknown player_id or match_id");
  });

  it("returns 409 when that player already has the match", async () => {
    mockedQuery.mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));
    const res = await request(app)
      .post("/api/performances")
      .send({ player_id: "P00055", match_id: "M00001" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("This player already has a row for that match");
  });

  it("returns 500 on an unexpected insert error", async () => {
    mockedQuery.mockRejectedValue(new Error("boom"));
    const res = await request(app)
      .post("/api/performances")
      .send({ player_id: "P00055", match_id: "M00009" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to create performance");
  });
});

describe("PUT /api/performances/:id", () => {
  it("returns 400 for a bad id or an empty body", async () => {
    const badId = await request(app).put("/api/performances/nope").send({ goals: 1 });
    expect(badId.status).toBe(400);
    expect(badId.body.error).toBe("Invalid id");

    const empty = await request(app).put("/api/performances/7").send({ injected: 1 });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe("No editable fields provided");
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it("updates the whitelisted columns", async () => {
    mockedQuery.mockResolvedValue(result([{ id: 7, goals: 3 }]));
    const res = await request(app).put("/api/performances/7").send({ goals: 3, assists: 1 });
    expect(res.status).toBe(200);
    expect(res.body.goals).toBe(3);
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(String(sql)).toContain("SET goals = $1, assists = $2");
    expect(String(sql)).toContain("WHERE id = $3");
    expect(params).toEqual([3, 1, 7]);
  });

  it("returns 404 when nothing was updated", async () => {
    mockedQuery.mockResolvedValue(result([], 0));
    const res = await request(app).put("/api/performances/7").send({ goals: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Performance not found");
  });

  it("returns 500 when the update throws", async () => {
    mockedQuery.mockRejectedValue(new Error("boom"));
    const res = await request(app).put("/api/performances/7").send({ goals: 1 });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/performances/:id", () => {
  it("returns 204 when a row is removed", async () => {
    mockedQuery.mockResolvedValue(result([], 1));
    const res = await request(app).delete("/api/performances/7");
    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(mockedQuery.mock.calls[0][1]).toEqual([7]);
  });

  it("returns 404 when the row is already gone", async () => {
    mockedQuery.mockResolvedValue(result([], 0));
    const res = await request(app).delete("/api/performances/7");
    expect(res.status).toBe(404);
  });

  it("returns 400 for a bad id and 500 when the delete throws", async () => {
    const bad = await request(app).delete("/api/performances/abc");
    expect(bad.status).toBe(400);

    mockedQuery.mockRejectedValue(new Error("boom"));
    const failed = await request(app).delete("/api/performances/7");
    expect(failed.status).toBe(500);
  });
});

describe("GET /api/rankings", () => {
  const players = [
    {
      player_id: "P1",
      player_name: "Ana",
      team: "Spain",
      position: "Forward",
      nationality: "Spanish",
      matches_played: 3,
      total_goals: 4,
      total_assists: 1,
      avg_rating: "7.10",
    },
    {
      player_id: "P2",
      player_name: "Ben",
      team: "Spain",
      position: "Midfielder",
      nationality: "Spanish",
      matches_played: 3,
      total_goals: 1,
      total_assists: 2,
      avg_rating: "6.50",
    },
  ];

  it("ranks by goals and numbers the rows", async () => {
    mockedQuery.mockResolvedValue(result(players));
    const res = await request(app).get("/api/rankings");
    expect(res.status).toBe(200);
    expect(res.body.sort).toBe("goals");
    expect(res.body.limit).toBe(25);
    expect(res.body.sortOptions).toEqual(["goals", "assists", "rating"]);
    expect(res.body.data[0]).toMatchObject({ rank: 1, player_name: "Ana" });
    expect(res.body.data[1].rank).toBe(2);
    const sql = String(mockedQuery.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY total_goals DESC NULLS LAST");
    expect(sql).toContain("AVG(pf.player_rating) FILTER (WHERE pf.minutes_played > 0)");
    expect(mockedQuery.mock.calls[0][1]).toEqual([25]);
  });

  it("sorts by assists or rating and clamps the limit", async () => {
    mockedQuery.mockResolvedValue(result(players));
    const assists = await request(app).get("/api/rankings").query({ sort: "assists", limit: 500 });
    expect(assists.body.sort).toBe("assists");
    expect(assists.body.limit).toBe(100);
    expect(String(mockedQuery.mock.calls[0][0])).toContain("ORDER BY total_assists DESC");
    expect(mockedQuery.mock.calls[0][1]).toEqual([100]);

    const rating = await request(app).get("/api/rankings").query({ sort: "rating", limit: 10 });
    expect(rating.body.sort).toBe("rating");
    expect(rating.body.limit).toBe(10);
    expect(String(mockedQuery.mock.calls[1][0])).toContain("ORDER BY avg_rating DESC");
  });

  it("ignores an unknown sort and a useless limit", async () => {
    mockedQuery.mockResolvedValue(result([]));
    const res = await request(app)
      .get("/api/rankings")
      .query({ sort: "avg_rating;drop", limit: "0" });
    expect(res.status).toBe(200);
    expect(res.body.sort).toBe("goals");
    expect(res.body.limit).toBe(25);
    expect(res.body.data).toEqual([]);
    const sql = String(mockedQuery.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY total_goals DESC");
    expect(sql).not.toContain("drop");
  });

  it("returns 500 when the aggregate query fails", async () => {
    mockedQuery.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/api/rankings");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch rankings");
  });
});
