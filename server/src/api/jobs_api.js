// SPDX-License-Identifier: MIT
// /v1/jobs/:id — what a long job is doing (the screen polls it inside the kit's withAiTask), and
// DELETE to stop it; /v1/houses/:id/jobs — a house's running ones.

import { Hono, input } from "@delebash/core/platform";
import { notFound } from "@delebash/core/platform/errors";
import { getState } from "../app_state.js";
import { getHouse } from "../database/houses.js";
import { IdParams } from "../schemas/houses.js";
import { houseNotFound } from "./refusals.js";

/** `ctx`: { jobs } — the app's JobRegistry. */
export function router(ctx = getState()) {
  const app = new Hono();
  app.get("/v1/jobs/:id", input({ params: IdParams }), (c) => {
    const job = ctx.jobs.get(c.req.valid("param").id);
    if (!job) throw notFound(`no job ${c.req.valid("param").id}`);
    return c.json(job);
  });
  // A house's running jobs (finding its parts, an AI photo): a page opened or reloaded while one runs
  // attaches to it instead of showing the house as it was before
  app.get("/v1/houses/:id/jobs", input({ params: IdParams }), (c) => {
    const id = c.req.valid("param").id;
    if (!getHouse(ctx.db, id)) throw houseNotFound(id);
    return c.json(ctx.jobs.runningFor(id));
  });
  app.delete("/v1/jobs/:id", input({ params: IdParams }), (c) => {
    const job = ctx.jobs.get(c.req.valid("param").id);
    if (!job) throw notFound(`no job ${c.req.valid("param").id}`);
    ctx.jobs.cancel(job.id);
    return c.json(ctx.jobs.get(job.id));
  });
  return app;
}
