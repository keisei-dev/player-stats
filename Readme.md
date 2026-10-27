# Player Performance Explorer

A full-stack app for browsing, searching, and managing FIFA World Cup 2026 player match statistics, built with Astro, Express (TypeScript), and PostgreSQL.

_No live demo: the app runs locally._

![Performances list](deliverables/ui_performances_list.png)

| Detail / edit | Create | Rankings |
| --- | --- | --- |
| ![Detail](deliverables/ui_performance_detail.png) | ![Create](deliverables/ui_performance_create.png) | ![Rankings](deliverables/ui_rankings.png) |

## Features

- **Paginated list** of player performances with server-side pagination and a rows-per-page selector (10 / 25 / 50 / 100).
- **Search, filter, and sort.** Search by player name (case-insensitive `ILIKE`), filter by position or team, and sort by name, team, position, match date, goals, assists, minutes, or rating.
- **Full CRUD.** View the details of any record, edit its stats, delete it, or create a new one.
- **Rankings page** with per-player totals: matches played, total goals, total assists, and average rating.
- **Clear API errors**, for example 400 for an unknown player or match, 409 for a duplicate player and match pair, and 404 when a record isn't found.

## Tech stack

- **Frontend:** Astro 5 (SSR, `@astrojs/node` standalone adapter)
- **Backend:** Node.js, Express 4, TypeScript (run with `tsx`)
- **Database:** PostgreSQL via `pg` (connection `Pool`)
- **Tooling:** npm workspaces, `concurrently`

## How it works

### Database schema

`docs/setup_db.sql` loads the flat CSV into a staging table, then normalizes it into three tables:

| Table | One row per | Key |
| --- | --- | --- |
| `players` | player | `player_id` (PK) |
| `matches` | match | `match_id` (PK) |
| `performances` | player in a match (stats) | `id` (PK); `player_id` → `players`, `match_id` → `matches`; `UNIQUE (player_id, match_id)` |

The design is explained in [`deliverables/reflection.md`](deliverables/reflection.md), with schema screenshots in `deliverables/`.

### SQL highlights

- **JOINs:** the list and detail endpoints join `performances` with `players` and `matches`.
- **Aggregation:** `/api/rankings` uses `COUNT`, `SUM`, and `AVG(...) FILTER (WHERE minutes_played > 0)` with `GROUP BY` per player.
- **Server-side pagination:** `LIMIT` / `OFFSET`, plus a separate `COUNT(*)` for the total number of pages.
- **Parameterized queries:** all user input is passed as `$1, $2, …` through a shared `query()` helper. Sort columns and editable fields come from server-side whitelists, never from raw input.

### API

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/performances` | List (`page`, `pageSize`, `q`, `position`, `team`, `sort`, `order`) |
| GET | `/api/performances/filters` | Distinct positions and teams |
| GET | `/api/performances/:id` | Detail with player and match info |
| POST | `/api/performances` | Create (requires `player_id`, `match_id`) |
| PUT | `/api/performances/:id` | Update editable stats |
| DELETE | `/api/performances/:id` | Delete |
| GET | `/api/rankings` | Leaderboard (`sort=goals\|assists\|rating`, `limit` ≤ 100) |
| GET | `/api/health`, `/api/health/db` | Health checks |

```
server/src/   index.ts, db.ts, routes/performances.ts, routes/rankings.ts
web/src/      pages/ (performances list, [id], new, rankings), lib/api.ts
docs/         setup_db.sql, CSV dataset
deliverables/ reflection, schema and UI screenshots
```

## Getting started

**Prerequisites:** Node.js and PostgreSQL.

1. Create the database and load the data:
   ```bash
   createdb worldcup
   cd docs
   psql -d worldcup -f setup_db.sql   # run from docs/ so \copy finds the CSV
   ```
2. Install dependencies and configure the environment:
   ```bash
   cd ..
   npm install
   cp .env.example .env
   ```
   Set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PORT` (API, default 3000), and `PUBLIC_API_BASE_URL` (used by the Astro front end).
3. Run the API and the web app together:
   ```bash
   npm run dev
   ```
   API: http://localhost:3000. Web: http://localhost:4321.

## Background

Built as an individual course project (WD-203, Databases and React) at Cornerstone International Community College (CICCC). The dataset and the `setup_db.sql` script were provided by the course.
