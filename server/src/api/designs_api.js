// SPDX-License-Identifier: MIT
// /v1/houses/:id/designs and /v1/designs/:id — a house's saved color choices ({ part: paint }).

import { Hono, input } from "@delebash/core/platform";
import { ApiError, RequestValidationError } from "@delebash/core/platform/errors";
import { cleanName, cutToLength, nameKey, nameProblem } from "@delebash/core/platform/text";
import { designNotFound, houseNotFound } from "./refusals.js";

// a name another design of the house has: the name field's own error (a 422 lands under its field, §15)
const nameTaken = (name) => new RequestValidationError([{ loc: ["body", "name"], msg: `This house already has a design named “${name}”.`, type: "value_error.taken" }]);
import { createDesign, deleteDesign, getDesign, getHouse, listDesigns, listParts, updateDesign } from "../database/houses.js";
import { DesignCopyIn, DesignIn, DesignPatch, IdParams } from "../schemas/houses.js";
import { getState } from "../app_state.js";

/** A design's longest name — its schema's (DesignIn, DesignPatch: schemas/houses.js). */
const NAME_MAX = 60;

/** `ctx`: { db, maxDesignsPerHouse() } — the limit is a settings row. */
export function router(ctx = getState()) {
  const app = new Hono();
  const mustHouse = (id) => {
    if (!getHouse(ctx.db, id)) throw houseNotFound(id);
  };
  const mustDesign = (id) => {
    const d = getDesign(ctx.db, id);
    if (!d) throw designNotFound(id);
    return d;
  };
  // compared as a person sees them: composed, invisible characters ignored, any case (the kit's platform/text.js nameKey)
  const sameName = (houseId, name, except = null) => listDesigns(ctx.db, houseId).some((d) => d.id !== except && nameKey(d.name) === nameKey(name));
  /** The name kept (cleanName); one that shows nothing, or that its composed form made too long, refused as the
   *  schema refuses them. */
  const kept = (name) => {
    const clean = cleanName(name);
    const wrong = nameProblem(clean, NAME_MAX);
    if (wrong) throw new RequestValidationError([{ loc: ["body", "name"], ...wrong }]);
    return clean;
  };

  app.get("/v1/houses/:id/designs", input({ params: IdParams }), (c) => {
    mustHouse(c.req.valid("param").id);
    return c.json(listDesigns(ctx.db, c.req.valid("param").id));
  });

  const mustRoom = (houseId) => {
    if (listDesigns(ctx.db, houseId).length >= ctx.maxDesignsPerHouse()) {
      const n = ctx.maxDesignsPerHouse();
      throw new ApiError(409, "too-many-designs", "This house has all the designs it can keep", `a house keeps ${n} designs — delete one first, or raise the number in App Settings → General`);
    }
  };

  app.post("/v1/houses/:id/designs", input({ params: IdParams, body: DesignIn }), (c) => {
    const houseId = c.req.valid("param").id;
    mustHouse(houseId);
    const { name, colors } = c.req.valid("json");
    const clean = kept(name);
    if (sameName(houseId, clean)) throw nameTaken(clean);
    mustRoom(houseId);
    return c.json(createDesign(ctx.db, houseId, { name: clean, colors }), 201);
  });

  // A design used on another house (2026-10-28 — the front, the side and the back are three photos): its colors on
  // the parts that house paints, the ones it lacks named in `skipped`, under its name — or the next free "name (2)".
  app.post("/v1/designs/:id/copy", input({ params: IdParams, body: DesignCopyIn }), (c) => {
    const from = mustDesign(c.req.valid("param").id);
    const { houseId } = c.req.valid("json");
    mustHouse(houseId);
    mustRoom(houseId);
    const paints = new Set(listParts(ctx.db, houseId).filter((p) => p.paintable).map((p) => p.key));
    const colors = {};
    const skipped = [];
    for (const [key, paint] of Object.entries(from.colors || {})) {
      if (!paint) continue;
      if (paints.has(key)) colors[key] = paint;
      else skipped.push(key);
    }
    let name = from.name;
    for (let n = 2; sameName(houseId, name); n++) {
      const tail = ` (${n})`;
      name = `${cutToLength(from.name, NAME_MAX - tail.length)}${tail}`;
    }
    return c.json({ design: createDesign(ctx.db, houseId, { name, colors }), skipped }, 201);
  });

  app.patch("/v1/designs/:id", input({ params: IdParams, body: DesignPatch }), (c) => {
    const current = mustDesign(c.req.valid("param").id);
    const { name, colors } = c.req.valid("json");
    const clean = name === undefined ? undefined : kept(name);
    // a name kept as it is, or written another way, is never "taken" — a twin stored before the rule aside
    const renamed = clean !== undefined && nameKey(clean) !== nameKey(current.name);
    if (renamed && sameName(current.houseId, clean, current.id)) throw nameTaken(clean);
    return c.json(updateDesign(ctx.db, current.id, { name: clean, colors }));
  });

  app.delete("/v1/designs/:id", input({ params: IdParams }), (c) => {
    mustDesign(c.req.valid("param").id);
    deleteDesign(ctx.db, c.req.valid("param").id);
    return c.body(null, 204);
  });

  return app;
}
