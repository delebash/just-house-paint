// SPDX-License-Identifier: MIT
// /v1/houses — your houses: add a photo, list, rename, delete, and the photo's three copies.
// A photo arrives as multipart/form-data (`file`, optional `name`), read with Hono's parseBody
// (hono.dev/docs/api/request#parsebody) — a phone photo is a few MB.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Hono, input } from "@delebash/core/platform";
import { ApiError, notFound, RequestValidationError } from "@delebash/core/platform/errors";
import { createHouse, deleteHouse, getHouse, listHouses, renameHouse } from "../database/houses.js";
import { displayPath, originalPath, removeHouseDir, thumbPath } from "../files.js";
import { ingestPhoto, NotAnImage } from "../images.js";
import { HousePatch, IdParams, ImageQuery } from "../schemas/houses.js";
import { getState } from "../app_state.js";

const CONTENT_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** A photo's name from its file name: "my-house_2024.jpg" → "my house 2024". */
export function nameFromFile(filename) {
  const base = path.basename(String(filename || "")).replace(/\.[^.]+$/, "");
  const name = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return name.slice(0, 80) || "My house";
}

/**
 * The houses router. `ctx`: { db, dataDir, limits() → { displayMax, thumbMax, jpegQuality,
 * maxPhotoBytes } } — limits are settings rows (family rule 1), read per request.
 */
export function router(ctx = getState()) {
  const app = new Hono();
  const must = (id) => {
    const h = getHouse(ctx.db, id);
    if (!h) throw notFound(`no house ${id}`);
    return h;
  };

  app.get("/v1/houses", (c) => c.json(listHouses(ctx.db)));

  app.post("/v1/houses", async (c) => {
    const limits = ctx.limits();
    let body;
    try {
      body = await c.req.parseBody();
    } catch {
      body = {};
    }
    const file = body.file;
    if (!(file instanceof Blob)) throw new RequestValidationError([{ loc: ["body", "file"], msg: "Field required", type: "missing" }]);
    if (file.size > limits.maxPhotoBytes) {
      throw new ApiError(413, "photo-too-large", "Photo too large", `the photo is ${Math.round(file.size / 1e6)} MB; the limit is ${Math.round(limits.maxPhotoBytes / 1e6)} MB`, {
        limit: limits.maxPhotoBytes,
      });
    }
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : nameFromFile(file.name);
    const id = crypto.randomUUID();
    let facts;
    try {
      facts = await ingestPhoto(Buffer.from(await file.arrayBuffer()), ctx.dataDir, id, limits);
    } catch (e) {
      removeHouseDir(ctx.dataDir, id);
      if (e instanceof NotAnImage) throw new ApiError(415, "not-a-photo", "Not a photo", e.message);
      throw e;
    }
    return c.json(createHouse(ctx.db, { id, name, ...facts }), 201);
  });

  app.get("/v1/houses/:id", input({ params: IdParams }), (c) => c.json(must(c.req.valid("param").id)));

  app.patch("/v1/houses/:id", input({ params: IdParams, body: HousePatch }), (c) => {
    must(c.req.valid("param").id);
    return c.json(renameHouse(ctx.db, c.req.valid("param").id, c.req.valid("json").name.trim()));
  });

  app.delete("/v1/houses/:id", input({ params: IdParams }), (c) => {
    const id = c.req.valid("param").id;
    must(id);
    deleteHouse(ctx.db, id);
    removeHouseDir(ctx.dataDir, id);
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
