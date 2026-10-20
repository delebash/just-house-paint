// SPDX-License-Identifier: MIT
// /v1/houses — your houses: add a photo, list, rename, delete, and the photo's three copies.
// A photo arrives as multipart/form-data (`file`, optional `name`), read with Hono's parseBody
// (hono.dev/docs/api/request#parsebody) — a phone photo is a few MB.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Hono, input, uploadLimit } from "@delebash/core/platform";
import { ApiError, notFound, RequestValidationError } from "@delebash/core/platform/errors";
import { houseNotFound } from "./refusals.js";
import { createHouse, deleteHouse, getHouse, listHouses, patchCurrentPaints, renameHouse, setCurrentPaints } from "../database/houses.js";
import { addingHouseDir, displayPath, houseAdded, originalPath, removeHouseDir, thumbPath } from "../files.js";
import { ingestPhoto, NotAnImage, TooManyPixels } from "../images.js";
import { CurrentPaintsIn, CurrentPaintsPatch, HousePatch, IdParams, ImageQuery } from "../schemas/houses.js";
import { getState } from "../app_state.js";
import { cleanName, cutToLength, nameKey, nameProblem } from "../shared/text.js";

const CONTENT_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** A house's longest name — the rename's (HousePatch, schemas/houses.js). */
const NAME_MAX = 80;

/** A photo's name from its file name: "my-house_2024.jpg" → "my house 2024". */
export function nameFromFile(filename) {
  const base = path.basename(String(filename || "")).replace(/\.[^.]+$/, "");
  const name = cleanName(base.replace(/[_-]+/g, " "));
  return (nameKey(name) && cutToLength(name, NAME_MAX)) || "My house";
}

/**
 * The houses router. `ctx`: { db, dataDir, limits() → { displayMax, thumbMax, jpegQuality,
 * maxPhotoBytes } } — limits are settings rows (family rule 1), read per request.
 */
export function router(ctx = getState()) {
  const app = new Hono();
  // a multipart form's own bytes beside its file (boundaries, headers, the name field)
  const FORM_EXTRA = 64 * 1024;
  const must = (id) => {
    const h = getHouse(ctx.db, id);
    if (!h) throw houseNotFound(id);
    return h;
  };

  app.get("/v1/houses", (c) => c.json(listHouses(ctx.db)));

  // the photo's size, checked as it streams in (the form's few other bytes on top); the exact
  // message comes from the check after it is read
  app.post("/v1/houses", uploadLimit(() => ctx.limits().maxPhotoBytes + FORM_EXTRA, { slug: "photo-too-large", title: "Photo too large" }), async (c) => {
    const limits = ctx.limits();
    let body;
    try {
      body = await c.req.parseBody();
    } catch {
      // a form cut off, or with no boundary: said as that — it read "file: Field required" (the nineteenth's fuzz)
      throw new RequestValidationError([{ loc: ["body"], msg: "The upload was cut off or isn't a form — send the file again", type: "value_error" }]);
    }
    const file = body.file;
    if (!(file instanceof Blob)) throw new RequestValidationError([{ loc: ["body", "file"], msg: "Field required", type: "missing" }]);
    if (file.size > limits.maxPhotoBytes) {
      throw new ApiError(413, "photo-too-large", "Photo too large", `the photo is ${Math.round(file.size / 1e6)} MB; the limit is ${Math.round(limits.maxPhotoBytes / 1e6)} MB`, {
        limit: limits.maxPhotoBytes,
      });
    }
    const given = typeof body.name === "string" ? cleanName(body.name) : "";
    const name = nameKey(given) ? cutToLength(given, NAME_MAX) : nameFromFile(file.name);
    const id = crypto.randomUUID();
    let made;
    try {
      // the folder is marked until the house's row exists: a crash in between leaves nothing for good
      addingHouseDir(ctx.dataDir, id);
      const facts = await ingestPhoto(Buffer.from(await file.arrayBuffer()), ctx.dataDir, id, limits);
      made = createHouse(ctx.db, { id, name, ...facts });
    } catch (e) {
      await (ctx.removeHouseDir ?? removeHouseDir)(ctx.dataDir, id);
      if (e instanceof TooManyPixels) throw new ApiError(413, "photo-too-large", "Photo too large", e.message);
      if (e instanceof NotAnImage) throw new ApiError(415, "not-a-photo", "Not a photo", e.message);
      throw e;
    }
    try {
      houseAdded(ctx.dataDir, id);
    } catch {
      // the house is added; a mark left on its folder is harmless (the sweep never takes a house's)
    }
    return c.json(made, 201);
  });

  // the house with its outlines' version (outlines.js) — read before its outlines, so a page never holds outlines
  // older than the version it sends back
  app.get("/v1/houses/:id", input({ params: IdParams }), (c) => {
    const house = must(c.req.valid("param").id);
    return c.json(ctx.outlines ? { ...house, outlines: ctx.outlines.etag(house.id) } : house);
  });

  app.patch("/v1/houses/:id", input({ params: IdParams, body: HousePatch }), (c) => {
    must(c.req.valid("param").id);
    const name = cleanName(c.req.valid("json").name);
    const wrong = nameProblem(name, NAME_MAX);
    if (wrong) throw new RequestValidationError([{ loc: ["body", "name"], ...wrong }]);
    return c.json(renameHouse(ctx.db, c.req.valid("param").id, name));
  });

  // The paint each part has now (the light on the photo is worked out from it): PUT the whole map, PATCH only the
  // parts named (JSON Merge Patch — the window's own changes, so another window's stay).
  app.put("/v1/houses/:id/current-paints", input({ params: IdParams, body: CurrentPaintsIn }), (c) => {
    must(c.req.valid("param").id);
    return c.json(setCurrentPaints(ctx.db, c.req.valid("param").id, c.req.valid("json")));
  });
  app.patch("/v1/houses/:id/current-paints", input({ params: IdParams, body: CurrentPaintsPatch }), (c) => {
    must(c.req.valid("param").id);
    return c.json(patchCurrentPaints(ctx.db, c.req.valid("param").id, c.req.valid("json")));
  });

  app.delete("/v1/houses/:id", input({ params: IdParams }), async (c) => {
    const id = c.req.valid("param").id;
    must(id);
    // its AI photo or part search stops (and frees the graphics card) instead of failing later
    for (const kind of ["aiphoto", "find-parts"]) {
      const job = ctx.jobs?.running(kind, id);
      if (job) ctx.jobs.cancel(job.id);
    }
    deleteHouse(ctx.db, id);
    // the house is gone; a folder Windows still holds goes a little later (or at the next start) —
    // unless the house came back meanwhile (a backup restored)
    const remove = ctx.removeHouseDir ?? removeHouseDir; // a test passes one Windows holds
    if (!(await remove(ctx.dataDir, id))) {
      const later = setTimeout(() => {
        if (!getHouse(ctx.db, id)) remove(ctx.dataDir, id);
      }, 30_000);
      later.unref?.();
    }
    return c.body(null, 204);
  });

  app.get("/v1/houses/:id/image", input({ params: IdParams, querystring: ImageQuery }), (c) => {
    const house = must(c.req.valid("param").id);
    const { size } = c.req.valid("query");
    const file =
      size === "thumb" ? thumbPath(ctx.dataDir, house.id) : size === "original" ? originalPath(ctx.dataDir, house.id, house.originalFile) : displayPath(ctx.dataDir, house.id);
    if (!existsSync(file)) throw notFound(`the ${size} copy of house ${house.id} is missing`);
    const ext = path.extname(file).slice(1).toLowerCase();
    return c.body(readFileSync(file), 200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
  });

  return app;
}
