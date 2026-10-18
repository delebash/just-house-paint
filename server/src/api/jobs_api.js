// SPDX-License-Identifier: MIT
// /v1/jobs/:id — what a long job is doing (the screen polls it inside the kit's withAiTask), and
// DELETE to stop it.

import { Hono, input } from "@delebash/core/platform";
import { notFound } from "@delebash/core/platform/errors";
import { getState } from "../app_state.js";
import { IdParams } from "../schemas/houses.js";

/** `ctx`: { jobs } — the app's JobRegistry. */
export function router(ctx = getState()) {
  const app = new Hono();
  app.get("/v1/jobs/:id", input({ params: IdParams }), (c) => {
    const job = ctx.jobs.get(c.req.valid("param").id);
    if (!job) throw notFound(`no job ${c.req.valid("param").id}`);
    return c.json(job);
  });
  app.delete("/v1/jobs/:id", input({ params: IdParams }), (c) => {
    const job = ctx.jobs.get(c.req.valid("param").id);
    if (!job) throw notFound(`no job ${c.req.valid("param").id}`);
    ctx.jobs.cancel(job.id);
    return c.json(ctx.jobs.get(job.id));
  });
  return app;
}
