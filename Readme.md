# Player Performance Explorer

A full-stack app for browsing, searching, and managing FIFA World Cup 2026 player match statistics, built with Astro, Express (TypeScript), and PostgreSQL. It runs locally, and the same repo deploys as one public Vercel project. See [Deploy on Vercel](#deploy-on-vercel).

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

- **Frontend:** Astro 5 (SSR). Locally this is `astro dev`; on Vercel it uses `@astrojs/vercel`.
- **Backend:** Node.js, Express 4, TypeScript (`tsx` for local dev). The same Express app is mounted at `/api` in the Vercel deployment.
- **Database:** PostgreSQL via `pg` (`DATABASE_URL`, or the `PG*` variables for a database on your machine)
- **Tooling:** npm workspaces, `concurrently`, Vitest

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
server/src/   index.ts, app.ts, db.ts, seed.ts, routes/performances.ts, routes/rankings.ts
web/src/      pages/ (performances list, [id], new, rankings, api), lib/api.ts
docs/         setup_db.sql, CSV dataset
deliverables/ reflection, schema and UI screenshots
```

## Getting started

**Prerequisites:** Node.js 22 and PostgreSQL.

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
   For a database on your machine, set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PORT` (API, default 3000), and `PUBLIC_API_BASE_URL` (the Astro dev server calls this; default `http://localhost:3000`). Hosted Postgres uses `DATABASE_URL` instead of the `PG*` variables. See `.env.example`.
3. Run the API and the web app together:
   ```bash
   npm run dev
   ```
   API: http://localhost:3000. Web: http://localhost:4321.

To load the CSV into a hosted database instead of using `psql`, use `npm run db:seed`. The steps are in the deploy section.

## Tests

```bash
npm test
```

Vitest and Supertest exercise the Express routes: the performances list (search, position, team, sort, page, page size), validation, 400 and 404 responses, the 409 duplicate case, and rankings (sort and limit). A few unit tests cover the query parsers, the SSL pool settings, and the seed SQL. The database client is mocked, so the suite does not need Postgres. `npm run typecheck` runs `tsc` on the server.

GitHub Actions runs typecheck, the tests, and `npm run build` on every push and pull request.

## Deploy on Vercel

One Vercel project serves the Astro pages and the Express API. Requests under `/api` hit the Express app. Everything else is server-rendered Astro. Postgres is a hosted database reached with a pooled `DATABASE_URL` (Supabase or Neon).

### Create the database and load the CSV

1. Create a Postgres database on Supabase or Neon.
2. Copy the **pooled** connection string. This is what the running app uses.
   - Supabase: Project Settings → Database → Connection string → URI → **Transaction pooler** (host `*.pooler.supabase.com`, port `6543`).
   - Neon: the connection string whose host contains `-pooler`.
3. Also copy a **direct** connection string for the one-time load. `COPY` often fails on a transaction pooler.
   - Supabase: the direct URI, port `5432`, host `db.<project-ref>.supabase.co`.
   - Neon: the connection string without `-pooler`.
4. From the repository root, after `npm install`:

   ```bash
   DIRECT_URL="postgres://USER:PASSWORD@DIRECT_HOST:5432/postgres" \
   DATABASE_URL="postgres://USER:PASSWORD@POOLER_HOST:6543/postgres" \
   npm run db:seed
   ```

   The script reads `docs/setup_db.sql` and `docs/fifa_world_cup_2026_player_performance.csv`. It drops `players`, `matches`, and `performances`, loads the CSV, and rebuilds the three tables. Running it again does the same thing. If `DIRECT_URL` is empty it uses `DATABASE_URL`. With neither set, it uses the local `PG*` variables from `.env`.

   The app turns SSL on for any non-local host. Leave that as-is for Supabase and Neon. Set `DATABASE_SSL_REJECT_UNAUTHORIZED=true` if you want Node to verify the certificate. `DATABASE_SSL=false` turns TLS off.

### Vercel project settings

Import this GitHub repository. Vercel may guess that the root is `web`, because that is where `astro.config.mjs` lives. Use the repository root instead. The build writes `.vercel/output` there, which is the bundle Vercel should deploy (UI and API together).

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Root Directory | `.` (repository root) |
| Build Command | `npm run build` |
| Output Directory | leave blank |
| Install Command | `npm install` |
| Node.js Version | 22.x |

`vercel.json` already sets the build and install commands. Do not set the output directory to `web/dist`. That skips the Vercel build output the adapter produces.

Environment variables on the Vercel project:

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled connection string. SSL is applied in the app. |
| `PUBLIC_API_BASE_URL` | no | Leave unset. The pages then call `/api` on the same host. Set it only for local dev. |
| `PG_POOL_MAX` | no | Client pool size when `DATABASE_URL` is set. Default `1`, which is what you want behind Supabase or Neon’s pooler. |

`DIRECT_URL` and the `PG*` variables are for your machine. The deployed app does not need them.

In the project settings, allow public access to the production deployment (Deployment Protection off for Production) so the demo can be opened without a Vercel login.

## Background

Built as an individual course project (WD-203, Databases and React) at Cornerstone International Community College (CICCC). The dataset and the `setup_db.sql` script were provided by the course.
