import express from "express";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";
import { dispatchExpress } from "../src/dispatch.js";

afterAll(async () => {
  await pool.end();
});

function miniApp() {
  const api = express();
  api.use(express.json());
  api.get("/api/echo", (req, res) => {
    res.json({ q: req.query.q ?? null });
  });
  api.post("/api/echo", (req, res) => {
    res.status(201).json({ got: req.body });
  });
  api.delete("/api/echo", (_req, res) => {
    res.status(204).end();
  });
  return api;
}

describe("dispatchExpress", () => {
  it("forwards the query string and JSON body", async () => {
    const api = miniApp();
    const listed = await dispatchExpress(
      api,
      new Request("http://app.internal/api/echo?q=Ana")
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ q: "Ana" });

    const created = await dispatchExpress(
      api,
      new Request("http://app.internal/api/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goals: 2 }),
      })
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ got: { goals: 2 } });
  });

  it("returns an empty 204", async () => {
    const res = await dispatchExpress(
      miniApp(),
      new Request("http://app.internal/api/echo", { method: "DELETE" })
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("serves the real health route", async () => {
    const res = await dispatchExpress(
      app,
      new Request("http://app.internal/api/health")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "player-stats-api" });
  });
});
