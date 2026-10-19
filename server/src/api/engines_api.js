// SPDX-License-Identifier: MIT
// The two local engines: the part finder (SAM 3) and the AI photo (stable-diffusion.cpp) — whether
// each is installed, installing it (a job: ~3.4 GB / ~9 GB of downloads), the AI photo of a house
// (a job), and the AI photos kept.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { assertGpuFree } from "../jobs.js";
import { Hono, input } from "@delebash/core/platform";
import { ApiError, notFound } from "@delebash/core/platform/errors";
import { addRender, deleteRender, getDesign, getHouse, getRender, listParts, listRenders } from "../database/houses.js";
import { paintsById } from "../database/paints.js";
import { renderPath } from "../files.js";
import { AiPhotoIn, IdParams } from "../schemas/houses.js";
import { getState } from "../app_state.js";

/** `ctx`: { db, dataDir, jobs, finder, aiphoto, download, sharedGpu? } — `download` is the kit's
 * streamDownload; `sharedGpu()` what else holds the graphics card (services.js). */
export function router(ctx = getState()) {
  const app = new Hono();

  // not installed yet: whether its runtime loads here, so the install card can say so before the download
  app.get("/v1/segment/status", async (c) => {
    const installed = ctx.finder.installed();
    return c.json({ installed, downloadBytes: ctx.finder.downloadBytes(), ...(installed ? {} : { runtime: await ctx.finder.runtime() }) });
  });

  // The finder's runtime loads on this computer (the release's start check asks it on every runner).
  app.get("/v1/segment/runtime", async (c) => {
    const r = await ctx.finder.runtime();
    if (!r.ok) throw new ApiError(503, "runtime-missing", "The part finder can't run on this computer", r.error);
    return c.json(r);
  });

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

  // Remove the part finder's model (Settings → Storage) — not while it finds parts or installs.
  app.delete("/v1/segment/install", async (c) => {
    if (ctx.jobs.busy(["find-parts", "install-finder"])) {
      throw new ApiError(409, "engine-busy", "The part finder is busy", "wait until it has finished finding the parts or installing");
    }
    await ctx.finder.uninstall();
    return c.body(null, 204);
  });

  app.get("/v1/aiphoto/status", async (c) => c.json(await ctx.aiphoto.status()));

  // Remove the AI photo's engine and models (Settings → Storage) — not while it draws or installs.
  app.delete("/v1/aiphoto/install", async (c) => {
    if (ctx.jobs.busy(["aiphoto", "install-aiphoto"])) {
      throw new ApiError(409, "engine-busy", "The AI photo is busy", "wait until it has finished drawing or installing");
    }
    await ctx.aiphoto.uninstall();
    return c.body(null, 204);
  });

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
    // each part's paint now, where its owner said: the lock paints in the light it gives
    const now = house.currentPaints || {};
    const paints = paintsById(ctx.db, [...Object.values(chosen), ...Object.values(now)].filter(Boolean));
    const surfaces = Object.entries(chosen)
      .filter(([key, id]) => id && paintable.has(key) && paints[id])
      .map(([key, id]) => ({ key, hex: paints[id].hex, name: paints[id].name, currentHex: paints[now[key]]?.hex ?? null }));
    assertGpuFree(ctx.jobs, "aiphoto", house.id);
    const job = ctx.jobs.start({ kind: "aiphoto", key: house.id, label: house.name }, async ({ signal, progress }) => {
      const renderId = crypto.randomUUID();
      // what else holds the graphics card, measured beside the render (about a second on Windows)
      const shared = (ctx.sharedGpu?.() ?? Promise.resolve(null)).catch(() => null);
      const r = await ctx.aiphoto.render(house, surfaces, { renderId, signal, progress });
      // the design deleted while it rendered: the AI photo stays, without the link
      const keepDesign = designId && getDesign(ctx.db, designId) ? designId : null;
      try {
        const render = addRender(ctx.db, { houseId: house.id, designId: keepDesign, file: r.file, engine: r.engine, deltaE: r.deltaE, seconds: r.seconds });
        return { ...render, sharedGpu: await shared };
      } catch (e) {
        rmSync(renderPath(ctx.dataDir, house.id, r.file.replace(/\.png$/, "")), { force: true });
        throw e;
      }
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
