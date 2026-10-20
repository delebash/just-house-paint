// SPDX-License-Identifier: MIT
// /v1/houses/:id/parts — the parts the finder found (or the user drew): their masks, finding them
// (a job), a box whose contents move into a part, a mask fixed by the brush, a part added by hand.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Hono, input, uploadLimit } from "@delebash/core/platform";
import { ApiError, conflict, notFound, RequestValidationError } from "@delebash/core/platform/errors";
import { getHouse, getPart, listParts, replaceParts, updatePartMask } from "../database/houses.js";
import { maskPath, removeHouseFile } from "../files.js";
import { maskToPng, pngToMask } from "../images.js";
import { BoxIn, FindPartsIn, IdParams, PartNew, PartParams } from "../schemas/houses.js";
import { area, assignRegion, subtractRegion } from "../shared/masks.js";
import { getState } from "../app_state.js";
import { assertGpuFree } from "../jobs.js";

/**
 * `ctx`: { db, dataDir, jobs, finder } — `finder` is the part finder (segment/):
 *   finder.find(house, { signal, progress }) → [{ key, paintable, score, mask }] at display size
 *   finder.box(house, { x0, y0, x1, y1 }) → a Uint8Array region at display size
 */
export function router(ctx = getState()) {
  const app = new Hono();
  const mustHouse = (id) => {
    const h = getHouse(ctx.db, id);
    if (!h) throw notFound(`no house ${id}`);
    return h;
  };
  const readMask = async (house, key) => {
    const file = maskPath(ctx.dataDir, house.id, key);
    if (!existsSync(file)) return new Uint8Array(house.displayWidth * house.displayHeight);
    return pngToMask(readFileSync(file), house.displayWidth, house.displayHeight);
  };
  const writeMask = async (house, key, mask) => {
    writeFileSync(maskPath(ctx.dataDir, house.id, key), await maskToPng(mask, house.displayWidth, house.displayHeight));
  };

  app.get("/v1/houses/:id/parts", input({ params: IdParams }), (c) => {
    const house = mustHouse(c.req.valid("param").id);
    return c.json(listParts(ctx.db, house.id));
  });

  app.post("/v1/houses/:id/find-parts", input({ params: IdParams, body: FindPartsIn }), (c) => {
    const house = mustHouse(c.req.valid("param").id);
    const keepEdited = c.req.valid("json")?.keepEdited === true;
    assertGpuFree(ctx.jobs, "find-parts", house.id);
    if (ctx.enginesRemoving?.has("finder")) throw new ApiError(409, "engine-busy", "The part finder is being removed", "try again when it's done");
    const job = ctx.jobs.start({ kind: "find-parts", key: house.id, label: house.name, failTitle: "Finding the parts didn't finish" }, async ({ signal, progress }) => {
      const found = await ctx.finder.find(house, { signal, progress });
      signal.throwIfAborted();
      // the parts changed by hand, read as the run ends (a stroke made while it ran counts too)
      const before = listParts(ctx.db, house.id);
      const kept = keepEdited ? before.filter((p) => p.source === "edited" || p.source === "added") : [];
      const keptKeys = new Set(kept.map((p) => p.key));
      if (kept.length) {
        // a hand-made outline keeps its pixels: the parts found now are cut around it
        const theirs = new Uint8Array(house.displayWidth * house.displayHeight);
        for (const p of kept) {
          const m = await readMask(house, p.key);
          for (let i = 0; i < m.length; i++) if (m[i] >= 128) theirs[i] = 255;
        }
        for (const p of found) if (!keptKeys.has(p.key)) subtractRegion(p.mask, theirs);
      }
      for (const p of found) if (!keptKeys.has(p.key)) await writeMask(house, p.key, p.mask);
      const asIs = (p) => ({ key: p.key, paintable: p.paintable, area: p.area, score: p.score, source: p.source });
      const rows = [
        // the finder's order, a kept part in its place; kept parts it didn't find after them
        ...found.map((p) =>
          keptKeys.has(p.key) ? asIs(kept.find((k) => k.key === p.key)) : { key: p.key, paintable: p.paintable, area: area(p.mask), score: p.score, source: "auto" },
        ),
        ...kept.filter((k) => !found.some((p) => p.key === k.key)).map(asIs),
      ];
      const parts = replaceParts(ctx.db, house.id, rows);
      // the outlines of parts not found this time go with their rows (a smaller folder and backup)
      const stays = new Set(rows.map((r) => r.key));
      // each one only while its part is still gone (a part added again meanwhile keeps its new outline)
      for (const p of before) {
        if (!stays.has(p.key) && !getPart(ctx.db, house.id, p.key)) await removeHouseFile(maskPath(ctx.dataDir, house.id, p.key));
      }
      return { parts: parts.length, kept: kept.length };
    });
    return c.json(job, 202);
  });

  app.get("/v1/houses/:id/parts/:key/mask", input({ params: PartParams }), (c) => {
    const house = mustHouse(c.req.valid("param").id);
    const key = c.req.valid("param").key;
    if (!getPart(ctx.db, house.id, key)) throw notFound(`house ${house.id} has no part ${key}`);
    const file = maskPath(ctx.dataDir, house.id, key);
    if (!existsSync(file)) throw notFound(`the mask of ${key} is missing`);
    return c.body(readFileSync(file), 200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
  });

  // The brush's result: a PNG the display photo's size (another size is scaled to it).
  // an outline PNG is never bigger than its raw pixels at the largest screen copy
  const maskLimit = () => (ctx.limits?.().displayMax || 4096) ** 2 * 4;
  app.put("/v1/houses/:id/parts/:key/mask", uploadLimit(maskLimit, { slug: "mask-too-large", title: "Outline too large" }), input({ params: PartParams }), async (c) => {
    const house = mustHouse(c.req.valid("param").id);
    const key = c.req.valid("param").key;
    if (!getPart(ctx.db, house.id, key)) throw notFound(`house ${house.id} has no part ${key}`);
    if (!/^image\/png\b/i.test(c.req.header("content-type") || "")) {
      throw new RequestValidationError([{ loc: ["body"], msg: "Expected an image/png body", type: "value_error" }]);
    }
    let mask;
    try {
      mask = await pngToMask(Buffer.from(await c.req.arrayBuffer()), house.displayWidth, house.displayHeight);
    } catch {
      throw new RequestValidationError([{ loc: ["body"], msg: "Not a readable PNG", type: "value_error" }]);
    }
    await writeMask(house, key, mask);
    return c.json(updatePartMask(ctx.db, house.id, key, { area: area(mask) }));
  });

  app.post("/v1/houses/:id/parts", input({ params: IdParams, body: PartNew }), async (c) => {
    const house = mustHouse(c.req.valid("param").id);
    const { key, paintable } = c.req.valid("json");
    if (getPart(ctx.db, house.id, key)) throw conflict(`house ${house.id} already has a part ${key}`);
    await writeMask(house, key, new Uint8Array(house.displayWidth * house.displayHeight));
    return c.json(updatePartMask(ctx.db, house.id, key, { area: 0, paintable, source: "added" }), 201);
  });

  // A box: the finder outlines what is inside it; `add` gives it to this part (taking it from the
  // others), `remove` takes it out of this part only. Answers the parts that changed.
  app.post("/v1/houses/:id/parts/:key/box", input({ params: PartParams, body: BoxIn }), async (c) => {
    const house = mustHouse(c.req.valid("param").id);
    const key = c.req.valid("param").key;
    if (!getPart(ctx.db, house.id, key)) throw notFound(`house ${house.id} has no part ${key}`);
    assertGpuFree(ctx.jobs, "box");
    if (ctx.enginesRemoving?.has("finder")) throw new ApiError(409, "engine-busy", "The part finder is being removed", "try again when it's done");
    const { x0, y0, x1, y1, mode } = c.req.valid("json");
    const outside = [["x0", x0, house.displayWidth], ["x1", x1, house.displayWidth], ["y0", y0, house.displayHeight], ["y1", y1, house.displayHeight]].find(([, v, max]) => v > max);
    if (outside) throw new RequestValidationError([{ loc: ["body", outside[0]], msg: "Outside the photo", type: "value_error" }]);
    if (x1 - x0 < 2 || y1 - y0 < 2) throw new RequestValidationError([{ loc: ["body"], msg: "Draw a box at least 2 pixels wide and tall", type: "value_error" }]);
    const region = await ctx.finder.box(house, { x0, y0, x1, y1 });
    const parts = listParts(ctx.db, house.id);
    let changed;
    if (mode === "remove") {
      const mask = await readMask(house, key);
      changed = subtractRegion(mask, region) ? [key] : [];
      if (changed.length) await writeMask(house, key, mask);
      if (changed.length) updatePartMask(ctx.db, house.id, key, { area: area(mask) });
    } else {
      const masks = {};
      for (const p of parts) masks[p.key] = await readMask(house, p.key);
      changed = assignRegion(masks, key, region);
      for (const k of changed) {
        await writeMask(house, k, masks[k]);
        updatePartMask(ctx.db, house.id, k, { area: area(masks[k]) });
      }
    }
    return c.json({ changed, parts: listParts(ctx.db, house.id) });
  });

  return app;
}
