// SPDX-License-Identifier: MIT
// The AI photo of a house (a job) and the AI photos kept. The engines and models — the AI photo's and the part
// finder's — are the kit's: its /v1/ai/runtimes routes install, download and remove them, and its arbiter says the
// graphics card is busy while another holds it (the kit's engines plan, H1 and round C).

import { existsSync, readFileSync } from "node:fs";
import { Hono, input } from "@delebash/core/platform";
import { ApiError, notFound } from "@delebash/core/platform/errors";
import { designNotFound, houseNotFound } from "./refusals.js";
import { addRender, deleteRender, getDesign, getHouse, getRender, listParts, listRenders } from "../database/houses.js";
import { paintsById } from "../database/paints.js";
import { removeHouseFile, renderFileId, renderPath } from "../files.js";
import { AiPhotoIn, IdParams } from "../schemas/houses.js";
import { getState } from "../app_state.js";

/** `ctx`: { db, dataDir, jobs, aiphoto, sharedGpu?, partLabel? } — `sharedGpu()` what else holds the graphics card
 * (services.js). */
export function router(ctx = getState()) {
  const app = new Hono();
  app.post("/v1/houses/:id/aiphoto", input({ params: IdParams, body: AiPhotoIn }), (c) => {
    const house = getHouse(ctx.db, c.req.valid("param").id);
    if (!house) throw houseNotFound(c.req.valid("param").id);
    const { designId, colors } = c.req.valid("json");
    let chosen = colors || {};
    if (designId) {
      const d = getDesign(ctx.db, designId);
      if (!d || d.houseId !== house.id) throw designNotFound(designId);
      chosen = d.colors;
    }
    const paintable = new Set(listParts(ctx.db, house.id).filter((p) => p.paintable && p.area > 0).map((p) => p.key));
    // each part's paint now, where its owner said: the lock paints in the light it gives
    const now = house.currentPaints || {};
    const paints = paintsById(ctx.db, [...Object.values(chosen), ...Object.values(now)].filter(Boolean));
    // a paint no longer loaded (its brand removed, or loaded again without it — in another window, maybe) is named,
    // never left out of the picture unsaid
    const gone = Object.entries(chosen).filter(([key, id]) => id && paintable.has(key) && !paints[id]);
    if (gone.length) {
      const parts = gone.map(([key]) => ctx.partLabel?.(key) ?? key);
      // a conflict with what is loaded now, not a malformed request: 409 (a 422 carries its fields' errors)
      throw new ApiError(409, "paints-gone", "Some colors aren't loaded any more", `the paint of the ${parts.join(", ")} — load its brand again, or pick another color`, {
        parts: gone.map(([key]) => key),
      });
    }
    const surfaces = Object.entries(chosen)
      .filter(([key, id]) => id && paintable.has(key) && paints[id])
      .map(([key, id]) => ({ key, hex: paints[id].hex, name: paints[id].name, currentHex: paints[now[key]]?.hex ?? null }));
    const job = ctx.jobs.start({ kind: "aiphoto", key: house.id, label: house.name, failTitle: "The AI photo didn't finish", clientId: c.req.header("x-client-id") || null }, async ({ signal, progress }) => {
      const renderId = crypto.randomUUID();
      // what else holds the graphics card, measured beside the render (about a second on Windows)
      const shared = (ctx.sharedGpu?.() ?? Promise.resolve(null)).catch(() => null);
      const r = await ctx.aiphoto.render(house, surfaces, { renderId, signal, progress });
      // the design deleted while it rendered: the AI photo stays, without the link
      const keepDesign = designId && getDesign(ctx.db, designId) ? designId : null;
      try {
        const render = addRender(ctx.db, { houseId: house.id, designId: keepDesign, file: r.file, engine: r.engine, deltaE: r.deltaE, worstPart: r.worstPart, seconds: r.seconds });
        return { ...render, sharedGpu: await shared };
      } catch (e) {
        // the picture whose row didn't save goes (retried; a held one is left) — the row's own error stands
        await removeHouseFile(renderPath(ctx.dataDir, house.id, r.file.replace(/\.png$/, "")));
        throw e;
      }
    });
    return c.json(job, 202);
  });

  app.get("/v1/houses/:id/renders", input({ params: IdParams }), (c) => {
    if (!getHouse(ctx.db, c.req.valid("param").id)) throw houseNotFound(c.req.valid("param").id);
    return c.json(listRenders(ctx.db, c.req.valid("param").id));
  });

  app.get("/v1/renders/:id/image", input({ params: IdParams }), (c) => {
    const r = getRender(ctx.db, c.req.valid("param").id);
    if (!r) throw notFound(`no AI photo ${c.req.valid("param").id}`);
    const fileId = renderFileId(r.file);
    const file = fileId && renderPath(ctx.dataDir, r.houseId, fileId);
    if (!file || !existsSync(file)) throw notFound("the AI photo's file is missing");
    return c.body(readFileSync(file), 200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
  });

  app.delete("/v1/renders/:id", input({ params: IdParams }), async (c) => {
    const r = getRender(ctx.db, c.req.valid("param").id);
    if (!r) throw notFound(`no AI photo ${c.req.valid("param").id}`);
    deleteRender(ctx.db, r.id);
    // the AI photo is gone; a file Windows still holds is left, never a row without its picture (and a name the app
    // never makes names no file of its own: the row goes, nothing else)
    const fileId = renderFileId(r.file);
    if (fileId) await removeHouseFile(renderPath(ctx.dataDir, r.houseId, fileId));
    return c.body(null, 204);
  });

  return app;
}
