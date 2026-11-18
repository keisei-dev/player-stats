import { describe, expect, it } from "vitest";
import {
  buildFilters,
  parsePerformanceQuery,
  parseRankingsQuery,
  pickEditable,
} from "../src/params.js";

describe("buildFilters", () => {
  it("returns no clause when nothing is set", () => {
    expect(buildFilters({})).toEqual({ where: "", params: [] });
    expect(buildFilters({ q: "   ", position: "", team: "  " })).toEqual({
      where: "",
      params: [],
    });
  });

  it("builds ILIKE and equality filters in a stable order", () => {
    expect(
      buildFilters({ q: " Ana ", position: "Midfielder", team: "Spain" })
    ).toEqual({
      where: "WHERE p.player_name ILIKE $1 AND p.position = $2 AND p.team = $3",
      params: ["%Ana%", "Midfielder", "Spain"],
    });
  });

  it("ignores non-string query values", () => {
    expect(buildFilters({ q: ["Ana"], position: 3 })).toEqual({
      where: "",
      params: [],
    });
  });
});

describe("pickEditable", () => {
  it("keeps known fields, drops unknown ones, and turns blanks into null", () => {
    expect(
      pickEditable({
        goals: 0,
        opponent_team: "",
        player_rating: 7.2,
        nope: "x",
      })
    ).toEqual({
      fields: ["opponent_team", "goals", "player_rating"],
      values: [null, 0, 7.2],
    });
  });

  it("returns nothing when the body has no editable keys", () => {
    expect(pickEditable({})).toEqual({ fields: [], values: [] });
  });
});

describe("parsePerformanceQuery", () => {
  it("uses the default page, page size, and id sort", () => {
    const parsed = parsePerformanceQuery({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.offset).toBe(0);
    expect(parsed.sortKey).toBe("id");
    expect(parsed.sortColumn).toBe("pf.id");
    expect(parsed.sortOrder).toBe("ASC");
  });

  it("accepts a whitelisted page size and a descending sort", () => {
    const parsed = parsePerformanceQuery({
      page: "3",
      pageSize: "10",
      sort: "player_name",
      order: "DESC",
    });
    expect(parsed).toMatchObject({
      page: 3,
      pageSize: 10,
      offset: 20,
      sortKey: "player_name",
      sortColumn: "p.player_name",
      sortOrder: "DESC",
    });
  });

  it("falls back when the page size or sort column is not allowed", () => {
    const parsed = parsePerformanceQuery({
      page: "0",
      pageSize: "15",
      sort: "pf.id;drop",
      order: "sideways",
    });
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.sortColumn).toBe("pf.id");
    expect(parsed.sortOrder).toBe("ASC");
    expect(parsed.sortColumn).not.toContain("drop");
  });
});

describe("parseRankingsQuery", () => {
  it("defaults to goals and a limit of 25", () => {
    expect(parseRankingsQuery({})).toEqual({
      sortKey: "goals",
      sortColumn: "total_goals",
      limit: 25,
    });
  });

  it("clamps the limit and accepts assists or rating", () => {
    expect(parseRankingsQuery({ sort: "assists", limit: "1000" })).toEqual({
      sortKey: "assists",
      sortColumn: "total_assists",
      limit: 100,
    });
    expect(parseRankingsQuery({ sort: "rating", limit: "0" })).toMatchObject({
      sortKey: "rating",
      sortColumn: "avg_rating",
      limit: 25,
    });
  });

  it("ignores a sort value that is not on the list", () => {
    const parsed = parseRankingsQuery({ sort: "total_goals;delete", limit: "-4" });
    expect(parsed.sortColumn).toBe("total_goals");
    expect(parsed.limit).toBe(25);
  });
});
