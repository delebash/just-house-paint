// SPDX-License-Identifier: MIT
// /v1/houses/:id/parts — the parts the finder found (or the user drew): their masks, finding them
// (a job), a box whose contents move into a part, a mask fixed by the brush, a part added by hand.
// The outlines carry a version (outlines.js): a stroke, a Box and Find the parts send the one the page
// read (If-Match) and are refused (412) when another window changed them since; the writes run one at a
// time per house, and each answers the new version (`outlines`, and the ETag header).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Hono, input, uploadLimit } from "@delebash/core/platform";
import { ApiError, conflict, notFound, RequestValidationError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { renameHeldSync } from "@delebash/core/platform/rename_held";
import { houseNotFound } from "./refusals.js";
import { getHouse, getPart, listParts, replaceParts, updatePartMask } from "../database/houses.js";
import { maskPath, removeHouseFile } from "../files.js";
import { maskToPng, pngToMask } from "../images.js";
import { BoxIn, FindPartsIn, IdParams, PartNew, PartParams } from "../schemas/houses.js";
import { area, assignRegion, subtractRegion } from "../shared/masks.js";
import { getState } from "../app_state.js";
import { assertGpuFree } from "../jobs.js";

const log = getLogger("just_house_paint.parts");

/**
 * `ctx`: { db, dataDir, jobs, finder, outlines } — `finder` is the part finder (segment/):
 *   finder.find(house, { signal, progress }) → [{ key, paintable, score, mask }] at display size
 *   finder.box(house, { x0, y0, x1, y1 }) → a Uint8Array region at display size
 */
export function router(ctx = getState()) {
  const app = new Hono();
  const mustHouse = (id) => {
    const h = getHouse(ctx.db, id);
    if (!h) throw houseNotFound(id);
    return h;
  };
  const readMask = async (house, key) => {
    const file = maskPath(ctx.dataDir, house.id, key);
    const empty = () => new Uint8Array(house.displayWidth * house.displayHeight);
    if (!existsSync(file)) return empty();
    try {
      return await pngToMask(readFileSync(file), house.displayWidth, house.displayHeight);
    } catch (e) {
      // an outline that can't be read (a file an older version left cut short) is an empty one — never a
      // Box, a Keep or an AI photo that fails for the whole house
      log.warning(`the outline of ${key} on house ${house.id} can't be read (${String(e?.message || e).split("\n")[0]}); taken as empty`);
      return empty();
    }
  };
  /** Outlines saved (`masks`: [[key, mask]]): the PNGs made first, then in one step the house checked, the
   *  files written and `rows()` run (the parts' rows), whose value comes back — a house deleted or reset while
   *  the PNGs were made is a 404, never files written into a folder going away or half the outlines saved;
   *  a job stopped meanwhile (`signal`) saves nothing. Each file is written beside its place and renamed in
   *  only once every one is written: a disk that fills meanwhile leaves the old outlines whole (a write in
   *  place truncated one). The masks folder is made if it is missing (a backup keeps no empty folder: a
   *  house restored before its parts were found has none). */
  const saveMasks = async (house, masks, rows = () => null, signal = null) => {
    const pngs = await Promise.all(masks.map(([, mask]) => maskToPng(mask, house.displayWidth, house.displayHeight)));
    signal?.throwIfAborted();
    if (!getHouse(ctx.db, house.id)) throw houseNotFound(house.id);
    if (masks.length) mkdirSync(path.dirname(maskPath(ctx.dataDir, house.id, masks[0][0])), { recursive: true });
    const files = masks.map(([key]) => maskPath(ctx.dataDir, house.id, key));
    try {
      files.forEach((file, i) => writeFileSync(`${file}.saving`, pngs[i]));
    } catch (e) {
      for (const file of files) rmSync(`${file}.saving`, { force: true });
      throw e;
    }
    // a file just written can be held a moment (an antivirus reading it): each rename waits for it — the kit's
    // renameHeldSync, synchronous so the step stays one (a refused rename left half the outlines saved)
    for (const file of files) renameHeldSync(`${file}.saving`, file);
    return rows();
  };

  /** The version the request was made on — refused when another window changed the outlines since. */
  const mustBeCurrent = (c, house) => ctx.outlines.check(house.id, c.req.header("if-match"));
  /** A stroke, a Box or an added part while the parts are being found would be lost under what the finder saves:
   *  refused (another window's run — this window's own tools are off while it runs) — before the work, and again in
   *  the outlines' turn, where a find started meanwhile is seen. */
  const notWhileFinding = (house) => {
    if (ctx.jobs.running("find-parts", house.id)) {
      throw new ApiError(409, "finding-parts", "The parts are being found", "your change wasn't saved — the house shows the parts found when it's done");
    }
  };
  /** The outlines changed: their new version, on the answer too (ETag). */
  const newVersion = (c, house) => {
    const etag = ctx.outlines.etag(house.id);
    c.header("ETag", etag);
    return etag;
  };

  app.get("/v1/houses/:id/parts", input({ params: IdParams }), (c) => {
    const house = mustHouse(c.req.valid("param").id);
    c.header("ETag", ctx.outlines.etag(house.id));
    return c.json(listParts(ctx.db, house.id));
  });

  app.post("/v1/houses/:id/find-parts", input({ params: IdParams, body: FindPartsIn }), (c) => {
    const house = mustHouse(c.req.valid("param").id);
    const keepEdited = c.req.valid("json")?.keepEdited === true;
    // whether to keep the hand edits was asked from what this page read: another window's edits since aren't in it
    mustBeCurrent(c, house);
    // a run another window started with the other choice isn't joined as if it were this one's
    const running = ctx.jobs.running("find-parts", house.id);
    if (running && (running.meta?.keepEdited === true) !== keepEdited) {
      throw new ApiError(409, "already-finding", "The parts are already being found", "another window started it, with its own choice about the hand edits — wait for it, or cancel it first");
    }
    assertGpuFree(ctx.jobs, "find-parts", house.id);
    if (ctx.enginesRemoving?.has("finder")) throw new ApiError(409, "engine-busy", "The part finder is being removed", "try again when it's done");
    const start = { kind: "find-parts", key: house.id, label: house.name, failTitle: "Finding the parts didn't finish", clientId: c.req.header("x-client-id") || null, meta: { keepEdited } };
    const job = ctx.jobs.start(start, async ({ signal, progress }) => {
      const found = await ctx.finder.find(house, { signal, progress });
      signal.throwIfAborted();
      // the commit alone among the house's outline writes: a stroke saved meanwhile is read below, never lost
      return ctx.outlines.serial(house.id, () => commitFound(house, found, keepEdited, signal));
    });
    return c.json(job, 202);
  });

  /** A find's result saved: the parts changed by hand kept when asked, the others the finder's. */
  const commitFound = async (house, found, keepEdited, signal) => {
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
      // what the finder gave a part kept as drawn, on the house itself, and no part has now, goes back to the
      // base part (the body): a Trim fixed by hand before the doors' casings were trim leaves them on the
      // walls, not in no part. Only on the house's own outline (`house`): what the other parts reach past it
      // (their margin — sky, a neighbor's roof) is never painted as wall; no outline given, nothing moves
      const base = found.find((p) => p.base && p.house && !keptKeys.has(p.key));
      if (base) {
        const taken = theirs;
        for (const p of found) if (!keptKeys.has(p.key)) for (let i = 0; i < taken.length; i++) if (p.mask[i] >= 128) taken[i] = 255;
        for (const p of found) {
          if (!keptKeys.has(p.key)) continue;
          for (let i = 0; i < taken.length; i++) if (p.mask[i] >= 128 && !taken[i] && base.house[i] >= 128) base.mask[i] = 255;
        }
      }
    }
    const asIs = (p) => ({ key: p.key, paintable: p.paintable, area: p.area, score: p.score, source: p.source });
    const rows = [
      // the finder's order, a kept part in its place; kept parts it didn't find after them
      ...found.map((p) =>
        keptKeys.has(p.key) ? asIs(kept.find((k) => k.key === p.key)) : { key: p.key, paintable: p.paintable, area: area(p.mask), score: p.score, source: "auto" },
      ),
      ...kept.filter((k) => !found.some((p) => p.key === k.key)).map(asIs),
    ];
    const fresh = found.filter((p) => !keptKeys.has(p.key)).map((p) => [p.key, p.mask]);
    const parts = await saveMasks(house, fresh, () => replaceParts(ctx.db, house.id, rows), signal);
    // the outlines of parts not found this time go with their rows (a smaller folder and backup)
    const stays = new Set(rows.map((r) => r.key));
    // each one only while its part is still gone (a part added again meanwhile keeps its new outline)
    for (const p of before) {
      if (!stays.has(p.key) && !getPart(ctx.db, house.id, p.key)) await removeHouseFile(maskPath(ctx.dataDir, house.id, p.key));
    }
    return { parts: parts.length, kept: kept.length, outlines: ctx.outlines.etag(house.id) };
  };

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
    mustBeCurrent(c, house);
    notWhileFinding(house);
    if (!/^image\/png\b/i.test(c.req.header("content-type") || "")) {
      throw new RequestValidationError([{ loc: ["body"], msg: "Expected an image/png body", type: "value_error" }]);
    }
    let mask;
    try {
      mask = await pngToMask(Buffer.from(await c.req.arrayBuffer()), house.displayWidth, house.displayHeight);
    } catch {
      throw new RequestValidationError([{ loc: ["body"], msg: "Not a readable PNG", type: "value_error" }]);
    }
    return ctx.outlines.serial(house.id, async () => {
      mustBeCurrent(c, house); // again, once its turn came: a write queued before it may have changed them
      // and the finding check again: a find started while this PNG decoded would save its parts over the stroke
      // (answered 200, then lost — the nineteenth review's fuzz)
      notWhileFinding(house);
      const part = await saveMasks(house, [[key, mask]], () => updatePartMask(ctx.db, house.id, key, { area: area(mask) }));
      return c.json({ ...part, outlines: newVersion(c, house) });
    });
  });

  app.post("/v1/houses/:id/parts", input({ params: IdParams, body: PartNew }), async (c) => {
    const house = mustHouse(c.req.valid("param").id);
    const { key, paintable } = c.req.valid("json");
    if (getPart(ctx.db, house.id, key)) throw conflict(`house ${house.id} already has a part ${key}`);
    const empty = new Uint8Array(house.displayWidth * house.displayHeight);
    // a new part's row changes the version: made on the outlines the page holds, it answers the next one
    mustBeCurrent(c, house);
    // never while the parts are being found: the find's commit replaced the parts and the new one was gone
    notWhileFinding(house);
    return ctx.outlines.serial(house.id, async () => {
      mustBeCurrent(c, house);
      notWhileFinding(house);
      const part = await saveMasks(house, [[key, empty]], () => updatePartMask(ctx.db, house.id, key, { area: 0, paintable, source: "added" }));
      return c.json({ ...part, outlines: newVersion(c, house) }, 201);
    });
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
    mustBeCurrent(c, house);
    notWhileFinding(house);
    const region = await ctx.finder.box(house, { x0, y0, x1, y1 });
    // the outlines read, changed and saved alone: a stroke saved meanwhile waits its turn (never lost under it)
    return ctx.outlines.serial(house.id, async () => {
      mustBeCurrent(c, house);
      notWhileFinding(house); // a find started while the finder outlined the box would save over it
      return c.json(await boxInto(house, key, mode, region, c));
    });
  });

  /** The box's region given to part `key` (or taken out of it): every changed outline saved together. */
  const boxInto = async (house, key, mode, region, c) => {
    const parts = listParts(ctx.db, house.id);
    let changed;
    const masks = {};
    if (mode === "remove") {
      masks[key] = await readMask(house, key);
      changed = subtractRegion(masks[key], region) ? [key] : [];
    } else {
      for (const p of parts) masks[p.key] = await readMask(house, p.key);
      changed = assignRegion(masks, key, region);
    }
    // every changed outline saved together, with its row
    await saveMasks(
      house,
      changed.map((k) => [k, masks[k]]),
      () => {
        // the part the box gives to is changed by hand; the parts it took from only lost some of it
        for (const k of changed) updatePartMask(ctx.db, house.id, k, { area: area(masks[k]), source: k === key ? "edited" : null });
      },
    );
    return { changed, parts: listParts(ctx.db, house.id), outlines: changed.length ? newVersion(c, house) : ctx.outlines.etag(house.id) };
  };

  return app;
}
