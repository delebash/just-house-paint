// SPDX-License-Identifier: MIT
// The two local engines: the part finder (SAM 3) and the AI photo (stable-diffusion.cpp) — whether
// each is installed, installing it (a job: ~3.4 GB / ~9 GB of downloads), the AI photo of a house
// (a job), and the AI photos kept.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { Hono, input } from "@delebash/core/platform";
import { notFound } from "@delebash/core/platform/errors";
import { addRender, deleteRender, getDesign, getHouse, getRender, listParts, listRenders } from "../database/houses.js";
import { paintsById } from "../database/paints.js";
import { renderPath } from "../files.js";
import { AiPhotoIn, IdParams } from "../schemas/houses.js";
import { getState } from "../app_state.js";

/** `ctx`: { db, dataDir, jobs, finder, aiphoto, download } — `download` is the kit's streamDownload. */
export function router(ctx = getState()) {
  const app = new Hono();

  app.get("/v1/segment/status", (c) => c.json({ installed: ctx.finder.installed(), downloadBytes: ctx.finder.downloadBytes() }));

  app.post("/v1/segment/install", (c) => {
    const job = ctx.jobs.start({ kind: "install-finder", key: "" }, ({ signal, progress }) =>
      ctx.finder.install({
        download: ctx.download,
        signal,
        onProgress: (e) => progress(e.overallTotal ? e.overallDone / e.overallTotal : 0, e.name),
      }),
    );
    return c.json(job, 202);
  });

  app.get("/v1/aiphoto/status", async (c) => c.json(await ctx.aiphoto.status()));

  app.post("/v1/aiphoto/install", (c) => {
    const job = ctx.jobs.start({ kind: "install-aiphoto", key: "" }, ({ signal, progress }) => ctx.aiphoto.install({ download: ctx.download, signal, progress }));
    return c.json(job, 202);
  });

  app.post("/v1/houses/:id/aiphoto", input({ params: IdParams, body: AiPhotoIn }), (c) => {
    const house = getHouse(ctx.db, c.req.valid("param").id);
    if (!house) throw notFound(`no house ${c.req.valid("param").id}`);
    const { designId, colors } = c.req.valid("json");
    let chosen = colors || {};
    if (designId) {
      const d = getDesign(ctx.db, designId);
      if (!d || d.houseId !== house.id) throw notFound(`no design ${designId} for this house`);
      chosen = d.colors;
    }
    const paintable = new Set(listParts(ctx.db, house.id).filter((p) => p.paintable && p.area > 0).map((p) => p.key));
    const paints = paintsById(ctx.db, Object.values(chosen).filter(Boolean));
    const surfaces = Object.entries(chosen)
      .filter(([key, id]) => id && paintable.has(key) && paints[id])
      .map(([key, id]) => ({ key, hex: paints[id].hex, name: paints[id].name }));
    const job = ctx.jobs.start({ kind: "aiphoto", key: house.id, label: house.name }, async ({ signal, progress }) => {
      const renderId = crypto.randomUUID();
      const r = await ctx.aiphoto.render(house, surfaces, { renderId, signal, progress });
      return addRender(ctx.db, { houseId: house.id, designId: designId || null, file: r.file, engine: r.engine, deltaE: r.deltaE, seconds: r.seconds });
    });
    return c.json(job, 202);
  });

  app.get("/v1/houses/:id/renders", input({ params: IdParams }), (c) => {
    if (!getHouse(ctx.db, c.req.valid("param").id)) throw notFound(`no house ${c.req.valid("param").id}`);
    return c.json(listRenders(ctx.db, c.req.valid("param").id));
  });

  app.get("/v1/renders/:id/image", input({ params: IdParams }), (c) => {
    const r = getRender(ctx.db, c.req.valid("param").id);
    if (!r) throw notFound(`no AI photo ${c.req.valid("param").id}`);
    const file = renderPath(ctx.dataDir, r.houseId, r.file.replace(/\.png$/, ""));
    if (!existsSync(file)) throw notFound("the AI photo's file is missing");
    return c.body(readFileSync(file), 200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
  });

  app.delete("/v1/renders/:id", input({ params: IdParams }), (c) => {
    const r = getRender(ctx.db, c.req.valid("param").id);
    if (!r) throw notFound(`no AI photo ${c.req.valid("param").id}`);
    rmSync(renderPath(ctx.dataDir, r.houseId, r.file.replace(/\.png$/, "")), { force: true });
    deleteRender(ctx.db, r.id);
    return c.body(null, 204);
  });

  return app;
}
