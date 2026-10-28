// SPDX-License-Identifier: MIT
// /v1/houses/:id/jobs — a house's running jobs (finding its parts, an AI photo). A job's own state and its Cancel
// are the kit's /v1/jobs/:id (makeJobsRouter, mounted in app.js — the engines plan's K9).

import { Hono, input } from "@delebash/core/platform";
import { getState } from "../app_state.js";
import { getHouse } from "../database/houses.js";
import { IdParams } from "../schemas/houses.js";
import { houseNotFound } from "./refusals.js";

/** `ctx`: { db, jobs } — the app's database and its JobRegistry (the kit's). */
export function router(ctx = getState()) {
  const app = new Hono();
  // A house's running jobs (finding its parts, an AI photo): a page opened or reloaded while one runs
  // attaches to it instead of showing the house as it was before
  app.get("/v1/houses/:id/jobs", input({ params: IdParams }), (c) => {
    const id = c.req.valid("param").id;
    if (!getHouse(ctx.db, id)) throw houseNotFound(id);
    return c.json(ctx.jobs.runningFor(id));
  });
  return app;
}
