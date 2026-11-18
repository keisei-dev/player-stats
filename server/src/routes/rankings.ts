import { Router } from "express";
import type { Request } from "express";
import { query } from "../db.js";
import {
  RANKINGS_SORT_OPTIONS,
  type QueryInput,
  parseRankingsQuery,
} from "../params.js";

export const rankingsRouter = Router();

// GET /api/rankings?sort=goals&limit=25
rankingsRouter.get("/", async (req: Request, res) => {
  const { sortKey, sortColumn, limit } = parseRankingsQuery(req.query as QueryInput);

  try {
    // Avg rating ignores bench/unused rows (minutes_played = 0).
    const { rows } = await query(
      `SELECT p.player_id,
              p.player_name,
              p.team,
              p.position,
              p.nationality,
              COUNT(pf.id)::int                    AS matches_played,
              COALESCE(SUM(pf.goals), 0)::int      AS total_goals,
              COALESCE(SUM(pf.assists), 0)::int    AS total_assists,
              ROUND(
                AVG(pf.player_rating) FILTER (WHERE pf.minutes_played > 0),
                2
              )                                    AS avg_rating
       FROM players p
       JOIN performances pf ON pf.player_id = p.player_id
       GROUP BY p.player_id, p.player_name, p.team, p.position, p.nationality
       ORDER BY ${sortColumn} DESC NULLS LAST, p.player_name ASC
       LIMIT $1`,
      [limit]
    );

    const data = rows.map((row, index) => ({
      rank: index + 1,
      ...row,
    }));

    res.json({
      data,
      sort: sortKey,
      limit,
      sortOptions: RANKINGS_SORT_OPTIONS,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch rankings" });
  }
});
