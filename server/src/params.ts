export const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export const SORTABLE_COLUMNS = {
  id: "pf.id",
  player_name: "p.player_name",
  team: "p.team",
  position: "p.position",
  match_date: "m.match_date",
  goals: "pf.goals",
  assists: "pf.assists",
  minutes_played: "pf.minutes_played",
  player_rating: "pf.player_rating",
} as const;

export type SortKey = keyof typeof SORTABLE_COLUMNS;

export const EDITABLE_FIELDS = [
  "opponent_team",
  "match_result",
  "minutes_played",
  "goals",
  "assists",
  "shots",
  "shots_on_target",
  "player_rating",
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const RANKINGS_SORT = {
  goals: "total_goals",
  assists: "total_assists",
  rating: "avg_rating",
} as const;

export type RankingsSortKey = keyof typeof RANKINGS_SORT;

export const RANKINGS_SORT_OPTIONS = Object.keys(RANKINGS_SORT);
export const DEFAULT_RANKINGS_LIMIT = 25;
export const MAX_RANKINGS_LIMIT = 100;

export type QueryInput = { [key: string]: unknown };

export function queryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function buildFilters(query: QueryInput) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const q = queryString(query.q).trim();
  if (q !== "") {
    params.push(`%${q}%`);
    conditions.push(`p.player_name ILIKE $${params.length}`);
  }

  const position = queryString(query.position).trim();
  if (position !== "") {
    params.push(position);
    conditions.push(`p.position = $${params.length}`);
  }

  const team = queryString(query.team).trim();
  if (team !== "") {
    params.push(team);
    conditions.push(`p.team = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

export function pickEditable(body: Record<string, unknown>) {
  const fields: EditableField[] = [];
  const values: unknown[] = [];
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) {
      fields.push(key);
      values.push(body[key] === "" ? null : body[key]);
    }
  }
  return { fields, values };
}

export function parsePerformanceQuery(query: QueryInput) {
  const page = Math.max(1, Number.parseInt(queryString(query.page), 10) || 1);
  const requestedSize = Number.parseInt(queryString(query.pageSize), 10);
  const pageSize = (ALLOWED_PAGE_SIZES as readonly number[]).includes(requestedSize)
    ? requestedSize
    : DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const requestedSort = queryString(query.sort);
  const sortKey: SortKey =
    requestedSort in SORTABLE_COLUMNS ? (requestedSort as SortKey) : "id";
  const sortColumn = SORTABLE_COLUMNS[sortKey];
  const sortOrder =
    queryString(query.order).toLowerCase() === "desc" ? "DESC" : "ASC";

  const { where, params } = buildFilters(query);
  return { page, pageSize, offset, sortKey, sortColumn, sortOrder, where, params };
}

export function parseRankingsQuery(query: QueryInput) {
  const requestedSort = queryString(query.sort);
  const sortKey: RankingsSortKey =
    requestedSort in RANKINGS_SORT ? (requestedSort as RankingsSortKey) : "goals";
  const sortColumn = RANKINGS_SORT[sortKey];

  let limit = Number.parseInt(queryString(query.limit), 10);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_RANKINGS_LIMIT;
  if (limit > MAX_RANKINGS_LIMIT) limit = MAX_RANKINGS_LIMIT;

  return { sortKey, sortColumn, limit };
}
