import express from "express";
import cors from "cors";
import { query } from "./db.js";
import { performancesRouter } from "./routes/performances.js";
import { rankingsRouter } from "./routes/rankings.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/performances", performancesRouter);
  app.use("/api/rankings", rankingsRouter);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "player-stats-api" });
  });

  app.get("/api/health/db", async (_req, res) => {
    try {
      const { rows } = await query<{
        players: string;
        matches: string;
        performances: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM players)      AS players,
           (SELECT COUNT(*) FROM matches)      AS matches,
           (SELECT COUNT(*) FROM performances) AS performances`
      );
      res.json({ status: "ok", counts: rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ status: "error", message: "database unavailable" });
    }
  });

  return app;
}

export const app = createApp();
